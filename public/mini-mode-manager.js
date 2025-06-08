/**
 * ミニモードの管理を担当するクラス
 * ミニモード表示、チャート生成、統計更新、UI制御を行う
 */
export class MiniModeManager {
    constructor(duckDBProcessor, settings) {
        this.duckDBProcessor = duckDBProcessor;
        this.settings = settings;
        this.isActive = false;
        this.chart = null;
        this.timeRange = '10m'; // デフォルト10分
        this.miniCache = new Map(); // ミニモード専用キャッシュ
        this.miniCacheTime = 10000; // 10秒キャッシュ（高速化）
        this.updateInterval = null; // 定期更新タイマー
        
        console.log('MiniModeManager initialized with DuckDBProcessor');
    }

    /**
     * 設定を更新
     */
    updateSettings(settings) {
        this.settings = settings;
    }

    /**
     * ミニモードのトグル切り替え
     */
    async toggle() {
        if (this.isActive) {
            await this.exit();
        } else {
            await this.enter();
        }
    }

    /**
     * ミニモードに入る
     */
    async enter() {
        try {
            // Electronウィンドウを最小サイズに変更
            await window.electronAPI.setMiniMode(true);
            
            // UIを最小モードに切り替え
            document.getElementById('miniMode').classList.remove('hidden');
            document.querySelector('.header').classList.add('hidden');
            document.querySelector('.main-container').classList.add('hidden');
            
            // セレクトボックスの初期値を設定
            document.getElementById('miniTimeRange').value = this.timeRange;
            
            this.isActive = true;
            
            // 一度のデータ取得で全て更新（最適化）
            await this.updateAllInOne();
            
            // ミニモード専用定期更新を開始
            this.startAutoUpdate();
        } catch (error) {
            console.error('Failed to enter mini mode:', error);
            throw new Error('最小ウィンドウモードに切り替えできませんでした');
        }
    }

    /**
     * ミニモードを終了
     */
    async exit() {
        try {
            // Electronウィンドウを通常サイズに戻す
            await window.electronAPI.setMiniMode(false);
            
            // UIを通常モードに戻す
            document.getElementById('miniMode').classList.add('hidden');
            document.querySelector('.header').classList.remove('hidden');
            document.querySelector('.main-container').classList.remove('hidden');
            
            this.isActive = false;
            this.destroyChart();
            
            // 定期更新を停止
            this.stopAutoUpdate();
        } catch (error) {
            console.error('Failed to exit mini mode:', error);
            throw new Error('通常モードに戻すことができませんでした');
        }
    }

    /**
     * 時間範囲を設定
     */
    async setTimeRange(timeRange) {
        this.timeRange = timeRange;
        if (this.isActive) {
            await this.updateAnimated(); // アニメーション付きで更新
            
            // 時間範囲変更時は定期更新をリスタート（最適な間隔で）
            this.restartAutoUpdate();
        }
    }

    /**
     * 自動更新を開始
     */
    startAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // 時間範囲に応じて更新間隔を調整
        const updateIntervalMs = this.getOptimalUpdateInterval();
        
        console.log(`🔄 ミニモード自動更新開始: ${updateIntervalMs/1000}秒間隔 (${this.timeRange})`);
        
