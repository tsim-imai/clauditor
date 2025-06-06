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
                                entries: 0
                            });
                        }
                        
                        const dayData = dailyStats.get(dateKey);
                        dayData.entries++;
                        
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
     * 特定期間の統計を取得
     */
    async getPeriodStats(period) {
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
     * 実際のアクティブ時間を計算（タイムスタンプ範囲ベース）
     */
    async calculateActualActiveHours(period) {
        try {
            const allStats = await this.calculateAllDailyStats();
            const now = new Date();
            let startDate;
            
            // 期間の開始日を計算
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
                    // 'all' の場合は全期間のタイムスタンプを取得
                    return await this.calculateAllPeriodActiveHours();
            }
            
            // 期間内の全エントリのタイムスタンプを収集
            const allProjects = await window.electronAPI.scanClaudeProjects();
            const timestamps = [];
            
            for (const project of allProjects) {
                const logEntries = await window.electronAPI.readProjectLogs(project.path);
                
                for (const entry of logEntries) {
                    if (!entry.timestamp) continue;
                    
                    const entryDate = new Date(entry.timestamp);
                    
                    // 期間内のエントリのみ対象
                    if (period === 'all' || entryDate >= startDate) {
                        timestamps.push(entryDate);
                    }
                }
            }
            
            // タイムスタンプをソート
            timestamps.sort((a, b) => a - b);
            
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
            
            // 最小値のみ設定（0時間未満にならないよう）
            return Math.max(actualHours, 0.1);
            
        } catch (error) {
            console.error('アクティブ時間計算エラー:', error);
            return 0;
        }
    }
    
    /**
     * 全期間のアクティブ時間を計算
     */
    async calculateAllPeriodActiveHours() {
        try {
            const allProjects = await window.electronAPI.scanClaudeProjects();
            const timestamps = [];
            
            for (const project of allProjects) {
                const logEntries = await window.electronAPI.readProjectLogs(project.path);
                
                for (const entry of logEntries) {
                    if (entry.timestamp) {
                        timestamps.push(new Date(entry.timestamp));
                    }
                }
            }
            
            timestamps.sort((a, b) => a - b);
            
            if (timestamps.length <= 1) {
                return timestamps.length * 0.1;
            }
            
            const firstTime = timestamps[0];
            const lastTime = timestamps[timestamps.length - 1];
            const totalDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);
            
            // 全期間の場合は日数ベースで現実的な時間を推定
            // 平均的な1日あたりの使用時間を3時間と仮定
            return Math.min(totalDays * 3, (lastTime - firstTime) / (1000 * 60 * 60));
            
        } catch (error) {
            console.error('全期間アクティブ時間計算エラー:', error);
            return 0;
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