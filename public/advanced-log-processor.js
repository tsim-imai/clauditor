/**
 * 高速化されたログプロセッサー（全ファイル対応）
 */
class AdvancedLogDataProcessor {
    constructor(settings = {}) {
        this.exchangeRate = settings.exchangeRate || 150;
        this.dailyStatsCache = new Map();
        this.lastCacheUpdate = null;
        this.cacheTTL = 5 * 60 * 1000; // 5分間キャッシュ
        console.log('🚀 AdvancedLogDataProcessor initialized');
    }

    /**
     * 全プロジェクトの日別統計を計算（高速版）
     */
    async calculateAllDailyStats() {
        // キャッシュチェック
        if (this.lastCacheUpdate && 
            Date.now() - this.lastCacheUpdate < this.cacheTTL) {
            return this.dailyStatsCache;
        }

        console.time('全ファイル処理');
        const dailyStats = new Map();
        
        try {
            // Electron APIで全JSONLファイルを取得
            const allProjects = await window.electronAPI.scanClaudeProjects();
            let totalProcessed = 0;
            
            for (const project of allProjects) {
                const logEntries = await window.electronAPI.readProjectLogs(project.path);
                
                for (const entry of logEntries) {
                    try {
                        if (!entry.timestamp) continue;
                        
                        // ローカル日付キーを生成
                        const entryDate = new Date(entry.timestamp);
                        const year = entryDate.getFullYear();
                        const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = entryDate.getDate().toString().padStart(2, '0');
                        const dateKey = `${year}-${month}-${day}`;
                        
                        if (!dailyStats.has(dateKey)) {
                            dailyStats.set(dateKey, {
                                date: dateKey,
                                inputTokens: 0,
                                outputTokens: 0,
                                costUSD: 0,
                                costJPY: 0,
                                entries: 0,
                                firstTimestamp: entryDate,
                                lastTimestamp: entryDate
                            });
                        }
                        
                        const dayData = dailyStats.get(dateKey);
                        dayData.entries++;
                        
                        // 最初と最後のタイムスタンプを更新
                        if (entryDate < dayData.firstTimestamp) {
                            dayData.firstTimestamp = entryDate;
                        }
                        if (entryDate > dayData.lastTimestamp) {
                            dayData.lastTimestamp = entryDate;
                        }
                        
                        // usageデータ処理
                        if (entry.message?.usage) {
                            dayData.inputTokens += entry.message.usage.input_tokens || 0;
                            dayData.outputTokens += entry.message.usage.output_tokens || 0;
                        }
                        
                        // コストデータ処理
                        if (entry.costUSD) {
                            dayData.costUSD += entry.costUSD;
                            dayData.costJPY += entry.costUSD * this.exchangeRate;
                        }
                        
                        totalProcessed++;
                    } catch (error) {
                        // エラーは無視して続行
                        continue;
                    }
                }
            }
            
            console.log(`✅ ${totalProcessed.toLocaleString()}エントリを処理完了`);
            
        } catch (error) {
            console.error('統計計算エラー:', error);
        }
        
        console.timeEnd('全ファイル処理');
        
        // キャッシュ更新
        this.dailyStatsCache = dailyStats;
        this.lastCacheUpdate = Date.now();
        
        return dailyStats;
    }

    /**
     * 特定期間の統計を取得（高速メモリ内フィルタリング）
     */
    async getPeriodStats(period) {
        // キャッシュされた全統計データを取得（ファイルI/Oは必要時のみ）
        const allStats = await this.calculateAllDailyStats();
        
        // メモリ内で期間フィルタリングのみ実行
        return this.filterStatsByPeriod(allStats, period);
    }
    
    /**
     * メモリ内期間フィルタリング（ファイルI/O一切なし）
     */
    filterStatsByPeriod(allStats, period) {
        const now = new Date();
        let startDate;
        
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                // 'all' の場合は全期間
                return this.aggregateStats(Array.from(allStats.values()));
        }
        
        const filteredStats = Array.from(allStats.values()).filter(stat => {
            const statDate = new Date(stat.date);
            return statDate >= startDate;
        });
        
