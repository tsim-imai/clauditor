/**
 * DuckDBデータプロセッサー
 * 高速JSONLファイル処理とSQL集計機能を提供
 */
class DuckDBDataProcessor {
    constructor() {
        this.cache = new Map();
        this.cacheTime = 30000; // 30秒キャッシュ
        this.fastCache = new Map(); // 高速キャッシュ（期間フィルタリング用）
        this.fastCacheTime = 5000; // 5秒キャッシュ（期間変更の高頻度対応）
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
     * 期間に応じた適切な集計単位を決定
     */
    async getAggregationUnit(period) {
        switch (period) {
            case 'today':
                return 'hourly'; // 時間別（00:00-23:59）
            case 'week':
            case 'month':
                return 'daily'; // 日別
            case 'year':
                return 'monthly'; // 月別
            case 'all':
                return await this.determineAutoAggregation(); // 動的判定
            default:
                return 'daily';
        }
    }

    /**
     * 全期間の自動集計単位決定
     */
    async determineAutoAggregation() {
        try {
            // データの期間範囲を取得
            const rangeQuery = `
                SELECT 
                    MIN(DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')) as min_date,
                    MAX(DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')) as max_date,
                    COUNT(DISTINCT DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')) as total_days
                FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL
            `;
            
            const result = await this.executeDuckDBQuery(rangeQuery);
            if (!result || result.length === 0) {
                return 'daily';
            }
            
            const { min_date, max_date, total_days } = result[0];
            
            if (!min_date || !max_date) {
                return 'daily';
            }
            
            // 期間に応じて集計単位を決定
            const daysDiff = total_days || 0;
            
            if (daysDiff <= 31) {
                return 'daily'; // 1ヶ月以下は日別
            } else if (daysDiff <= 365) {
                return 'daily'; // 1年以下も日別（月別だと少なすぎる）
            } else {
                return 'monthly'; // 1年超は月別
            }
            
        } catch (error) {
            console.warn('自動集計単位決定でエラー:', error);
            return 'daily'; // エラー時はデフォルト
        }
    }

    /**
     * 集計単位に応じたクエリを生成
     */
    generateTimeSeriesQuery(period, unit, startDate) {
        const baseWhere = `WHERE timestamp IS NOT NULL AND timestamp >= '${startDate}'`;
        
        switch (unit) {
            case 'hourly':
                return `
                    SELECT 
                        HOUR(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as time_unit,
                        DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as date,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as input_tokens,
                        SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as output_tokens,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                            CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                        SUM(COALESCE(costUSD, 0)) as cost_usd,
                        COUNT(*) as entries
                    FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                    ${baseWhere}
                    GROUP BY HOUR(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'), 
                             DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
                    ORDER BY date DESC, time_unit ASC
                `;
            
            case 'monthly':
                return `
                    SELECT 
                        EXTRACT(YEAR FROM timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as year,
                        EXTRACT(MONTH FROM timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as month,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as input_tokens,
                        SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as output_tokens,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                            CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                        SUM(COALESCE(costUSD, 0)) as cost_usd,
                        COUNT(*) as entries
                    FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                    ${baseWhere}
                    GROUP BY EXTRACT(YEAR FROM timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'),
                             EXTRACT(MONTH FROM timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
                    ORDER BY year DESC, month DESC
                `;
            
            case 'daily':
            default:
                return `
                    SELECT 
                        DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as date,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as input_tokens,
                        SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as output_tokens,
                        SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                            CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens,
                        SUM(COALESCE(costUSD, 0)) as cost_usd,
                        COUNT(*) as entries
                    FROM read_json('${this.projectsPath}/**/*.jsonl', ignore_errors=true)
                    ${baseWhere}
                    GROUP BY DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
                    ORDER BY date DESC
                `;
        }
    }

    /**
     * 期間統計を取得（Chart.js互換データ）
     */
    async getChartCompatibleData(period) {
        const cacheKey = `chart:${period}`;
        
        // 高速キャッシュをまずチェック（期間変更の高頻度対応）
        const fastCached = this.fastCache.get(cacheKey);
        if (fastCached && Date.now() - fastCached.timestamp < this.fastCacheTime) {
            console.log(`⚡ DuckDB Fast Cache hit: ${cacheKey}`);
            return fastCached.data;
        }
        
        // 通常キャッシュをチェック
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTime) {
            console.log(`🚀 DuckDB Cache hit: ${cacheKey}`);
            // 高速キャッシュにもコピー
            this.fastCache.set(cacheKey, { data: cached.data, timestamp: Date.now() });
            return cached.data;
        }

        console.time('🚀 DuckDB Query Execution');
        
        try {
            const startDate = this.getStartDate(period);
            const aggregationUnit = await this.getAggregationUnit(period);
            
            // 期間に応じた適切な集計クエリを生成
            const timeSeriesQuery = this.generateTimeSeriesQuery(period, aggregationUnit, startDate);

            // 時間別データクエリ（hourlyChart用）
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
            const [timeSeriesData, hourlyData, projectData, statsData] = await Promise.all([
                this.executeDuckDBQuery(timeSeriesQuery),
                this.executeDuckDBQuery(hourlyQuery),
                this.executeDuckDBQuery(projectQuery),
                this.executeDuckDBQuery(statsQuery)
            ]);

            // データを処理してChart.js互換形式に変換
            const chartData = this.formatChartDataWithTimeSeries(timeSeriesData, hourlyData, projectData, statsData[0], period, aggregationUnit);
            
            // 両方のキャッシュに保存
            const cacheEntry = { data: chartData, timestamp: Date.now() };
            this.cache.set(cacheKey, cacheEntry);
            this.fastCache.set(cacheKey, cacheEntry);
            
            console.timeEnd('🚀 DuckDB Query Execution');
            console.log(`📊 DuckDB処理完了: ${timeSeriesData.length}データポイント, ${projectData.length}プロジェクト, 集計単位: ${aggregationUnit}`);
            
            return chartData;
            
        } catch (error) {
            console.error('DuckDB データ取得エラー:', error);
            // console.timeEndでエラーが出る場合があるので try-catch で囲む
            try {
                console.timeEnd('🚀 DuckDB Query Execution');
            } catch (timeError) {
                // タイマーエラーは無視
            }
            throw error;
        }
    }

