/**
 * チャート描画と管理を担当するクラス
 * Chart.jsを使用した4つのメインチャート（Usage、Hourly、Project、Weekly）の作成・更新・テーマ管理を行う
 */
class ChartManager {
    constructor(dataProcessor, settings) {
        this.dataProcessor = dataProcessor;
        this.settings = settings;
        this.charts = {};
        
        console.log('ChartManager initialized with dataProcessor:', !!dataProcessor, 'settings:', !!settings);
    }

    /**
     * 設定を更新
     */
    updateSettings(settings) {
        this.settings = settings;
    }

    /**
     * すべてのチャートを作成
     */
    createCharts(filteredEntries) {
        this.createUsageChart(filteredEntries);
        this.createHourlyChart(filteredEntries);
        this.createWeeklyChart(filteredEntries);
    }
    
    /**
     * チャートをサイレント更新（再作成せずデータのみ更新）
     */
    updateChartsSilent(filteredEntries) {
        this.updateUsageChartSilent(filteredEntries);
        this.updateHourlyChartSilent(filteredEntries);
        this.updateWeeklyChartSilent(filteredEntries);
    }
    
    /**
     * キャッシュ対応のチャートサイレント更新
     */
    updateChartsSilentWithCache(aggregatedData) {
        console.time('updateChartsSilent');
        this.updateUsageChartSilentWithCache(aggregatedData);
        this.updateHourlyChartSilentWithCache(aggregatedData);
        this.updateWeeklyChartSilentWithCache(aggregatedData);
        console.timeEnd('updateChartsSilent');
    }
    
    /**
     * キャッシュ対応のチャート作成
     */
    createChartsWithCache(aggregatedData) {
        console.time('createCharts');
        this.createUsageChartWithCache(aggregatedData);
        this.createHourlyChartWithCache(aggregatedData);
        this.createWeeklyChartWithCache(aggregatedData);
        console.timeEnd('createCharts');
    }
    
