/**
 * ログデータの処理を担当するクラス
 * ファイル読み込み、データ集計、フィルタリングなどの処理を行う
 */
class LogDataProcessor {
    constructor(settings = {}) {
        this.exchangeRate = settings.exchangeRate || 150;
        this.allLogEntries = [];
        this.allProjectsData = new Map();
        this.dailyUsageData = new Map();
        
        // 高速集計のためのプリキャッシュ
        this.precomputedAggregations = new Map();
    }

    /**
     * 設定を更新
     */
    updateSettings(settings) {
        this.exchangeRate = settings.exchangeRate || 150;
    }

    /**
     * 全プロジェクトのデータを読み込み
     */
    async loadAllProjectsData(projects, electronAPI) {
        this.allLogEntries = [];
        this.allProjectsData.clear();
        
        for (const project of projects) {
            try {
                const logEntries = await electronAPI.readProjectLogs(project.path);
                // プロジェクト名を各エントリに追加
                logEntries.forEach(entry => {
                    entry.projectName = project.name;
                });
                this.allLogEntries.push(...logEntries);
                this.allProjectsData.set(project.name, logEntries);
            } catch (error) {
                console.warn(`Failed to load data for project ${project.name}:`, error);
            }
        }

        // 時系列でソート
        this.allLogEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        return this.allLogEntries;
    }

    /**
     * 期間でデータをフィルタリング（UTC統一版）
     */
    filterDataByPeriod(period) {
        if (period === 'all') {
            return [...this.allLogEntries];
        }

        const now = new Date();
        let cutoffTime;
        
        switch (period) {
            case 'today':
                cutoffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                break;
            case 'week':
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - now.getDay());
                weekStart.setHours(0, 0, 0, 0);
                cutoffTime = weekStart.getTime();
                break;
            case 'month':
                cutoffTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                break;
            case 'year':
                cutoffTime = new Date(now.getFullYear(), 0, 1).getTime();
                break;
            default:
                cutoffTime = 0;
        }
        