    /**
     * 期間別ラベルフォーマット
     */
    formatTimeSeriesLabel(data, unit) {
        switch (unit) {
            case 'hourly':
                return `${data.time_unit}:00`;
            case 'monthly':
                return `${data.year}/${String(data.month).padStart(2, '0')}`;
            case 'daily':
            default:
                return Utils.formatDate ? Utils.formatDate(data.date) : data.date;
        }
    }

    /**
     * 時系列データをChartManager互換形式にフォーマット
     */
    formatChartDataWithTimeSeries(timeSeriesData, hourlyData, projectData, stats, period, unit) {
        console.log('🔍 formatChartDataWithTimeSeries 開始:', {
            timeSeriesDataLength: timeSeriesData?.length,
            hourlyDataLength: hourlyData?.length,
            projectDataLength: projectData?.length,
            statsExists: !!stats,
            period,
            unit
        });
        // 24時間の配列を初期化（hourlyChart用）
        const hourlyTokens = new Array(24).fill(0);
        if (Array.isArray(hourlyData)) {
            hourlyData.forEach(row => {
                if (row && row.hour >= 0 && row.hour <= 23) {
                    hourlyTokens[row.hour] = row.total_tokens || 0;
                }
            });
        }

        // 時系列データをChartManager形式に変換
        let formattedTimeSeriesData = [];
        
        if (unit === 'hourly') {
            // 今日の場合：0-23時の24時間データを生成
            const hourlyMap = new Map();
            if (Array.isArray(timeSeriesData)) {
                timeSeriesData.forEach(row => {
                    if (row && typeof row.time_unit !== 'undefined') {
                        hourlyMap.set(row.time_unit, row);
                    }
                });
            }
            
            for (let hour = 0; hour < 24; hour++) {
                const hourData = hourlyMap.get(hour) || {
                    time_unit: hour,
                    total_tokens: 0,
                    cost_usd: 0,
                    entries: 0
                };
                
                formattedTimeSeriesData.push({
                    date: `${hour}:00`,
                    tokens: hourData.total_tokens || 0,
                    cost: (hourData.cost_usd || 0) * 150,
                    calls: hourData.entries || 0
                });
            }
        } else if (unit === 'monthly') {
            // 年の場合：月別データ
            if (Array.isArray(timeSeriesData)) {
                formattedTimeSeriesData = timeSeriesData.map(row => ({
                    date: `${row.year}/${String(row.month).padStart(2, '0')}`,
                    tokens: row.total_tokens || 0,
                    cost: (row.cost_usd || 0) * 150,
                    calls: row.entries || 0
                }));
            }
        } else {
            // 週・月の場合：日別データ
            if (Array.isArray(timeSeriesData)) {
                formattedTimeSeriesData = timeSeriesData.map(row => ({
                    date: row.date,
                    tokens: row.total_tokens || 0,
                    cost: (row.cost_usd || 0) * 150,
                    calls: row.entries || 0
                }));
            }
        }

        // プロジェクト別データの処理
        const projectLabels = Array.isArray(projectData) ? projectData.map(row => row.project_name || 'Unknown') : [];
        const projectTokens = Array.isArray(projectData) ? projectData.map(row => row.total_tokens || 0) : [];

        // 統計データの処理（安全性チェック付き）
        const safeStats = stats || {};
        const totalStats = {
            totalTokens: safeStats.total_tokens || 0,
            inputTokens: safeStats.total_input_tokens || 0,
            outputTokens: safeStats.total_output_tokens || 0,
            totalCostUSD: safeStats.total_cost_usd || 0,
            totalCostJPY: (safeStats.total_cost_usd || 0) * 150,
            totalEntries: safeStats.total_entries || 0,
            activeHours: Math.round((safeStats.active_hours || 0) * 10) / 10,
            activeDays: safeStats.active_days || 0
        };

        // 週別データを生成（既存のチャート用）
        const weeklyData = unit === 'daily' ? this.generateWeeklyData(formattedTimeSeriesData) : [];

        return {
            // 新しい時系列データ（使用量推移チャート用）
            dailyData: formattedTimeSeriesData,
            
            // hourlyChartで使用される時間別データ
            hourlyData: hourlyTokens,
            
            // 週別データ
            weeklyData: weeklyData,
            
            // Chart.js用のプロジェクトデータ
            projectData: projectTokens,
            projectLabels: projectLabels,
            
            // 統計データ
            stats: {
                totalTokens: totalStats.totalTokens,
                inputTokens: totalStats.inputTokens, 
                outputTokens: totalStats.outputTokens,
                costUSD: totalStats.totalCostUSD,
                costJPY: totalStats.totalCostJPY,
                entries: totalStats.totalEntries
            },
            
            // アクティブ時間
            activeHours: totalStats.activeHours,
            
            // 期間とユニット情報（デバッグ用）
            meta: {
                period: period,
                unit: unit,
                dataPoints: formattedTimeSeriesData.length
            }
        };
    }