        this.updateInterval = setInterval(async () => {
            if (this.isActive) {
                console.log(`🔄 ミニモード定期更新: ${this.timeRange}`);
                // キャッシュをクリアして最新データを取得
                this.clearMiniCache();
                await this.updateAllInOne();
            }
        }, updateIntervalMs);
    }

    /**
     * 自動更新を停止
     */
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('🛑 ミニモード自動更新停止');
        }
    }

    /**
     * 自動更新をリスタート
     */
    restartAutoUpdate() {
        this.stopAutoUpdate();
        this.startAutoUpdate();
    }

    /**
     * 最適な更新間隔を取得
     */
    getOptimalUpdateInterval() {
        if (this.timeRange.endsWith('m')) {
            const minutes = parseInt(this.timeRange);
            if (minutes <= 10) {
                return 30000; // 30秒間隔（短い期間は頻繁に）
            } else if (minutes <= 30) {
                return 60000; // 1分間隔
            } else {
                return 120000; // 2分間隔
            }
        } else {
            const hours = parseInt(this.timeRange);
            if (hours <= 1) {
                return 60000; // 1分間隔
            } else if (hours <= 6) {
                return 300000; // 5分間隔
            } else {
                return 600000; // 10分間隔
            }
        }
    }

    /**
     * ミニキャッシュをクリア
     */
    clearMiniCache() {
        this.miniCache.clear();
        console.log('🧹 ミニキャッシュクリア');
    }

    /**
     * 一括更新（最適化版）
     */
    async updateAllInOne() {
        if (!this.isActive) return;
        
        try {
            console.time('🚀 Mini Mode All-in-One Update');
            
            // 一度のクエリで全データを取得
            const allData = await this.getAllMiniData();
            
            // 統計表示を更新
            this.updateStatsDisplay(allData.stats);
            
            // メッセージ統計を更新
            this.updateMessageStatsDisplay(allData.messageStats);
            
            // チャートを作成
            await this.createChartWithData(allData.chartData);
            
            console.timeEnd('🚀 Mini Mode All-in-One Update');
        } catch (error) {
            console.error('Mini mode all-in-one update error:', error);
        }
    }

    /**
     * ミニモードを更新（レガシー）
     */
    async update() {
        if (!this.isActive) return;
        
        try {
            // 時間範囲フィルタ適用でメッセージ統計を更新
            await this.updateMessageStats();
            
            // 選択された時間範囲のデータを取得
            const stats = await this.getMiniModeStats(this.timeRange);
            
            // トークン数を表示（K単位で表示）
            const tokenDisplay = stats.tokens >= 1000 ? 
                `${(stats.tokens / 1000).toFixed(1)}K` : 
                stats.tokens.toString();
            document.getElementById('miniTokenValue').textContent = tokenDisplay;
            
            // コストを表示（JPY単位）
            const costDisplay = `¥${Math.round(stats.cost)}`;
            document.getElementById('miniCostValue').textContent = costDisplay;
            
            // 使用時間を表示
            const timeDisplay = stats.hours >= 1 ? 
                `${stats.hours.toFixed(1)}h` : 
                `${Math.round(stats.hours * 60)}m`;
            document.getElementById('miniTimeValue').textContent = timeDisplay;
            
            // グラフをネイティブ更新
            await this.updateChart();
        } catch (error) {
            console.error('Mini mode update error:', error);
        }
    }

    /**
     * アニメーション付きのミニモード更新（最適化版）
     */
    async updateAnimated() {
        if (!this.isActive) return;
        
        // チャートコンテナをフェードアウト
        const chartContainer = document.querySelector('.mini-chart-container');
        if (chartContainer) {
            chartContainer.style.opacity = '0.6';
        }
        
        try {
            // 一括データ取得（キャッシュ有効活用）
            const allData = await this.getAllMiniData();
            
            // 統計値をアニメーション付きで更新
            const tokenDisplay = allData.stats.tokens >= 1000 ? 
                `${(allData.stats.tokens / 1000).toFixed(1)}K` : 
                allData.stats.tokens.toString();
            this.animateValueChange('miniTokenValue', tokenDisplay);
            
            const costDisplay = `¥${Math.round(allData.stats.cost)}`;
            this.animateValueChange('miniCostValue', costDisplay);
            
            const timeDisplay = allData.stats.hours >= 1 ? 
                `${allData.stats.hours.toFixed(1)}h` : 
                `${Math.round(allData.stats.hours * 60)}m`;
            this.animateValueChange('miniTimeValue', timeDisplay);
            
            // メッセージ統計もアニメーション付きで更新
            this.animateValueChange('miniUserMessageCount', allData.messageStats.userMessages.toLocaleString());
            this.animateValueChange('miniAssistantMessageCount', allData.messageStats.assistantMessages.toLocaleString());
            
            // グラフを少し遅延してスムーズに更新
            setTimeout(async () => {
                await this.createChartWithData(allData.chartData);
                
                // チャートコンテナをフェードイン
                if (chartContainer) {
                    chartContainer.style.opacity = '1';
                }
            }, 150);
            
        } catch (error) {
            console.error('Mini mode animated update error:', error);
            // チャートコンテナを復元
            if (chartContainer) {
                chartContainer.style.opacity = '1';
            }
        }
    }

    /**
     * アニメーション付きで値を更新
     */
    animateValueChange(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // フェードアウト
        element.style.opacity = '0.6';
        element.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            // 値を更新
            element.textContent = newValue;
            
            // フェードイン
            element.style.opacity = '1';
            element.style.transform = 'scale(1)';
        }, 100);
    }

    /**
     * 一括データ取得（最適化版）
     */
    async getAllMiniData() {
        const cacheKey = `mini:${this.timeRange}`;
        
        // キャッシュチェック
        const cached = this.miniCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.miniCacheTime) {
            console.log(`⚡ Mini Cache Hit: ${cacheKey}`);
            return cached.data;
        }
        
        try {
            const endTime = new Date();
            const startTime = new Date();
            
            // 時間範囲に基づいて開始時間を計算
            if (this.timeRange.endsWith('m')) {
                const minutes = parseInt(this.timeRange);
                startTime.setMinutes(endTime.getMinutes() - minutes);
            } else {
                const hours = parseInt(this.timeRange);
                startTime.setHours(endTime.getHours() - hours);
            }
            
            // 一つのクエリで全データを取得
            const query = `
                SELECT 
                    timestamp,
                    message -> 'role' as role,
                    message -> 'usage' ->> 'input_tokens' as input_tokens,
                    message -> 'usage' ->> 'output_tokens' as output_tokens
                FROM read_json('${this.duckDBProcessor.getProjectsPath()}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startTime.toISOString()}'
                  AND timestamp <= '${endTime.toISOString()}'
                ORDER BY timestamp DESC
            `;
            
            const rawData = await this.duckDBProcessor.executeDuckDBQuery(query);
            
            // データを処理
            const processedData = this.processAllMiniData(rawData || []);
            
            // キャッシュに保存
            this.miniCache.set(cacheKey, { data: processedData, timestamp: Date.now() });
            
            return processedData;
            
        } catch (error) {
            console.error('Failed to get all mini data:', error);
            return {
                stats: { tokens: 0, cost: 0, hours: 0 },
                messageStats: { userMessages: 0, assistantMessages: 0 },
                chartData: { labels: [], data: [] }
            };
        }
    }

    /**
     * 一括データ処理
     */
    processAllMiniData(rawData) {
        let totalTokens = 0;
        let totalCost = 0;
        let userMessages = 0;
        let assistantMessages = 0;
        
        // 時間別データ（チャート用）
        const timeBlocks = new Map();
        const { pointCount, intervalMinutes } = this.getMiniChartConfig(this.timeRange);
        
        // タイムスタンプ処理とメッセージカウント
        rawData.forEach(entry => {
            const inputTokens = parseInt(entry.input_tokens) || 0;
            const outputTokens = parseInt(entry.output_tokens) || 0;
            totalTokens += inputTokens + outputTokens;
            totalCost += (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
            
            if (entry.role === 'user') {
                userMessages++;
            } else if (entry.role === 'assistant') {
                assistantMessages++;
            }
            
            // チャート用データ処理
            if (entry.timestamp) {
                const time = new Date(entry.timestamp);
                const blockKey = Math.floor(time.getTime() / (intervalMinutes * 60 * 1000));
                timeBlocks.set(blockKey, (timeBlocks.get(blockKey) || 0) + inputTokens + outputTokens);
            }
        });
        
        // アクティブ時間計算
        const uniqueHours = new Set();
        rawData.forEach(entry => {
            if (entry.timestamp) {
                const hour = new Date(entry.timestamp).getHours();
                uniqueHours.add(hour);
            }
        });
        
        // チャートデータ生成
        const now = new Date();
        const labels = [];
        const data = [];
        
        for (let i = pointCount - 1; i >= 0; i--) {
            const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
            const timeStr = this.formatMiniChartTime(time, this.timeRange);
            labels.push(timeStr);
            
            const blockKey = Math.floor(time.getTime() / (intervalMinutes * 60 * 1000));
            data.push(timeBlocks.get(blockKey) || 0);
        }
        
        return {
            stats: {
                tokens: totalTokens,
                cost: totalCost * 150, // USD to JPY
                hours: uniqueHours.size
            },
            messageStats: {
                userMessages,
                assistantMessages
            },
            chartData: {
                labels,
                data
            }
        };
    }

    /**
     * 統計表示更新
     */
    updateStatsDisplay(stats) {
        const tokenDisplay = stats.tokens >= 1000 ? 
            `${(stats.tokens / 1000).toFixed(1)}K` : 
            stats.tokens.toString();
        document.getElementById('miniTokenValue').textContent = tokenDisplay;
        
        const costDisplay = `¥${Math.round(stats.cost)}`;
        document.getElementById('miniCostValue').textContent = costDisplay;
        
        const timeDisplay = stats.hours >= 1 ? 
            `${stats.hours.toFixed(1)}h` : 
            `${Math.round(stats.hours * 60)}m`;
        document.getElementById('miniTimeValue').textContent = timeDisplay;
    }

    /**
     * メッセージ統計表示更新
     */
    updateMessageStatsDisplay(messageStats) {
        document.getElementById('miniUserMessageCount').textContent = messageStats.userMessages.toLocaleString();
        document.getElementById('miniAssistantMessageCount').textContent = messageStats.assistantMessages.toLocaleString();
    }

    /**
     * チャートをデータ付きで作成
     */
    async createChartWithData(chartData) {
        const canvas = document.getElementById('miniChart');
        const ctx = canvas.getContext('2d');
        
        // 既存チャートを破棄
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        
        // キャンバスサイズを設定
        canvas.width = 380;
        canvas.height = 180;
        
        const formattedChartData = {
            labels: chartData.labels,
            datasets: [{
                data: chartData.data,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2
            }]
        };
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: formattedChartData,
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        cornerRadius: 6,
                        displayColors: false,
                        callbacks: {
                            title: function(context) { return context[0].label; },
                            label: function(context) {
                                const value = context.parsed.y;
                                return value >= 1000 ? `${(value / 1000).toFixed(1)}K トークン` : `${value} トークン`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' },
                        ticks: { font: { size: 8 }, maxTicksLimit: 6 }
                    },
                    y: {
                        display: true,
                        grid: { display: true, color: 'rgba(0, 0, 0, 0.1)' },
                        ticks: {
                            font: { size: 8 },
                            callback: function(value) {
                                return value >= 1000 ? (value/1000).toFixed(0) + 'K' : value;
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 1.5,
                        hoverRadius: 4,
                        backgroundColor: 'rgb(59, 130, 246)',
                        borderColor: '#ffffff',
                        borderWidth: 1,
                        hoverBorderWidth: 2
                    }
                },
                interaction: { intersect: false, mode: 'index' },
                hover: { mode: 'index', intersect: false }
            }
        });
    }

    /**
     * 時間範囲のデータを取得（DuckDB）
     */
    async getTimeRangeData(timeRange) {
        try {
            const endTime = new Date();
            const startTime = new Date();
            
            // 時間範囲に基づいて開始時間を計算
            if (timeRange.endsWith('m')) {
                const minutes = parseInt(timeRange);
                startTime.setMinutes(endTime.getMinutes() - minutes);
            } else {
                const hours = parseInt(timeRange);
                startTime.setHours(endTime.getHours() - hours);
            }
            
            const query = `
                SELECT 
                    timestamp,
                    message -> 'role' as role,
                    message -> 'usage' ->> 'input_tokens' as input_tokens,
                    message -> 'usage' ->> 'output_tokens' as output_tokens
                FROM read_json('${this.duckDBProcessor.getProjectsPath()}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startTime.toISOString()}'
                  AND timestamp <= '${endTime.toISOString()}'
                ORDER BY timestamp DESC
            `;
            
            const result = await this.duckDBProcessor.executeDuckDBQuery(query);
            return result || [];
            
        } catch (error) {
            console.error('Failed to get time range data:', error);
            return [];
        }
    }

    /**
     * メッセージ統計を計算
     */
    calculateMessageStats(timeRangeData) {
        let userMessages = 0;
        let assistantMessages = 0;
        
        timeRangeData.forEach(entry => {
            if (entry.role === 'user') {
                userMessages++;
            } else if (entry.role === 'assistant') {
                assistantMessages++;
            }
        });
        
        return { userMessages, assistantMessages };
    }

    /**
     * ミニモード用の統計を取得
     */
    async getMiniModeStats(timeRange) {
        try {
            const timeRangeData = await this.getTimeRangeData(timeRange);
            
            let totalTokens = 0;
            let totalCost = 0;
            let activeHours = 0;
            
            // トークン数とコストを計算
            timeRangeData.forEach(entry => {
                const inputTokens = parseInt(entry.input_tokens) || 0;
                const outputTokens = parseInt(entry.output_tokens) || 0;
                totalTokens += inputTokens + outputTokens;
                
                // コスト計算（概算：$0.003/$0.015 per 1K tokens）
                totalCost += (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
            });
            
            // アクティブ時間を計算（ユニークな時間帯数）
            const uniqueHours = new Set();
            timeRangeData.forEach(entry => {
                if (entry.timestamp) {
                    const hour = new Date(entry.timestamp).getHours();
                    uniqueHours.add(hour);
                }
            });
            activeHours = uniqueHours.size;
            
            return {
                tokens: totalTokens,
                cost: totalCost * 150, // USD to JPY
                hours: activeHours
            };
            
        } catch (error) {
            console.error('Failed to get mini mode stats:', error);
            return {
                tokens: 0,
                cost: 0,
                hours: 0
            };
        }
    }

    /**
     * ミニモード用のメッセージ統計を更新
     */
    async updateMessageStats(animated = false) {
        try {
            // DuckDBで時間範囲のデータを取得
            const timeRangeData = await this.getTimeRangeData(this.timeRange);
            const { userMessages, assistantMessages } = this.calculateMessageStats(timeRangeData);
            
            console.log('Mini mode message stats:', { 
                timeRange: this.timeRange, 
                userMessages, 
                assistantMessages, 
                totalTimeRangeEntries: timeRangeData.length 
            });
            
            // アニメーション付きで値を更新
            if (animated) {
                this.animateValueChange('miniUserMessageCount', userMessages.toLocaleString());
                this.animateValueChange('miniAssistantMessageCount', assistantMessages.toLocaleString());
            } else {
                document.getElementById('miniUserMessageCount').textContent = userMessages.toLocaleString();
                document.getElementById('miniAssistantMessageCount').textContent = assistantMessages.toLocaleString();
            }
        } catch (error) {
            console.error('Mini mode message stats error:', error);
            // エラー時はデフォルト値を表示
            document.getElementById('miniUserMessageCount').textContent = '0';
            document.getElementById('miniAssistantMessageCount').textContent = '0';
        }
    }

    /**
     * ミニチャートを作成
     */
    async createChart() {
        const canvas = document.getElementById('miniChart');
        const ctx = canvas.getContext('2d');
        
        // キャンバスサイズを設定
        canvas.width = 380;
        canvas.height = 180;
        
        const chartData = await this.getChartData();
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        cornerRadius: 6,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                const value = context.parsed.y;
                                if (value >= 1000) {
                                    return `${(value / 1000).toFixed(1)}K トークン`;
                                }
                                return `${value} トークン`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            font: {
                                size: 8
                            },
                            maxTicksLimit: 6
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            font: {
                                size: 8
                            },
                            callback: function(value) {
                                return value >= 1000 ? (value/1000).toFixed(0) + 'K' : value;
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 1.5,
                        hoverRadius: 4,
                        backgroundColor: 'rgb(59, 130, 246)',
                        borderColor: '#ffffff',
                        borderWidth: 1,
                        hoverBorderWidth: 2
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                hover: {
                    mode: 'index',
                    intersect: false
                }
            }
        });
    }

    /**
     * ミニチャート設定を取得
     */
    getMiniChartConfig(timeRange) {
        if (timeRange.endsWith('m')) {
            const minutes = parseInt(timeRange);
            if (minutes <= 30) {
                return { pointCount: 12, intervalMinutes: Math.max(1, Math.floor(minutes / 12)) };
            } else {
                return { pointCount: 15, intervalMinutes: Math.floor(minutes / 15) };
            }
        } else {
            const hours = parseInt(timeRange);
            if (hours <= 6) {
                return { pointCount: 12, intervalMinutes: hours * 5 };
            } else {
                return { pointCount: 16, intervalMinutes: hours * 60 / 16 };
            }
        }
    }

    /**
     * ミニチャート時間フォーマット
     */
    formatMiniChartTime(time, timeRange) {
        if (timeRange.endsWith('m')) {
            return time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        } else {
            return time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }
    }

    /**
     * 時間ブロックのトークン数を取得
     */
    async getTokensForTimeBlock(time, timeRange) {
        try {
            const { intervalMinutes } = this.getMiniChartConfig(timeRange);
            const startTime = new Date(time.getTime() - intervalMinutes * 60 * 1000 / 2);
            const endTime = new Date(time.getTime() + intervalMinutes * 60 * 1000 / 2);
            
            const query = `
                SELECT 
                    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + 
                        CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as total_tokens
                FROM read_json('${this.duckDBProcessor.getProjectsPath()}/**/*.jsonl', ignore_errors=true)
                WHERE timestamp IS NOT NULL 
                  AND timestamp >= '${startTime.toISOString()}'
                  AND timestamp <= '${endTime.toISOString()}'
            `;
            
            const result = await this.duckDBProcessor.executeDuckDBQuery(query);
            return (result && result[0] && result[0].total_tokens) || 0;
            
        } catch (error) {
            console.error('Failed to get tokens for time block:', error);
            return 0;
        }
    }

    /**
     * チャートデータを取得
     */
    async getChartData() {
        const now = new Date();
        const labels = [];
        const data = [];
        
        // 時間範囲に応じてデータポイント数と間隔を調整
        const { pointCount, intervalMinutes } = this.getMiniChartConfig(this.timeRange);
        
        for (let i = pointCount - 1; i >= 0; i--) {
            const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
            const timeStr = this.formatMiniChartTime(time, this.timeRange);
            labels.push(timeStr);
            
            // その時間ブロックのトークン数を取得
            const tokens = await this.getTokensForTimeBlock(time, this.timeRange);
            data.push(tokens);
        }
        
        console.log('Mini chart labels:', labels);
        console.log('Mini chart data:', data);
        
        // ダークモード対応の色設定
        const primaryColor = 'rgb(59, 130, 246)';
        const primaryColorAlpha = 'rgba(59, 130, 246, 0.1)';
        
        return {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: primaryColor,
                backgroundColor: primaryColorAlpha,
                fill: true,
                tension: 0.4,
                borderWidth: 2
            }]
        };
    }

    /**
     * チャートを更新
     */
    async updateChart() {
        if (!this.chart) return;
        
        const newData = await this.getChartData();
        
        // データの値とラベルのみを更新（設定は保持）
        this.chart.data.labels = newData.labels;
        this.chart.data.datasets[0].data = newData.datasets[0].data;
        
        this.chart.update('none'); // アニメーションなしで瞬間更新
    }

    /**
     * チャートを破棄
     */
    destroyChart() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    /**
     * ミニモードが有効かどうか
     */
    isEnabled() {
        return this.isActive;
    }

    /**
     * 現在の時間範囲を取得
     */
    getTimeRange() {
        return this.timeRange;
    }
}