        return this.allLogEntries.filter(entry => {
            if (!entry.timestamp) return false;
            const entryTime = new Date(entry.timestamp).getTime();
            return !isNaN(entryTime) && entryTime >= cutoffTime;
        });
    }


    /**
     * 統計を計算
     */
    calculateStats(entries) {
        return entries.reduce((acc, entry) => {
            // Only calculate stats for entries with usage data (excludes summary entries)
            if (entry.message && entry.message.usage) {
                acc.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                acc.costUSD += entry.costUSD || 0;
                acc.costJPY += (entry.costUSD || 0) * this.exchangeRate;
                acc.calls += 1;
            }
            return acc;
        }, { totalTokens: 0, costUSD: 0, costJPY: 0, calls: 0 });
    }

    /**
     * アクティブ時間を計算
     */
    calculateActiveHours(entries = null) {
        const targetEntries = entries || this.allLogEntries;
        if (targetEntries.length === 0) return 0;

        const dailyUsage = new Map();
        
        targetEntries.forEach(entry => {
            if (!entry.timestamp) return;
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return;
            
            const date = entryDate.toISOString().split('T')[0];
            const hour = entryDate.getUTCHours(); // UTC時間に統一
            
            if (!dailyUsage.has(date)) {
                dailyUsage.set(date, new Set());
            }
            dailyUsage.get(date).add(hour);
        });

        let totalHours = 0;
        for (const hours of dailyUsage.values()) {
            totalHours += hours.size;
        }

        return totalHours;
    }

    /**
     * 日別データ集計（高速版）
     */
    aggregateDataByDay(entries) {
        const dailyMap = new Map();

        // UTCベースの日付キー生成
        for (const entry of entries) {
            if (!entry.timestamp) continue;
            
            // UTC日付キーを取得
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            if (!date) continue;
            
            if (!dailyMap.has(date)) {
                dailyMap.set(date, {
                    date,
                    totalTokens: 0,
                    costUSD: 0,
                    costJPY: 0,
                    calls: 0
                });
            }

            const daily = dailyMap.get(date);
            if (entry.message && entry.message.usage) {
                daily.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
            }
            daily.costUSD += entry.costUSD || 0;
            daily.costJPY += (entry.costUSD || 0) * this.exchangeRate;
            daily.calls += 1;
        }

        const result = Array.from(dailyMap.values()).sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        return result;
    }

    /**
     * 時間別データ集計（高速版）
     */
    aggregateDataByHour(entries) {
        const hourlyData = new Array(24).fill(0);

        for (const entry of entries) {
            if (!entry.timestamp) continue;
            
            // UTC時間を取得
            const hour = new Date(entry.timestamp).getUTCHours();
            if (hour >= 0 && hour <= 23) {
                hourlyData[hour]++;
            }
        }

        return hourlyData;
    }

    /**
     * プロジェクト別データ集計（高速版）
     */
    aggregateDataByProject(entries) {
        const projectMap = new Map();

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const project = entry.projectName || 'Unknown';
            
            if (!projectMap.has(project)) {
                projectMap.set(project, {
                    project,
                    totalTokens: 0,
                    costUSD: 0,
                    calls: 0
                });
            }

            const projectData = projectMap.get(project);
            if (entry.message && entry.message.usage) {
                projectData.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
            }
            projectData.costUSD += entry.costUSD || 0;
            projectData.calls += 1;
        }

        const result = Array.from(projectMap.values())
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, 8); // 上位8プロジェクト
            
        return result;
    }

    /**
     * 週別データ集計
     */
    aggregateDataByWeek(entries) {
        const weeklyMap = new Map();

        entries.forEach(entry => {
            if (!entry.timestamp) return;
            const date = new Date(entry.timestamp);
            if (isNaN(date.getTime())) return;
            
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const weekKey = weekStart.toISOString().split('T')[0];

            if (!weeklyMap.has(weekKey)) {
                weeklyMap.set(weekKey, {
                    week: weekKey,
                    dailyTokens: new Array(7).fill(0),
                    totalTokens: 0
                });
            }

            const weekData = weeklyMap.get(weekKey);
            const dayOfWeek = date.getDay();
            
            if (entry.message && entry.message.usage) {
                const tokens = (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                weekData.dailyTokens[dayOfWeek] += tokens;
                weekData.totalTokens += tokens;
            }
        });

        return Array.from(weeklyMap.values())
            .sort((a, b) => new Date(a.week).getTime() - new Date(b.week).getTime())
            .slice(-4); // 最新4週間
    }

    /**
     * 日別使用量データを準備（最適化版）
     */
    prepareDailyUsageData() {
        console.time('prepareDailyUsageData');
        this.dailyUsageData.clear();
        
        // バッチ処理用の配列を事前確保
        const batchSize = 1000;
        const totalEntries = this.allLogEntries.length;
        console.log(`Processing ${totalEntries} entries in batches of ${batchSize}`);
        
        for (let i = 0; i < totalEntries; i += batchSize) {
            const batch = this.allLogEntries.slice(i, i + batchSize);
            this.processBatchForDailyUsage(batch);
            
            // 大量データの場合は進捗をログ出力
            if (totalEntries > 5000 && i % (batchSize * 5) === 0) {
                console.log(`Processed ${i + batch.length}/${totalEntries} entries`);
            }
        }

        // アクティブ時間数を計算
        for (const daily of this.dailyUsageData.values()) {
            daily.activeHoursCount = daily.activeHours.size;
        }
        
        console.timeEnd('prepareDailyUsageData');
        return this.dailyUsageData;
    }


    /**
     * 日別使用量データを取得
     */
    getDailyUsageData() {
        return this.dailyUsageData;
    }

    /**
     * バッチ処理で日別使用量データを処理
     */
    processBatchForDailyUsage(batch) {
        batch.forEach(entry => {
            // Skip entries without valid timestamp
            if (!entry.timestamp) return;
            
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return; // Skip invalid dates
            
            // UTC日付キーを使用
            const date = entryDate.toISOString().split('T')[0];
            if (!date) return;
            
            if (!this.dailyUsageData.has(date)) {
                this.dailyUsageData.set(date, {
                    date,
                    totalTokens: 0,
                    costUSD: 0,
                    costJPY: 0,
                    calls: 0,
                    activeHours: new Set(),
                    projects: new Set(),
                    hourlyUsage: new Array(24).fill(0)
                });
            }

            const daily = this.dailyUsageData.get(date);
            const hour = entryDate.getUTCHours();
            
            if (entry.message && entry.message.usage) {
                const tokens = (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                daily.totalTokens += tokens;
                if (hour >= 0 && hour <= 23) {
                    daily.hourlyUsage[hour] += tokens;
                }
            }
            daily.costUSD += entry.costUSD || 0;
            daily.costJPY += (entry.costUSD || 0) * this.exchangeRate;
            daily.calls += 1;
            if (hour >= 0 && hour <= 23) {
                daily.activeHours.add(hour);
            }
            if (entry.projectName) {
                daily.projects.add(entry.projectName);
            }
        });
    }


    /**
     * 使用量レベルを計算（カレンダー用）
     */
    getUsageLevel(tokens) {
        if (tokens === 0) return 0;
        
        // 全データから最大値を取得してレベルを計算
        const maxTokens = Math.max(...Array.from(this.dailyUsageData.values()).map(d => d.totalTokens));
        if (maxTokens === 0) return 0;
        
        const ratio = tokens / maxTokens;
        if (ratio <= 0.2) return 1;
        if (ratio <= 0.4) return 2;
        if (ratio <= 0.7) return 3;
        return 4;
    }

    /**
     * トークン数をフォーマット（カレンダー用）
     */
    formatTokens(tokens) {
        if (tokens >= 10000) {
            return `${Math.round(tokens / 1000)}k`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}k`;
        }
        return tokens.toString();
    }

    /**
     * 特定時間範囲のデータを取得（ミニモード用）
     */
    getTimeRangeEntries(timeRange) {
        const now = new Date();
        const milliseconds = this.parseTimeRange(timeRange);
        const endTime = new Date(now.getTime() - milliseconds);
        
        return this.allLogEntries.filter(entry => {
            if (!entry.timestamp) return false;
            const entryTime = new Date(entry.timestamp);
            if (isNaN(entryTime.getTime())) return false;
            return entryTime >= endTime && entryTime <= now;
        });
    }

    /**
     * 時間範囲文字列をミリ秒に変換
     */
    parseTimeRange(timeRange) {
        if (timeRange.endsWith('m')) {
            const minutes = parseInt(timeRange.replace('m', ''));
            return minutes * 60 * 1000;
        } else {
            const hours = parseInt(timeRange);
            return hours * 60 * 60 * 1000;
        }
    }

    /**
     * ミニモード用統計を計算
     */
    getMiniModeStats(timeRange) {
        const timeRangeEntries = this.getTimeRangeEntries(timeRange);
        
        // 統計を計算
        let totalTokens = 0;
        let totalCostJPY = 0;
        const uniqueHours = new Set();
        
        timeRangeEntries.forEach(entry => {
            if (entry.message?.usage) {
                const inputTokens = entry.message.usage.input_tokens || 0;
                const outputTokens = entry.message.usage.output_tokens || 0;
                totalTokens += inputTokens + outputTokens;
            }
            if (entry.costUSD) {
                totalCostJPY += entry.costUSD * this.exchangeRate;
            }
            
            // 使用時間の計算（時間単位に応じて調整）
            if (entry.timestamp) {
                const entryTime = new Date(entry.timestamp);
                if (!isNaN(entryTime.getTime())) {
                    const timeBlock = this.calculateTimeBlock(entryTime, timeRange);
                    uniqueHours.add(timeBlock);
                }
            }
        });
        
        return {
            tokens: totalTokens,
            cost: totalCostJPY,
            hours: this.calculateDisplayHours(uniqueHours.size, timeRange)
        };
    }

    /**
     * 時間ブロック計算（ミニモード用）
     */
    calculateTimeBlock(time, timeRange) {
        // 時間範囲に応じて適切な時間ブロックを生成
        if (timeRange === '10m') {
            // 10分範囲：1分単位
            return time.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
        } else if (timeRange === '30m') {
            // 30分範囲：2分単位
            const minutes = Math.floor(time.getMinutes() / 2) * 2;
            return time.toISOString().slice(0, 13) + ':' + minutes.toString().padStart(2, '0');
        } else if (timeRange === '60m') {
            // 60分範囲：5分単位
            const minutes = Math.floor(time.getMinutes() / 5) * 5;
            return time.toISOString().slice(0, 13) + ':' + minutes.toString().padStart(2, '0');
        } else if (timeRange == 3) {
            // 3時間：10分単位
            const minutes = Math.floor(time.getMinutes() / 10) * 10;
            return time.toISOString().slice(0, 13) + ':' + minutes.toString().padStart(2, '0');
        } else if (timeRange == 6) {
            // 6時間：15分単位
            const minutes = Math.floor(time.getMinutes() / 15) * 15;
            return time.toISOString().slice(0, 13) + ':' + minutes.toString().padStart(2, '0');
        } else if (timeRange == 12) {
            // 12時間：30分単位
            const minutes = Math.floor(time.getMinutes() / 30) * 30;
            return time.toISOString().slice(0, 13) + ':' + minutes.toString().padStart(2, '0');
        } else {
            // 24時間：1時間単位
            return time.toISOString().slice(0, 13);
        }
    }

    /**
     * 表示用時間計算（ミニモード用）
     */
    calculateDisplayHours(blockCount, timeRange) {
        if (timeRange === '10m') {
            // 1分単位 → 時間
            return blockCount / 60;
        } else if (timeRange === '30m') {
            // 2分単位 → 時間
            return blockCount * 2 / 60;
        } else if (timeRange === '60m') {
            // 5分単位 → 時間
            return blockCount * 5 / 60;
        } else if (timeRange == 3) {
            // 10分単位 → 時間
            return blockCount * 10 / 60;
        } else if (timeRange == 6) {
            // 15分単位 → 時間
            return blockCount * 15 / 60;
        } else if (timeRange == 12) {
            // 30分単位 → 時間
            return blockCount * 30 / 60;
        } else {
            // 1時間単位
            return blockCount;
        }
    }

    /**
     * ミニチャート設定を取得
     */
    getMiniChartConfig(timeRange) {
        // 時間範囲に応じてチャート設定を返す
        if (timeRange === '10m') {
            return { pointCount: 10, intervalMinutes: 1 }; // 10分、1分間隔
        } else if (timeRange === '30m') {
            return { pointCount: 15, intervalMinutes: 2 }; // 30分、2分間隔
        } else if (timeRange === '60m') {
            return { pointCount: 12, intervalMinutes: 5 }; // 60分、5分間隔
        } else if (timeRange == 3) {
            return { pointCount: 18, intervalMinutes: 10 }; // 3時間、10分間隔
        } else if (timeRange == 6) {
            return { pointCount: 24, intervalMinutes: 15 }; // 6時間、15分間隔
        } else if (timeRange == 12) {
            return { pointCount: 24, intervalMinutes: 30 }; // 12時間、30分間隔
        } else { // 24時間
            return { pointCount: 24, intervalMinutes: 60 }; // 24時間、1時間間隔
        }
    }

    /**
     * 特定時間ブロックのトークン数を取得（ミニモード用）
     */
    getTokensForTimeBlock(time, timeRange) {
        const entries = this.getTimeRangeEntries(timeRange);
        const blockStart = new Date(time);
        let blockEnd;
        
        if (timeRange === '10m') {
            blockEnd = new Date(blockStart.getTime() + 60 * 1000); // 1分間隔
        } else if (timeRange === '30m') {
            blockEnd = new Date(blockStart.getTime() + 2 * 60 * 1000); // 2分間隔
        } else if (timeRange === '60m') {
            blockEnd = new Date(blockStart.getTime() + 5 * 60 * 1000); // 5分間隔
        } else {
            blockEnd = new Date(blockStart.getTime() + 60 * 60 * 1000); // 1時間間隔
        }
        
        let tokens = 0;
        entries.forEach(entry => {
            const entryTime = new Date(entry.timestamp);
            if (entryTime >= blockStart && entryTime < blockEnd && entry.message?.usage) {
                tokens += (entry.message.usage.input_tokens || 0) + 
                         (entry.message.usage.output_tokens || 0);
            }
        });
        
        return tokens;
    }

    /**
     * メッセージ統計を計算
     */
    calculateMessageStats(entries = null) {
        const targetEntries = entries || this.allLogEntries;
        let userMessages = 0;
        let assistantMessages = 0;
        
        targetEntries.forEach(entry => {
            if (entry.type === 'user') {
                userMessages++;
            } else if (entry.type === 'assistant') {
                assistantMessages++;
            }
        });
        
        return { userMessages, assistantMessages };
    }


    /**
     * 全データを取得
     */
    getAllLogEntries() {
        return this.allLogEntries;
    }

    /**
     * 日別使用量データを取得
     */
    getDailyUsageData() {
        return this.dailyUsageData;
    }

    /**
     * プロジェクトデータを取得
     */
    getAllProjectsData() {
        return this.allProjectsData;
    }

    /**
     * 特定時間ブロックのトークン数を取得
     */
    getTokensForTimeBlock(time, timeRange) {
        const timeBlock = this.calculateTimeBlock(time, timeRange);
        
        let tokens = 0;
        this.allLogEntries.forEach(entry => {
            // Skip entries without valid timestamp
            if (!entry.timestamp) return;
            
            const entryTime = new Date(entry.timestamp);
            if (isNaN(entryTime.getTime())) return; // Skip invalid dates
            
            const entryTimeBlock = this.calculateTimeBlock(entryTime, timeRange);
            
            if (entryTimeBlock === timeBlock) {
                if (entry.message?.usage) {
                    tokens += (entry.message.usage.input_tokens || 0) + 
                             (entry.message.usage.output_tokens || 0);
                }
            }
        });
        
        return tokens;
    }

    /**
     * ミニチャートの設定を取得
     */
    getMiniChartConfig(timeRange) {
        // 時間範囲に応じてチャート設定を返す
        if (timeRange === '10m') {
            return { pointCount: 10, intervalMinutes: 1 }; // 10分、1分間隔
        } else if (timeRange === '30m') {
            return { pointCount: 15, intervalMinutes: 2 }; // 30分、2分間隔
        } else if (timeRange === '60m') {
            return { pointCount: 12, intervalMinutes: 5 }; // 60分、5分間隔
        } else if (timeRange == 3) {
            return { pointCount: 18, intervalMinutes: 10 }; // 3時間、10分間隔
        } else if (timeRange == 6) {
            return { pointCount: 24, intervalMinutes: 15 }; // 6時間、15分間隔
        } else if (timeRange == 12) {
            return { pointCount: 24, intervalMinutes: 30 }; // 12時間、30分間隔
        } else { // 24時間
            return { pointCount: 24, intervalMinutes: 60 }; // 24時間、1時間間隔
        }
    }

    /**
     * ミニチャート時間フォーマット（ミニモード用）
     */
    formatMiniChartTime(time, timeRange) {
        if (timeRange === '10m' || timeRange === '30m' || timeRange === '60m') {
            // 分単位の場合は秒も表示
            const minutes = this.getRoundedMinutes(time, timeRange);
            return time.getHours().toString().padStart(2, '0') + ':' + 
                   minutes.toString().padStart(2, '0');
        } else if (timeRange == 24) {
            return time.getHours().toString().padStart(2, '0') + ':00';
        } else {
            const minutes = this.getRoundedMinutes(time, timeRange);
            return time.getHours().toString().padStart(2, '0') + ':' + 
                   minutes.toString().padStart(2, '0');
        }
    }

    /**
     * 時間範囲に応じた分数を取得（ミニモード用）
     */
    getRoundedMinutes(time, timeRange) {
        if (timeRange === '10m') {
            return time.getMinutes();
        } else if (timeRange === '30m') {
            return Math.floor(time.getMinutes() / 2) * 2;
        } else if (timeRange === '60m') {
            return Math.floor(time.getMinutes() / 5) * 5;
        } else if (timeRange == 3) {
            return Math.floor(time.getMinutes() / 10) * 10;
        } else if (timeRange == 6) {
            return Math.floor(time.getMinutes() / 15) * 15;
        } else if (timeRange == 12) {
            return Math.floor(time.getMinutes() / 30) * 30;
        } else {
            return 0;
        }
    }
}