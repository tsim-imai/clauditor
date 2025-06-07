/**
 * DuckDBデータプロセッサー
 * 高速JSONLファイル処理とSQL集計機能を提供
 */
class DuckDBDataProcessor {
    constructor() {
        this.cache = new Map();
        this.cacheTime = 30000; // 30秒キャッシュ
        // ユーザーのホームディレクトリを取得してフルパスに変換
        this.projectsPath = this.getProjectsPath();
    }

    /**
     * プロジェクトパスをフルパスで取得
     */
    getProjectsPath() {
        // Electronから設定を取得（設定があれば）
        const settings = JSON.parse(localStorage.getItem('clauditor-settings') || '{}');
        if (settings.customProjectPath) {
            return settings.customProjectPath;
        }
        
        // デフォルトパス：DuckDBで~記法を使用（DuckDBが内部でホームディレクトリに展開）
        return '~/.claude/projects';
    }

    /**
     * DuckDBクエリを実行してデータを取得
     */
    async executeDuckDBQuery(query) {
        try {
            const result = await window.electronAPI.executeDuckDBQuery(query);
            return result;
        } catch (error) {
            console.error('DuckDB クエリエラー:', error);
            throw error;
        }
    }

    /**
     * 期間フィルター用の開始日を取得
     */
    getStartDate(period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        switch (period) {
            case 'today':
                return today.toISOString();
            case 'week':
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay()); // 日曜日開始
                return weekStart.toISOString();
            case 'month':
                return new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
            case 'year':
                return new Date(today.getFullYear(), 0, 1).toISOString();
            case 'all':
            default:
                return '1970-01-01T00:00:00.000Z'; // Unix epoch
        }
    }

    /**
     * 期間統計を取得（Chart.js互換データ）
     */
    async getChartCompatibleData(period) {
        const cacheKey = `chart:${period}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTime) {
            console.log(`🚀 DuckDB Cache hit: ${cacheKey}`);
            return cached.data;
        }

        console.time('🚀 DuckDB Query Execution');
        
        try {
            const startDate = this.getStartDate(period);
            
            // 日別データクエリ（test.shパターン）
            const dailyQuery = `
                SELECT 
                    DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as date,
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as input_tokens,
                    SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as output_tokens,
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                        CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                    SUM(COALESCE(costUSD, 0)) as cost_usd,
                    COUNT(*) as entries
                FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startDate}'
                GROUP BY DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
                ORDER BY date DESC
            `;

            // 時間別データクエリ
            const hourlyQuery = `
                SELECT 
                    HOUR(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as hour,
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                        CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens
                FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startDate}'
                GROUP BY HOUR(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
                ORDER BY hour
            `;

            // プロジェクト別データクエリ
            const projectQuery = `
                SELECT 
                    regexp_extract(filename, '.*/([^/]+)/[^/]*\\.jsonl$', 1) as project_name,
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                        CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                    SUM(COALESCE(costUSD, 0)) as cost_usd,
                    COUNT(*) as entries
                FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true, filename=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startDate}'
                  AND regexp_extract(filename, '.*/([^/]+)/[^/]*\\.jsonl$', 1) IS NOT NULL
                GROUP BY regexp_extract(filename, '.*/([^/]+)/[^/]*\\.jsonl$', 1)
                ORDER BY total_tokens DESC
                LIMIT 8
            `;

            // 全体統計クエリ
            const statsQuery = `
                SELECT 
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as total_input_tokens,
                    SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_output_tokens,
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                        CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                    SUM(COALESCE(costUSD, 0)) as total_cost_usd,
                    COUNT(*) as total_entries,
                    COUNT(DISTINCT DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')) as active_days,
                    EXTRACT(EPOCH FROM (MAX(timestamp::TIMESTAMP) - MIN(timestamp::TIMESTAMP))) / 3600.0 as active_hours
                FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startDate}'
            `;

            // 並列クエリ実行
            const [dailyData, hourlyData, projectData, statsData] = await Promise.all([
                this.executeDuckDBQuery(dailyQuery),
                this.executeDuckDBQuery(hourlyQuery),
                this.executeDuckDBQuery(projectQuery),
                this.executeDuckDBQuery(statsQuery)
            ]);

            // データを処理してChart.js互換形式に変換
            const chartData = this.formatChartData(dailyData, hourlyData, projectData, statsData[0]);
            
            // キャッシュに保存
            this.cache.set(cacheKey, { data: chartData, timestamp: Date.now() });
            
            console.timeEnd('🚀 DuckDB Query Execution');
            console.log(`📊 DuckDB処理完了: ${dailyData.length}日分, ${projectData.length}プロジェクト`);
            
            return chartData;
            
        } catch (error) {
            console.error('DuckDB データ取得エラー:', error);
            console.timeEnd('🚀 DuckDB Query Execution');
            throw error;
        }
    }

    /**
     * データをChart.js互換形式にフォーマット
     */
    formatChartData(dailyData, hourlyData, projectData, stats) {
        // 24時間の配列を初期化（0-23時）
        const hourlyTokens = new Array(24).fill(0);
        hourlyData.forEach(row => {
            if (row.hour >= 0 && row.hour <= 23) {
                hourlyTokens[row.hour] = row.total_tokens || 0;
            }
        });

        // 日別データの処理
        const dailyLabels = dailyData.map(row => row.date);
        const dailyTokens = dailyData.map(row => row.total_tokens || 0);
        const dailyCosts = dailyData.map(row => (row.cost_usd || 0) * 150); // USD to JPY

        // プロジェクト別データの処理
        const projectLabels = projectData.map(row => row.project_name || 'Unknown');
        const projectTokens = projectData.map(row => row.total_tokens || 0);

        // 統計データの処理
        const totalStats = {
            totalTokens: stats.total_tokens || 0,
            inputTokens: stats.total_input_tokens || 0,
            outputTokens: stats.total_output_tokens || 0,
            totalCostUSD: stats.total_cost_usd || 0,
            totalCostJPY: (stats.total_cost_usd || 0) * 150,
            totalEntries: stats.total_entries || 0,
            activeHours: Math.round((stats.active_hours || 0) * 10) / 10,
            activeDays: stats.active_days || 0
        };

        return {
            // Chart.js用の日別データ
            dailyData: dailyTokens,
            dailyLabels: dailyLabels,
            dailyCosts: dailyCosts,
            
            // Chart.js用の時間別データ
            hourlyData: hourlyTokens,
            
            // Chart.js用のプロジェクトデータ
            projectData: projectTokens,
            projectLabels: projectLabels,
            
            // 統計データ
            stats: totalStats,
            
            // 生データ（デバッグ用）
            rawData: {
                daily: dailyData,
                hourly: hourlyData,
                projects: projectData,
                stats: stats
            }
        };
    }

    /**
     * 期間統計を取得（既存APIとの互換性維持）
     */
    async getPeriodStats(period) {
        const chartData = await this.getChartCompatibleData(period);
        return {
            totalTokens: chartData.stats.totalTokens,
            inputTokens: chartData.stats.inputTokens,
            outputTokens: chartData.stats.outputTokens,
            costUSD: chartData.stats.totalCostUSD,
            costJPY: chartData.stats.totalCostJPY,
            entries: chartData.stats.totalEntries,
            activeHours: chartData.stats.activeHours
        };
    }

    /**
     * ファイル変更時にキャッシュをクリア
     */
    clearCache() {
        console.log('🧹 DuckDB キャッシュクリア');
        this.cache.clear();
    }

    /**
     * パターンに基づいてキャッシュをクリア
     */
    clearCachePattern(pattern) {
        console.log(`🧹 DuckDB キャッシュクリア (パターン: ${pattern})`);
        for (const [key] of this.cache) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * コスト推定（レガシーサポート）
     */
    estimateCost(inputTokens, outputTokens) {
        // Claude-3.5-Sonnet料金想定
        const inputCostPer1K = 0.003; // $0.003 per 1K input tokens
        const outputCostPer1K = 0.015; // $0.015 per 1K output tokens
        
        const inputCost = (inputTokens / 1000) * inputCostPer1K;
        const outputCost = (outputTokens / 1000) * outputCostPer1K;
        const totalUSD = inputCost + outputCost;
        
        return {
            usd: totalUSD,
            jpy: totalUSD * 150 // USD to JPY
        };
    }
}