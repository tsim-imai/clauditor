/**
 * ミニモードの管理を担当するクラス
 * ミニモード表示、チャート生成、統計更新、UI制御を行う
 */
class MiniModeManager {
    constructor(dataProcessor, settings) {
        this.dataProcessor = dataProcessor;
        this.settings = settings;
        this.isActive = false;
        this.chart = null;
        this.timeRange = '10m'; // デフォルト10分
        
        console.log('MiniModeManager initialized');
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
            this.update();
            this.createChart();
            this.updateMessageStats(); // 最小モード開始時にメッセージ統計を初期化
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
        } catch (error) {
            console.error('Failed to exit mini mode:', error);
            throw new Error('通常モードに戻すことができませんでした');
        }
    }

    /**
     * 時間範囲を設定
     */
    setTimeRange(timeRange) {
        this.timeRange = timeRange;
        if (this.isActive) {
            this.updateAnimated(); // アニメーション付きで更新
        }
    }

    /**
     * ミニモードを更新
     */
    update() {
        if (!this.isActive) return;
        
        // 時間範囲フィルタ適用でメッセージ統計を更新
        this.updateMessageStats();
        
        // 選択された時間範囲のデータを取得
        const stats = this.dataProcessor.getMiniModeStats(this.timeRange);
        
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
        this.updateChart();
    }

    /**
     * アニメーション付きのミニモード更新
     */
    updateAnimated() {
        if (!this.isActive) return;
        
        // チャートコンテナをフェードアウト
        const chartContainer = document.querySelector('.mini-chart-container');
        if (chartContainer) {
            chartContainer.style.opacity = '0.6';
        }
        
        // 時間範囲フィルタ適用でメッセージ統計をアニメーション付きで更新
        this.updateMessageStats(true);
        
        // 選択された時間範囲のデータを取得
        const stats = this.dataProcessor.getMiniModeStats(this.timeRange);
        
        // 統計値をアニメーション付きで更新
        const tokenDisplay = stats.tokens >= 1000 ? 
            `${(stats.tokens / 1000).toFixed(1)}K` : 
            stats.tokens.toString();
        this.animateValueChange('miniTokenValue', tokenDisplay);
        
        const costDisplay = `¥${Math.round(stats.cost)}`;
        this.animateValueChange('miniCostValue', costDisplay);
        
        const timeDisplay = stats.hours >= 1 ? 
            `${stats.hours.toFixed(1)}h` : 
            `${Math.round(stats.hours * 60)}m`;
        this.animateValueChange('miniTimeValue', timeDisplay);
        
        // グラフを少し遅延してスムーズに更新
        setTimeout(() => {
            // 時間範囲変更時はチャートを再作成して設定を確実に保持
            this.destroyChart();
            this.createChart();
            
            // チャートコンテナをフェードイン
            if (chartContainer) {
                chartContainer.style.opacity = '1';
            }
        }, 150);
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
     * ミニモード用のメッセージ統計を更新
     */
    updateMessageStats(animated = false) {
        // 指定時間のエントリをフィルタリング
        const timeRangeEntries = this.dataProcessor.getTimeRangeEntries(this.timeRange);
        const { userMessages, assistantMessages } = this.dataProcessor.calculateMessageStats(timeRangeEntries);
        
        console.log('Mini mode message stats:', { 
            timeRange: this.timeRange, 
            userMessages, 
            assistantMessages, 
            totalTimeRangeEntries: timeRangeEntries.length 
        });
        
        // アニメーション付きで値を更新
        if (animated) {
            this.animateValueChange('miniUserMessageCount', userMessages.toLocaleString());
            this.animateValueChange('miniAssistantMessageCount', assistantMessages.toLocaleString());
        } else {
            document.getElementById('miniUserMessageCount').textContent = userMessages.toLocaleString();
            document.getElementById('miniAssistantMessageCount').textContent = assistantMessages.toLocaleString();
        }
    }

    /**
     * ミニチャートを作成
     */
    createChart() {
        const canvas = document.getElementById('miniChart');
        const ctx = canvas.getContext('2d');
        
        // キャンバスサイズを設定
        canvas.width = 380;
        canvas.height = 180;
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: this.getChartData(),
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
     * チャートデータを取得
     */
    getChartData() {
        const now = new Date();
        const labels = [];
        const data = [];
        
        // 時間範囲に応じてデータポイント数と間隔を調整
        const { pointCount, intervalMinutes } = this.dataProcessor.getMiniChartConfig(this.timeRange);
        
        for (let i = pointCount - 1; i >= 0; i--) {
            const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
            const timeStr = this.dataProcessor.formatMiniChartTime(time, this.timeRange);
            labels.push(timeStr);
            
            // その時間ブロックのトークン数を取得
            const tokens = this.dataProcessor.getTokensForTimeBlock(time, this.timeRange);
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
    updateChart() {
        if (!this.chart) return;
        
        const newData = this.getChartData();
        
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