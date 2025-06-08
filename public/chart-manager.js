import { Utils } from './utils.js';

/**
 * チャート描画と管理を担当するクラス
 * Chart.jsを使用した4つのメインチャート（Usage、Hourly、Project、Weekly）の作成・更新・テーマ管理を行う
 */
export class ChartManager {
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
     * すべてのチャートを作成（旧互換性維持）
     */
    createCharts(chartData) {
        // 新しいメソッドに転送
        this.createChartsWithCache(chartData);
    }
    
    /**
     * チャートをサイレント更新（再作成せずデータのみ更新）- 旧互換性維持
     */
    updateChartsSilent(chartData) {
        // 新しいメソッドに転送
        this.updateChartsSilentWithCache(chartData);
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
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens) : [];
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.cost) : [];
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.calls) : [];
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
            default:
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens) : [];
                label = 'トークン数';
                color = '#3b82f6';
        }
        
        // ラベルの生成（期間に応じて適切にフォーマット）
        const labels = Array.isArray(dailyData) ? 
            dailyData.map(d => this.formatChartLabel(d.date, chartData.meta)) : 
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

        // 新しい比較データを使用
        if (chartData.comparisonData) {
            const compData = chartData.comparisonData;
            
            // ラベルとデータセットのラベルを更新
            this.charts.weekly.data.labels = compData.current.labels;
            this.charts.weekly.data.datasets[0].label = compData.currentLabel;
            this.charts.weekly.data.datasets[1].label = compData.comparisonLabel;
            this.charts.weekly.data.datasets[0].data = compData.current.data;
            this.charts.weekly.data.datasets[1].data = compData.comparison.data;
            
        } else {
            // フォールバック: 旧週別データ
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
        }
        
        this.charts.weekly.update('active'); // 標準的な滑らかアニメーション
    }
    
    /**
     * 簡易版キャッシュ対応チャート作成（新データ構造対応）
     */
    createUsageChartWithCache(chartData) { 
        // 新しいデータ構造でチャート作成
        this.createUsageChart(chartData); 
    }
    createHourlyChartWithCache(chartData) { 
        // hourlyDataを正しく渡す
        this.createHourlyChart(chartData); 
    }
    createWeeklyChartWithCache(chartData) { 
        // weeklyDataを正しく渡す
        this.createWeeklyChart(chartData); 
    }

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
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens) : [];
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.cost) : [];
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = Array.isArray(dailyData) ? dailyData.map(d => d.calls) : [];
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
            default:
                data = Array.isArray(dailyData) ? dailyData.map(d => d.tokens) : [];
                label = 'トークン数';
                color = '#3b82f6';
        }

        // ラベルの生成（期間に応じて適切にフォーマット）
        const labels = Array.isArray(dailyData) ? 
            dailyData.map(d => this.formatChartLabel(d.date, chartData.meta)) : 
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
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        type: 'category',
                        grid: {
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b',
                            maxTicksLimit: chartData.meta && chartData.meta.unit === 'hourly' ? 24 : 
                                          chartData.meta && chartData.meta.unit === 'monthly' ? 12 : 
                                          15 // 日別の場合は最大15ティック
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 使用量推移チャートのサイレント更新（旧互換性維持）
     */
    updateUsageChartSilent(chartData) {
        // 新しいメソッドに転送
        this.updateUsageChartSilentWithCache(chartData);
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
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        grid: {
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 時間別使用パターンチャートのサイレント更新（旧互換性維持）
     */
    updateHourlyChartSilent(chartData) {
        // 新しいメソッドに転送
        this.updateHourlyChartSilentWithCache(chartData);
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

        // 新しい比較データを使用
        let currentData, previousData, labels, currentLabel, previousLabel;
        
        if (chartData.comparisonData) {
            const compData = chartData.comparisonData;
            currentData = compData.current.data;
            previousData = compData.comparison.data;
            labels = compData.current.labels;
            currentLabel = compData.currentLabel;
            previousLabel = compData.comparisonLabel;
        } else {
            // フォールバック: 旧週別データ
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
            
            currentData = currentWeek ? currentWeek.dailyTokens : new Array(7).fill(0);
            previousData = previousWeek ? previousWeek.dailyTokens : new Array(7).fill(0);
            labels = ['日', '月', '火', '水', '木', '金', '土'];
            currentLabel = '今週';
            previousLabel = '先週';
        }
        
        this.charts.weekly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: currentLabel,
                        data: currentData,
                        backgroundColor: '#3b82f6',
                        borderColor: '#1e40af',
                        borderWidth: 1
                    },
                    {
                        label: previousLabel,
                        data: previousData,
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
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    },
                    x: {
                        grid: {
                            color: this.settings?.darkMode ? '#334155' : '#e2e8f0'
                        },
                        ticks: {
                            color: this.settings?.darkMode ? '#cbd5e1' : '#64748b'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 週別比較チャートのサイレント更新（旧互換性維持）
     */
    updateWeeklyChartSilent(chartData) {
        // 新しいメソッドに転送
        this.updateWeeklyChartSilentWithCache(chartData);
    }

    /**
     * 使用量チャートを更新（チャートタイプ変更時）
     */
    updateUsageChart(chartData) {
        this.createUsageChartWithCache(chartData);
    }

    /**
     * 期間に応じたチャートラベルフォーマット
     */
    formatChartLabel(dateString, meta) {
        if (!meta || !meta.unit) {
            // メタ情報がない場合はデフォルトフォーマット
            return Utils.formatDate ? Utils.formatDate(dateString) : dateString;
        }

        switch (meta.unit) {
            case 'hourly':
                // 時間データ（"0:00", "1:00" など）
                return dateString;
            case 'monthly':
                // 月別データ（"2024/01", "2024/02" など）
                return dateString;
            case 'daily':
            default:
                // 日別データ（通常の日付フォーマット）
                return Utils.formatDate ? Utils.formatDate(dateString) : dateString;
        }
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