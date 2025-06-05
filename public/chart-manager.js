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
        this.createProjectChart(filteredEntries);
        this.createWeeklyChart(filteredEntries);
    }
    
    /**
     * チャートをサイレント更新（再作成せずデータのみ更新）
     */
    updateChartsSilent(filteredEntries) {
        this.updateUsageChartSilent(filteredEntries);
        this.updateHourlyChartSilent(filteredEntries);
        this.updateProjectChartSilent(filteredEntries);
        this.updateWeeklyChartSilent(filteredEntries);
    }
    
    /**
     * キャッシュ対応のチャートサイレント更新
     */
    updateChartsSilentWithCache(aggregatedData) {
        console.time('updateChartsSilent');
        this.updateUsageChartSilentWithCache(aggregatedData.dailyData);
        this.updateHourlyChartSilentWithCache(aggregatedData.hourlyData);
        this.updateProjectChartSilentWithCache(aggregatedData.projectData);
        this.updateWeeklyChartSilentWithCache(aggregatedData.weeklyData);
        console.timeEnd('updateChartsSilent');
    }
    
    /**
     * キャッシュ対応のチャート作成
     */
    createChartsWithCache(aggregatedData) {
        console.time('createCharts');
        this.createUsageChartWithCache(aggregatedData.dailyData);
        this.createHourlyChartWithCache(aggregatedData.hourlyData);
        this.createProjectChartWithCache(aggregatedData.projectData);
        this.createWeeklyChartWithCache(aggregatedData.weeklyData);
        console.timeEnd('createCharts');
    }
    
    /**
     * 簡易版キャッシュ対応チャート更新（実装を簡略化）
     */
    updateUsageChartSilentWithCache(dailyData) {
        if (!this.charts.usage) return;
        const chartType = document.getElementById('usageChartType').value;
        let data, label, color;
        switch (chartType) {
            case 'tokens':
                data = dailyData.map(d => d.totalTokens);
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = dailyData.map(d => d.costJPY);
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = dailyData.map(d => d.calls);
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
        }
        this.charts.usage.data.labels = dailyData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }));
        this.charts.usage.data.datasets[0].data = data;
        this.charts.usage.data.datasets[0].label = label;
        this.charts.usage.data.datasets[0].borderColor = color;
        this.charts.usage.data.datasets[0].backgroundColor = color + '20';
        this.charts.usage.update('active'); // 標準的な滑らかアニメーション
    }
    
    updateHourlyChartSilentWithCache(hourlyData) {
        if (!this.charts.hourly) return;
        this.charts.hourly.data.datasets[0].data = hourlyData;
        this.charts.hourly.update('active'); // 標準的な滑らかアニメーション
    }
    
    updateProjectChartSilentWithCache(projectData) {
        if (!this.charts.project) return;
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
        this.charts.project.data.labels = projectData.map(d => d.project);
        this.charts.project.data.datasets[0].data = projectData.map(d => d.totalTokens);
        this.charts.project.data.datasets[0].backgroundColor = colors.slice(0, projectData.length);
        this.charts.project.update('active'); // 標準的な滑らかアニメーション
    }
    
    updateWeeklyChartSilentWithCache(weeklyData) {
        if (!this.charts.weekly) return;
        const currentWeek = weeklyData[weeklyData.length - 1];
        const previousWeek = weeklyData[weeklyData.length - 2];
        this.charts.weekly.data.datasets[0].data = currentWeek ? currentWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.data.datasets[1].data = previousWeek ? previousWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.update('active'); // 標準的な滑らかアニメーション
    }
    
    /**
     * 簡易版キャッシュ対応チャート作成（フォールバック）
     */
    createUsageChartWithCache(dailyData) { this.createUsageChart(); }
    createHourlyChartWithCache(hourlyData) { this.createHourlyChart(); }
    createProjectChartWithCache(projectData) { this.createProjectChart(); }
    createWeeklyChartWithCache(weeklyData) { this.createWeeklyChart(); }

    /**
     * 使用量推移チャート
     */
    createUsageChart(filteredEntries = null) {
        const ctx = document.getElementById('usageChart').getContext('2d');
        
        if (this.charts.usage) {
            this.charts.usage.destroy();
        }

        const dailyData = this.dataProcessor.aggregateDataByDay(filteredEntries || []);
        const chartType = document.getElementById('usageChartType').value;

        let data, label, color;
        switch (chartType) {
            case 'tokens':
                data = dailyData.map(d => d.totalTokens);
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = dailyData.map(d => d.costJPY);
                label = 'コスト (¥)';
                color = '#10b981';
                break;
            case 'calls':
                data = dailyData.map(d => d.calls);
                label = 'API呼び出し数';
                color = '#f59e0b';
                break;
        }

        this.charts.usage = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dailyData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })),
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
        
        const dailyData = this.dataProcessor.aggregateDataByDay(filteredEntries);
        const chartType = document.getElementById('usageChartType').value;
        
        let data, label, color;
        switch (chartType) {
            case 'tokens':
                data = dailyData.map(d => d.totalTokens);
                label = 'トークン数';
                color = '#3b82f6';
                break;
            case 'cost':
                data = dailyData.map(d => d.costJPY);
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
        this.charts.usage.data.labels = dailyData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }));
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

        const hourlyData = this.dataProcessor.aggregateDataByHour(filteredEntries || []);

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
        
        const hourlyData = this.dataProcessor.aggregateDataByHour(filteredEntries);
        
        // データを更新（チャートを再作成せず）
        this.charts.hourly.data.datasets[0].data = hourlyData;
        this.charts.hourly.update('active'); // 標準的な滑らかアニメーション
    }

    /**
     * プロジェクト別使用量チャート
     */
    createProjectChart(filteredEntries = null) {
        const ctx = document.getElementById('projectChart').getContext('2d');
        
        if (this.charts.project) {
            this.charts.project.destroy();
        }

        const projectData = this.dataProcessor.aggregateDataByProject(filteredEntries || []);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

        this.charts.project = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: projectData.map(d => d.project),
                datasets: [{
                    data: projectData.map(d => d.totalTokens),
                    backgroundColor: colors.slice(0, projectData.length),
                    borderColor: this.settings.darkMode ? '#1e293b' : '#ffffff',
                    borderWidth: 2
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
                        position: 'bottom',
                        labels: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b',
                            usePointStyle: true,
                            padding: 20
                        }
                    }
                }
            }
        });
    }
    
    /**
     * プロジェクト別使用量チャートのサイレント更新
     */
    updateProjectChartSilent(filteredEntries) {
        if (!this.charts.project) {
            this.createProjectChart(filteredEntries);
            return;
        }
        
        const projectData = this.dataProcessor.aggregateDataByProject(filteredEntries);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
        
        // データを更新（チャートを再作成せず）
        this.charts.project.data.labels = projectData.map(d => d.project);
        this.charts.project.data.datasets[0].data = projectData.map(d => d.totalTokens);
        this.charts.project.data.datasets[0].backgroundColor = colors.slice(0, projectData.length);
        this.charts.project.update('active'); // 標準的な滑らかアニメーション
    }

    /**
     * 週別比較チャート
     */
    createWeeklyChart(filteredEntries = null) {
        const ctx = document.getElementById('weeklyChart').getContext('2d');
        
        if (this.charts.weekly) {
            this.charts.weekly.destroy();
        }

        const weeklyData = this.dataProcessor.aggregateDataByWeek(filteredEntries || []);
        const currentWeek = weeklyData[weeklyData.length - 1];
        const previousWeek = weeklyData[weeklyData.length - 2];

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
    updateWeeklyChartSilent(filteredEntries) {
        if (!this.charts.weekly) {
            this.createWeeklyChart(filteredEntries);
            return;
        }
        
        const weeklyData = this.dataProcessor.aggregateDataByWeek(filteredEntries);
        const currentWeek = weeklyData[weeklyData.length - 1];
        const previousWeek = weeklyData[weeklyData.length - 2];
        
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
     * チャートテーマを更新
     */
    updateChartsTheme() {
        // チャートを再作成してテーマを適用
        setTimeout(() => {
            if (this.charts.usage) this.charts.usage.destroy();
            if (this.charts.hourly) this.charts.hourly.destroy();
            if (this.charts.project) this.charts.project.destroy();
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
}