    /**
     * 簡易版キャッシュ対応チャート更新（実装を簡略化）
     */
    updateUsageChartSilentWithCache(chartData) {
        if (!this.charts.usage) return;
        if (!chartData || !chartData.dailyData) return;
        
        const chartType = document.getElementById('usageChartType').value;
        let data, label, color;
        
        // 統一されたデータ構造に対応
        const dailyData = chartData.dailyData;
        
        switch (chartType) {
            case 'tokens':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens || d) : [];
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.cost || 0) : [];
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.calls || 1) : [];
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
            default:
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens || d) : [];
                label = 'トークン数';
                color = '#3b82f6';
        }
        
        // ラベルの生成
        const labels = Array.isArray(dailyData) ? 
            dailyData.map(d => d.date ? Utils.formatDate(d.date) : '') : 
            [];
        
        this.charts.usage.data.labels = labels;
        this.charts.usage.data.datasets[0].data = data;
        this.charts.usage.data.datasets[0].label = label;
        this.charts.usage.data.datasets[0].borderColor = color;
        this.charts.usage.data.datasets[0].backgroundColor = color + '20';
        this.charts.usage.update('active'); // 標準的な滑らかアニメーション
    }
    
    updateHourlyChartSilentWithCache(chartData) {
        if (!this.charts.hourly) return;
        if (!chartData || !chartData.hourlyData) return;
        this.charts.hourly.data.datasets[0].data = chartData.hourlyData;
        this.charts.hourly.update('active'); // 標準的な滑らかアニメーション
    }
    
    
    updateWeeklyChartSilentWithCache(chartData) {
        if (!this.charts.weekly) return;
        
        // データ構造のチェック
        if (!chartData) {
            return;
        }

        // 週別データがない場合は日別データから生成
        let currentWeek, previousWeek;
        if (chartData.weeklyData && chartData.weeklyData.length > 0) {
            const weeklyData = chartData.weeklyData;
            currentWeek = weeklyData[weeklyData.length - 1];
            previousWeek = weeklyData[weeklyData.length - 2];
        } else {
            // 日別データから週別データを生成
            currentWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 0) };
            previousWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 1) };
        }
        
        // データフィールド名の統一（days または dailyTokens）
        const currentData = currentWeek ? (currentWeek.days || currentWeek.dailyTokens) : new Array(7).fill(0);
        const previousData = previousWeek ? (previousWeek.days || previousWeek.dailyTokens) : new Array(7).fill(0);
        
        this.charts.weekly.data.datasets[0].data = currentData || new Array(7).fill(0);
        this.charts.weekly.data.datasets[1].data = previousData || new Array(7).fill(0);
        this.charts.weekly.update('active'); // 標準的な滑らかアニメーション
    }
    
    /**
     * 簡易版キャッシュ対応チャート作成（フォールバック）
     */
    createUsageChartWithCache(chartData) { this.createUsageChart(chartData); }
    createHourlyChartWithCache(chartData) { this.createHourlyChart(chartData); }
    createWeeklyChartWithCache(chartData) { this.createWeeklyChart(chartData); }

    /**
     * 使用量推移チャート
     */
    createUsageChart(chartData = null) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        
        if (this.charts.usage) {
            this.charts.usage.destroy();
        }

        // データ構造の検証とフォールバック
        if (!chartData || !chartData.dailyData) {
            console.warn('⚠️ チャートデータが不正です:', chartData);
            return;
        }

        const dailyData = chartData.dailyData;
        const chartType = document.getElementById('usageChartType').value;

        let data, label, color;
        switch (chartType) {
            case 'tokens':
                // DuckDB形式とAdvancedLogDataProcessor形式の両方に対応
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens || d) : [];
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.cost || 0) : [];
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.calls || 1) : [];
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
            default:
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens || d) : [];
                label = 'トークン数';
                color = '#3b82f6';
        }

        // ラベルの生成（日付）
        const labels = Array.isArray(dailyData) ? 
            dailyData.map(d => d.date ? Utils.formatDate(d.date) : '') : 
            [];

        this.charts.usage = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '20',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 使用量推移チャートのサイレント更新
     */
    updateUsageChartSilent(filteredEntries) {
        if (!this.charts.usage) {
            this.createUsageChart(filteredEntries);
            return;
        }
        
        const dailyData = filteredEntries.dailyData;
        const chartType = document.getElementById('usageChartType').value;
        
        let data, label, color;
        switch (chartType) {
            case 'tokens':
                data = dailyData.map(d => d.tokens);
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = dailyData.map(d => d.cost);
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = dailyData.map(d => d.calls);
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
        }
        
        // データを更新（チャートを再作成せず）
        this.charts.usage.data.labels = dailyData.map(d => Utils.formatDate(d.date));
        this.charts.usage.data.datasets[0].data = data;
        this.charts.usage.data.datasets[0].label = label;
        this.charts.usage.data.datasets[0].borderColor = color;
        this.charts.usage.data.datasets[0].backgroundColor = color + '20';
        this.charts.usage.update('active'); // 標準的な滑らかアニメーション
    }

    /**
     * 時間別使用パターンチャート
     */
    createHourlyChart(filteredEntries = null) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        
        if (this.charts.hourly) {
            this.charts.hourly.destroy();
        }

        const hourlyData = filteredEntries.hourlyData;

        this.charts.hourly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'API呼び出し数',
                    data: hourlyData,
                    backgroundColor: '#60a5fa',
                    borderColor: '#3b82f6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 時間別使用パターンチャートのサイレント更新
     */
    updateHourlyChartSilent(filteredEntries) {
        if (!this.charts.hourly) {
            this.createHourlyChart(filteredEntries);
            return;
        }
        
        const hourlyData = filteredEntries.hourlyData;
        
        // データを更新（チャートを再作成せず）
        this.charts.hourly.data.datasets[0].data = hourlyData;
        this.charts.hourly.update('active'); // 標準的な滑らかアニメーション
    }

    

    /**
     * 週別比較チャート
     */
    createWeeklyChart(chartData = null) {
        const ctx = document.getElementById('weeklyChart').getContext('2d');
        
        if (this.charts.weekly) {
            this.charts.weekly.destroy();
        }

        // データ構造のチェック
        if (!chartData) {
            console.warn('chartData is null for weekly chart');
            chartData = { dailyData: [], dailyLabels: [] };
        }

        // 週別データがない場合は日別データから生成
        let currentWeek, previousWeek;
        if (chartData.weeklyData && chartData.weeklyData.length > 0) {
            const weeklyData = chartData.weeklyData;
            currentWeek = weeklyData[weeklyData.length - 1];
            previousWeek = weeklyData[weeklyData.length - 2];
        } else {
            // 日別データから週別データを生成
            currentWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 0) };
            previousWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 1) };
        }

        const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
        
        this.charts.weekly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayLabels,
                datasets: [
                    {
                        label: '今週',
                        data: currentWeek ? currentWeek.dailyTokens : new Array(7).fill(0),
                        backgroundColor: '#3b82f6',
                        borderColor: '#1e40af',
                        borderWidth: 1
                    },
                    {
                        label: '先週',
                        data: previousWeek ? previousWeek.dailyTokens : new Array(7).fill(0),
                        backgroundColor: '#94a3b8',
                        borderColor: '#64748b',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        labels: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        grid: {
                            color: this.settings.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 週別比較チャートのサイレント更新
     */
    updateWeeklyChartSilent(chartData) {
        if (!this.charts.weekly) {
            this.createWeeklyChart(chartData);
            return;
        }
        
        // データ構造のチェック
        if (!chartData) {
            return;
        }

        // 週別データがない場合は日別データから生成
        let currentWeek, previousWeek;
        if (chartData.weeklyData && chartData.weeklyData.length > 0) {
            const weeklyData = chartData.weeklyData;
            currentWeek = weeklyData[weeklyData.length - 1];
            previousWeek = weeklyData[weeklyData.length - 2];
        } else {
            // 日別データから週別データを生成
            currentWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 0) };
            previousWeek = { dailyTokens: this.generateWeeklyDataFromDaily(chartData.dailyData, chartData.dailyLabels, 1) };
        }
        
        // データを更新（チャートを再作成せず）
        this.charts.weekly.data.datasets[0].data = currentWeek ? currentWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.data.datasets[1].data = previousWeek ? previousWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.update('active'); // 標準的な滑らかアニメーション
    }

    /**
     * 使用量チャートを更新（チャートタイプ変更時）
     */
    updateUsageChart(filteredEntries) {
        this.createUsageChart(filteredEntries);
    }

    /**
     * チャートの存在を確認
     */
    hasChart(chartName) {
        return this.charts[chartName] && this.charts[chartName] !== null;
    }

    /**
     * チャートテーマを更新
     */
    updateChartsTheme() {
        // チャートを再作成してテーマを適用
        setTimeout(() => {
            if (this.charts.usage) this.charts.usage.destroy();
            if (this.charts.hourly) this.charts.hourly.destroy();
            if (this.charts.weekly) this.charts.weekly.destroy();
        }, 100);
    }

    /**
     * すべてのチャートを破棄
     */
    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
    }

    /**
     * 特定のチャートが存在するかチェック
     */
    hasChart(chartName) {
        return !!this.charts[chartName];
    }

    /**
     * チャートインスタンスを取得
     */
    getChart(chartName) {
        return this.charts[chartName];
    }

    /**
     * 日別データから週別データを生成するヘルパーメソッド
     */
    generateWeeklyDataFromDaily(dailyData, dailyLabels, weekOffset = 0) {
        // 曜日別の配列を初期化（日曜日から土曜日）
        const weeklyTokens = new Array(7).fill(0);
        
        if (!dailyData || !dailyLabels) {
            return weeklyTokens;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // 指定された週のオフセットを適用
        const targetWeekStart = new Date(today);
        targetWeekStart.setDate(today.getDate() - today.getDay() - (weekOffset * 7)); // 日曜日開始
        
        // 日別データから該当する週のデータを抽出
        for (let i = 0; i < dailyData.length && i < dailyLabels.length; i++) {
            const entryDate = new Date(dailyLabels[i]);
            const daysDiff = Math.floor((entryDate - targetWeekStart) / (1000 * 60 * 60 * 24));
            
            // 対象週の範囲内（0-6日）かチェック
            if (daysDiff >= 0 && daysDiff < 7) {
                const dayOfWeek = entryDate.getDay(); // 0=日曜日, 6=土曜日
                weeklyTokens[dayOfWeek] = dailyData[i] || 0;
            }
        }
        
        return weeklyTokens;
    }
}