    /**
     * データをChart.js互換形式にフォーマット（旧メソッド - 後方互換性用）
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

        // AdvancedLogDataProcessor互換形式に変換
        const formattedDailyData = dailyData.map(row => ({
            date: row.date,
            tokens: row.total_tokens || 0,
            cost: (row.cost_usd || 0) * 150,
            calls: row.entries || 0
        }));

        // 週別データを生成（現在週 + 前週）
        const weeklyData = this.generateWeeklyData(formattedDailyData);

        return {
            // AdvancedLogDataProcessor互換の日別データ
            dailyData: formattedDailyData,
            
            // Chart.js用の時間別データ
            hourlyData: hourlyTokens,
            
            // 週別データ
            weeklyData: weeklyData,
            
            // Chart.js用のプロジェクトデータ
            projectData: projectTokens,
            projectLabels: projectLabels,
            
            // 統計データ
            stats: {
                totalTokens: totalStats.totalTokens,
                inputTokens: totalStats.inputTokens, 
                outputTokens: totalStats.outputTokens,
                costUSD: totalStats.totalCostUSD,
                costJPY: totalStats.totalCostJPY,
                entries: totalStats.totalEntries
            },
            
            // アクティブ時間
            activeHours: totalStats.activeHours,
            
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
     * 週別データを生成（Chart.js互換）
     */
    generateWeeklyData(dailyData) {
        const now = new Date();
        const weeklyData = [];
        
        // 現在週のデータを生成
        const currentWeekDays = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() - now.getDay() + i);
            const dateKey = date.toISOString().split('T')[0];
            const dayData = dailyData.find(d => d.date === dateKey);
            currentWeekDays.push(dayData ? dayData.tokens : 0);
        }
        weeklyData.push({ days: currentWeekDays });
        
        // 前週のデータ（簡易版：現在週の80%と仮定）
        const previousWeekDays = currentWeekDays.map(d => Math.round(d * 0.8));
        weeklyData.unshift({ days: previousWeekDays });
        
        return weeklyData;
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
        this.fastCache.clear();
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
        for (const [key] of this.fastCache) {
            if (key.includes(pattern)) {
                this.fastCache.delete(key);
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