        return this.aggregateStats(filteredStats);
    }

    /**
     * 統計データを集計
     */
    aggregateStats(statsArray) {
        return statsArray.reduce((acc, stat) => {
            acc.totalTokens += stat.inputTokens + stat.outputTokens;
            acc.inputTokens += stat.inputTokens;
            acc.outputTokens += stat.outputTokens;
            acc.costUSD += stat.costUSD;
            acc.costJPY += stat.costJPY;
            acc.entries += stat.entries;
            return acc;
        }, {
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUSD: 0,
            costJPY: 0,
            entries: 0
        });
    }

    /**
     * 日別統計を表形式で取得（Clauditor UI用）
     */
    async getDailyStatsTable() {
        const allStats = await this.calculateAllDailyStats();
        
        return Array.from(allStats.values())
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 30) // 最新30日間
            .map(stat => ({
                date: stat.date,
                dateFormatted: new Date(stat.date).toLocaleDateString('ja-JP'),
                inputTokens: stat.inputTokens,
                outputTokens: stat.outputTokens,
                totalTokens: stat.inputTokens + stat.outputTokens,
                costJPY: Math.round(stat.costJPY),
                hasRealCost: stat.costUSD > 0
            }));
    }

    /**
     * コスト推定（実際のコストデータがない場合）
     */
    estimateCost(inputTokens, outputTokens) {
        const INPUT_COST_PER_1K = 0.003;  // $3.00 per 1K input tokens
        const OUTPUT_COST_PER_1K = 0.015; // $15.00 per 1K output tokens
        
        const estimatedUSD = (inputTokens / 1000 * INPUT_COST_PER_1K) + 
                            (outputTokens / 1000 * OUTPUT_COST_PER_1K);
        
        return {
            usd: estimatedUSD,
            jpy: estimatedUSD * this.exchangeRate
        };
    }

    /**
     * 実際のアクティブ時間を計算（高速メモリ内処理）
     */
    async calculateActualActiveHours(period) {
        try {
            // 全統計データを取得（キャッシュ利用）
            const allStats = await this.calculateAllDailyStats();
            
            if (period === 'all') {
                return await this.calculateAllPeriodActiveHours();
            }
            
            // メモリ内で期間フィルタリングして日付範囲を取得
            const periodStats = this.filterStatsByPeriod(allStats, period);
            
            if (periodStats.entries === 0) {
                return 0;
            }
            
            if (periodStats.entries === 1) {
                return 0.1; // 単発の場合は6分と仮定
            }
            
            // 期間内の日付から時間スパンを推定
            const now = new Date();
            let startDate;
            
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - now.getDay());
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    return 0;
            }
            
            // 実際のタイムスタンプ範囲から計算するため、キャッシュからタイムスタンプを取得
            const timestamps = await this.getTimestampsForPeriod(period);
            
            if (timestamps.length === 0) {
                return 0;
            }
            
            if (timestamps.length === 1) {
                return 0.1; // 単発の場合は6分と仮定
            }
            
            // 最初と最後のタイムスタンプから実際の使用時間を計算
            const firstTime = timestamps[0];
            const lastTime = timestamps[timestamps.length - 1];
            const actualHours = (lastTime - firstTime) / (1000 * 60 * 60);
            
            return Math.max(actualHours, 0.1);
            
        } catch (error) {
            console.error('アクティブ時間計算エラー:', error);
            return 0;
        }
    }
    
    /**
     * 全期間のアクティブ時間を計算（キャッシュ利用）
     */
    async calculateAllPeriodActiveHours() {
        try {
            // キャッシュを利用して全期間のタイムスタンプを取得
            const timestamps = await this.getAllTimestamps();
            
            if (timestamps.length <= 1) {
                return timestamps.length * 0.1;
            }
            
            const firstTime = timestamps[0];
            const lastTime = timestamps[timestamps.length - 1];
            
            // 全期間も実際のタイムスタンプ範囲から計算
            const actualHours = (lastTime - firstTime) / (1000 * 60 * 60);
            return Math.max(actualHours, 0.1);
            
        } catch (error) {
            console.error('全期間アクティブ時間計算エラー:', error);
            return 0;
        }
    }

    /**
     * 期間内のタイムスタンプを取得（キャッシュ利用）
     */
    async getTimestampsForPeriod(period) {
        try {
            // キャッシュされた全統計データを取得（ファイル読み込み回避）
            const allStats = await this.calculateAllDailyStats();
            const now = new Date();
            let startDate;
            
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - now.getDay());
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    // 全期間の場合は別メソッド
                    return await this.getAllTimestamps();
            }
            
            // キャッシュされた日別統計から期間内の精密タイムスタンプを抽出
            const timestamps = [];
            
            Array.from(allStats.values())
                .filter(stat => {
                    const statDate = new Date(stat.date);
                    return statDate >= startDate && statDate <= now;
                })
                .forEach(stat => {
                    // 各日の最初と最後のタイムスタンプを追加
                    timestamps.push(stat.firstTimestamp);
                    if (stat.firstTimestamp.getTime() !== stat.lastTimestamp.getTime()) {
                        timestamps.push(stat.lastTimestamp);
                    }
                });
            
            // タイムスタンプをソート
            timestamps.sort((a, b) => a - b);
            return timestamps;
            
        } catch (error) {
            console.error('期間タイムスタンプ取得エラー:', error);
            return [];
        }
    }
    
    /**
     * 全期間のタイムスタンプを取得（キャッシュ利用）
     */
    async getAllTimestamps() {
        try {
            // キャッシュされた全統計データを取得（ファイル読み込み回避）
            const allStats = await this.calculateAllDailyStats();
            
            // 日別統計から全期間の精密タイムスタンプを抽出
            const timestamps = [];
            
            Array.from(allStats.values())
                .forEach(stat => {
                    // 各日の最初と最後のタイムスタンプを追加
                    timestamps.push(stat.firstTimestamp);
                    if (stat.firstTimestamp.getTime() !== stat.lastTimestamp.getTime()) {
                        timestamps.push(stat.lastTimestamp);
                    }
                });
            
            timestamps.sort((a, b) => a - b);
            return timestamps;
            
        } catch (error) {
            console.error('全タイムスタンプ取得エラー:', error);
            return [];
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.dailyStatsCache.clear();
        this.lastCacheUpdate = null;
    }
}