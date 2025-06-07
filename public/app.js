// アプリケーション状態
class AppState {
    constructor() {
        this.projects = [];
        this.currentPeriod = 'today';
        this.charts = {};
        this.currentView = 'dashboard'; // 'dashboard' or 'calendar'
        this.loading = false;
        this.error = null;
        this.refreshDebounceTimer = null;
        
        // DuckDBデータプロセッサーインスタンスを作成（統一データ処理）
        this.duckDBProcessor = new DuckDBDataProcessor();
        
        // SettingsManagerインスタンスを作成（最初に初期化）
        this.settingsManager = new SettingsManager();
        this.settings = this.settingsManager.getSettings();
        
        // MiniModeManagerインスタンスを作成
        this.miniModeManager = new MiniModeManager(this.duckDBProcessor, this.settings);
        
        // CalendarManagerインスタンスを作成
        this.calendarManager = new CalendarManager(this.duckDBProcessor, this.settings);
        
        // ChartManagerインスタンスを作成
        this.chartManager = new ChartManager(this.duckDBProcessor, this.settings);
        
        // 設定変更時のコールバックを設定
        this.settingsManager.setOnSettingsChange((newSettings) => {
            this.settings = newSettings;
            this.miniModeManager.updateSettings(this.settings);
            this.calendarManager.updateSettings(this.settings);
            this.chartManager.updateSettings(this.settings);
        });
        
        this.initializeApp();
    }

    // 統計カード更新ヘルパー
    updateStatCard(cardNumber, data) {
        document.getElementById(`statIcon${cardNumber}`).textContent = data.icon;
        document.getElementById(`statLabel${cardNumber}`).textContent = data.label;
        document.getElementById(`statValue${cardNumber}`).textContent = data.value;
        document.getElementById(`statUnit${cardNumber}`).textContent = data.unit;
    }

    // 期間設定取得ヘルパー
    getPeriodConfiguration(period) {
        const configs = {
            today: {
                card1: { icon: 'today', label: '今日の使用量' },
                card2: { icon: 'attach_money', label: '今日のコスト' },
                card3: { icon: 'schedule', label: '今日の使用時間' },
                card4: { icon: 'compare_arrows', label: '昨日との比較' }
            },
            week: {
                card1: { icon: 'date_range', label: '今週の使用量' },
                card2: { icon: 'attach_money', label: '今週のコスト' },
                card3: { icon: 'schedule', label: '今週の使用時間' },
                card4: { icon: 'compare_arrows', label: '先週との比較' }
            },
            month: {
                card1: { icon: 'calendar_month', label: '今月の使用量' },
                card2: { icon: 'attach_money', label: '今月のコスト' },
                card3: { icon: 'schedule', label: '今月の使用時間' },
                card4: { icon: 'compare_arrows', label: '先月との比較' }
            },
            year: {
                card1: { icon: 'calendar_today', label: '今年の使用量' },
                card2: { icon: 'attach_money', label: '今年のコスト' },
                card3: { icon: 'schedule', label: '今年の使用時間' },
                card4: { icon: 'compare_arrows', label: '昨年との比較' }
            },
            all: {
                card1: { icon: 'trending_up', label: '総使用量' },
                card2: { icon: 'attach_money', label: '総コスト' },
                card3: { icon: 'schedule', label: '総使用時間' },
                card4: { icon: 'folder', label: 'プロジェクト数' }
            }
        };
        return configs[period] || configs.today;
    }




    // 初期化
    async initializeApp() {
        this.setupEventListeners();
        this.updateUI();
        
        // Electron APIが利用可能かチェック
        if (!window.electronAPI) {
            this.showError('Electron API が利用できません');
            return;
        }

        // DuckDB監視システム (自動リフレッシュはDuckDBキャッシュTTLに依存)
        console.log('🦆 DuckDB監視システムが有効です (30秒キャッシュ)');
        
        // 定期的なデータ更新 (DuckDBキャッシュと同期)
        setInterval(() => {
            console.log('🔄 定期データ更新 (DuckDB) - 期間:', this.currentPeriod);
            // 現在の期間設定を保持してサイレント更新
            this.updateDashboardSilentForCurrentPeriod();
        }, 30000); // 30秒間隔

        // データを読み込み
        await this.refreshData();
    }

    // イベントリスナーを設定
    setupEventListeners() {
        // SettingsManagerのイベントリスナーを設定
        this.settingsManager.setupEventListeners();

        // リフレッシュボタン
        document.getElementById('refreshButton').addEventListener('click', () => {
            this.refreshData();
        });

        // 最小ウィンドウモード切り替え
        document.getElementById('miniModeToggle').addEventListener('click', async () => {
            try {
                await this.miniModeManager.toggle();
            } catch (error) {
                this.settingsManager.showError(error.message);
            }
        });

        // 最小ウィンドウモード終了
        document.getElementById('exitMiniMode').addEventListener('click', async () => {
            try {
                await this.miniModeManager.exit();
            } catch (error) {
                this.settingsManager.showError(error.message);
            }
        });
        
        // 最小モード時間範囲変更
        document.getElementById('miniTimeRange').addEventListener('change', (e) => {
            this.miniModeManager.setTimeRange(e.target.value);
        });

        // DuckDB監視システム用: Ctrl+Shift+T でDuckDBテスト
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                this.testDuckDBMonitoring();
            }
        });

        // 時間フィルターボタン
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                this.setTimePeriod(period);
            });
        });


        // チャートタイプ変更
        document.getElementById('usageChartType').addEventListener('change', async () => {
            const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
            this.chartManager.updateUsageChart(chartData);
        });

        // ビュー切り替え
        document.getElementById('dashboardViewBtn').addEventListener('click', () => {
            this.switchView('dashboard');
        });

        document.getElementById('calendarViewBtn').addEventListener('click', () => {
            this.switchView('calendar');
        });

        // カレンダーナビゲーション
        document.getElementById('prevMonthBtn').addEventListener('click', () => {
            this.calendarManager.goToPreviousMonth();
        });

        document.getElementById('nextMonthBtn').addEventListener('click', () => {
            this.calendarManager.goToNextMonth();
        });

        document.getElementById('todayBtn').addEventListener('click', () => {
            this.calendarManager.goToToday();
        });

        document.getElementById('calendarRefreshBtn').addEventListener('click', () => {
            this.refreshData();
        });
    }

    // デバウンス付きデータ更新（連続する更新を制限）
    debouncedRefreshData() {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }
        
        this.refreshDebounceTimer = setTimeout(() => {
            this.refreshData(true, true); // サイレント + 自動更新
        }, 5000); // 5秒待ってから更新
    }

    // データを更新（パフォーマンス最適化版）
    async refreshData(silent = false, isAutoUpdate = false) {
        
        // 既に処理中の場合はスキップ
        if (this._refreshing) {
            return;
        }
        this._refreshing = true;
        
        // 自動更新の場合は部分的なローディング表示
        if (!silent) {
            if (isAutoUpdate) {
                this.setPartialLoading(true);
            } else {
                this.setLoading(true);
            }
        }
        
        try {
            this.projects = await window.electronAPI.scanClaudeProjects();
            
            // 初回起動時または24時間以上経過している場合は自動で為替レートを取得
            await this.settingsManager.autoFetchExchangeRateIfNeeded();
            
            // キャッシュをクリア
            this.duckDBProcessor.clearCache();
            
            // チャートデータを一括取得（DuckDB統一処理）
            const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
            
            // 自動更新またはサイレント更新の場合はスムーズな更新を実行
            if (silent || isAutoUpdate) {
                this.updateDashboardSilentWithData(chartData);
            } else {
                this.updateDashboardWithData(chartData);
            }
            
            if (this.currentView === 'calendar') {
                await this.calendarManager.refresh();
            }
            
            // 最小ウィンドウモードの場合は更新
            if (this.miniModeManager.isEnabled()) {
                this.miniModeManager.update();
            }
        } catch (error) {
            console.error('Failed to refresh data:', error);
            if (!silent) {
                this.settingsManager.showError('データの読み込みに失敗しました: ' + error.message);
            }
        } finally {
            this._refreshing = false;
            if (!silent) {
                if (isAutoUpdate) {
                    this.setPartialLoading(false);
                } else {
                    this.setLoading(false);
                }
            }
        }
    }


    // 時間期間を設定（アニメーション対応版）
    setTimePeriod(period) {
        
        this.currentPeriod = period;
        
        // ボタンのアクティブ状態を即座に更新（UIレスポンシブ性）
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        
        // 即座にローディング状態を表示
        this.showPeriodChangeLoading();
        
        // 非同期でデータ更新（UIブロックを避ける）
        this.updateDashboardAsync();
        
    }

    // 期間変更時のローディング表示
    showPeriodChangeLoading() {
        // 統計カードにローディング状態を表示
        for (let i = 1; i <= 4; i++) {
            const valueElement = document.getElementById(`statValue${i}`);
            if (valueElement) {
                valueElement.style.opacity = '0.6';
                valueElement.textContent = '...';
            }
        }
        
        // チャートにローディングオーバーレイ
        const chartContainers = ['usageChart', 'hourlyChart', 'weeklyChart'];
        chartContainers.forEach(chartId => {
            const container = document.getElementById(chartId)?.parentElement;
            if (container) {
                container.style.opacity = '0.7';
            }
        });
    }

    // 期間変更後のローディング解除
    hidePeriodChangeLoading() {
        // 統計カードの復元
        for (let i = 1; i <= 4; i++) {
            const valueElement = document.getElementById(`statValue${i}`);
            if (valueElement) {
                valueElement.style.opacity = '1';
            }
        }
        
        // チャートコンテナの復元
        const chartContainers = ['usageChart', 'hourlyChart', 'weeklyChart'];
        chartContainers.forEach(chartId => {
            const container = document.getElementById(chartId)?.parentElement;
            if (container) {
                container.style.opacity = '1';
            }
        });
    }

    // 非同期ダッシュボード更新
    async updateDashboardAsync() {
        try {
            const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
            this.updateDashboardWithData(chartData);
            this.hidePeriodChangeLoading();
        } catch (error) {
            console.error('Dashboard update failed:', error);
            this.hidePeriodChangeLoading();
        }
    }


    // フィルタリングは不要（AdvancedLogDataProcessorで処理）

    // ダッシュボードを更新（DuckDB統一処理）
    async updateDashboard() {
        // DuckDBでデータ取得して更新
        const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
        this.updateDashboardWithData(chartData);
    }
    
    // ダッシュボードを事前取得データで更新（重複処理を回避）
    async updateDashboardWithData(chartData) {
        // **高精度版**: メモリ内フィルタリングで高速化
        console.time('🚀 Dashboard Update');
        this.updateMessageStats();
        await this.updateStatsOverviewWithData(chartData); // 事前取得データを使用
        console.timeEnd('🚀 Dashboard Update');
        
        // チャートは既存のものがあればサイレント更新、なければ新規作成
        if (this.chartManager.hasChart('usage')) {
            this.chartManager.updateChartsSilentWithCache(chartData);
        } else {
            this.chartManager.createChartsWithCache(chartData);
        }
        
        // 洞察は非同期で更新（UIブロックを防ぐ）
        setTimeout(() => {
            this.updateInsightsAsyncWithData(chartData);
        }, 0);
    }
    
    // 軽量統計概要更新（一時的に無効化）
    updateStatsOverviewLightweight() {
        console.log('📊 軽量統計更新は一時的に無効化');
    }
    
    
    // 非同期洞察更新
    updateInsightsAsync() {
        this.updateInsights();
    }
    
    
    // サイレント更新（チカチカを防ぐ）
    async updateDashboardSilent() {
        // DuckDBでデータ取得して更新
        const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
        this.updateDashboardSilentWithData(chartData);
    }
    
    // サイレント更新を事前取得データで実行（重複処理を回避）
    async updateDashboardSilentWithData(chartData) {
        this.updateMessageStats();
        await this.updateStatsOverviewWithData(chartData); // 事前取得データを使用
        
        this.chartManager.updateChartsSilent(chartData);
        
        this.updateInsightsWithData(chartData);
    }

    // 現在の期間設定でサイレント更新（定期更新用）
    async updateDashboardSilentForCurrentPeriod() {
        try {
            console.log('🔄 期間別サイレント更新:', this.currentPeriod);
            const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
            this.updateDashboardSilentWithData(chartData);
        } catch (error) {
            console.error('定期更新エラー:', error);
        }
    }

    // メッセージ統計を更新（一時的に無効化）
    updateMessageStats() {
        // 最小ウィンドウモードの表示のみ
        if (this.miniModeManager.isEnabled()) {
            this.miniModeManager.updateMessageStats();
        }
    }


    // 統計概要を更新（高精度版）
    async updateStatsOverview() {
        try {
            console.time('Advanced Stats Calculation');
            
            // 全ファイルベースで期間統計を取得
            const periodStats = await this.dataProcessor.getPeriodStats(this.currentPeriod);
            
            // 期間設定を取得
            const periodConfig = this.getPeriodConfiguration(this.currentPeriod);
            
            // アクティブ時間の計算（実際のタイムスタンプ範囲ベース）
            const actualActiveHours = await this.dataProcessor.calculateActualActiveHours(this.currentPeriod);
            
            // 統計カードを更新
            this.updateStatCard(1, {
                icon: periodConfig.card1.icon,
                label: periodConfig.card1.label,
                value: Utils.formatNumber(periodStats.totalTokens),
                unit: 'tokens'
            });
            
            // コストデータの表示判定
            const hasRealCost = periodStats.costUSD > 0;
            const costValue = hasRealCost ? 
                Utils.formatCurrency(periodStats.costJPY) : 
                Utils.formatCurrency(this.dataProcessor.estimateCost(periodStats.inputTokens, periodStats.outputTokens).jpy);
            
            const costLabel = hasRealCost ? 
                periodConfig.card2.label : 
                periodConfig.card2.label + ' (推定)';
            
            this.updateStatCard(2, {
                icon: periodConfig.card2.icon,
                label: costLabel,
                value: costValue,
                unit: hasRealCost ? 'JPY' : '推定'
            });
            
            this.updateStatCard(3, {
                icon: periodConfig.card3.icon,
                label: periodConfig.card3.label,
                value: actualActiveHours.toFixed(1),
                unit: 'hours'
            });
            
            // 4番目のカード
            this.updateStatCard(4, {
                icon: periodConfig.card4.icon,
                label: periodConfig.card4.label,
                value: Utils.formatNumber(periodStats.entries),
                unit: 'entries'
            });
            
            console.timeEnd('Advanced Stats Calculation');
            console.log(`📊 高精度統計: ${periodStats.totalTokens.toLocaleString()}トークン, ${hasRealCost ? '実際' : '推定'}コスト: ${costValue}`);
            
        } catch (error) {
            console.error('統計計算エラー:', error);
        }
    }
    
    // 統計概要を事前取得データで更新（重複処理を回避）
    async updateStatsOverviewWithData(chartData) {
        try {
            console.time('Advanced Stats Calculation');
            
            // chartDataの検証
            if (!chartData || !chartData.stats) {
                console.warn('⚠️ chartDataまたはstatsが未定義です:', chartData);
                // デフォルトデータで統計表示
                this.updateStatsDisplay({
                    totalTokens: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    costUSD: 0,
                    costJPY: 0,
                    entries: 0
                }, 0);
                return;
            }
            
            // chartDataから期間統計を抽出（フィールド名を正しくマッピング）
            const periodStats = {
                totalTokens: chartData.stats.totalTokens || 0,
                inputTokens: chartData.stats.inputTokens || 0,
                outputTokens: chartData.stats.outputTokens || 0,
                costUSD: chartData.stats.costUSD || 0,
                costJPY: chartData.stats.costJPY || 0,
                entries: chartData.stats.entries || 0
            };
            
            // activeHoursを正しく取得（chartDataの直接プロパティとして渡される）
            const activeHours = chartData.activeHours || 0;
            
            console.log('📊 updateStatsOverviewWithData受信データ:', {
                chartData: {
                    stats: chartData.stats,
                    activeHours: chartData.activeHours
                },
                extractedStats: periodStats,
                extractedActiveHours: activeHours
            });
            
            this.updateStatsDisplay(periodStats, activeHours);
        } catch (error) {
            console.error('統計更新エラー:', error);
            // エラー時もデフォルト値で表示
            this.updateStatsDisplay({
                totalTokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                costUSD: 0,
                costJPY: 0,
                entries: 0
            }, 0);
        }
    }
    
    // 統計表示の共通処理
    updateStatsDisplay(periodStats, preCalculatedActiveHours = null) {
        try {
            // デバッグ情報を出力
            console.log('📊 統計表示データ:', {
                periodStats,
                preCalculatedActiveHours,
                currentPeriod: this.currentPeriod
            });
            
            // 期間設定を取得
            const periodConfig = this.getPeriodConfiguration(this.currentPeriod);
            
            // 統計データの検証とfallback
            const safeStats = {
                totalTokens: periodStats.totalTokens || 0,
                inputTokens: periodStats.inputTokens || 0,
                outputTokens: periodStats.outputTokens || 0,
                costUSD: periodStats.costUSD || 0,
                costJPY: periodStats.costJPY || 0,
                entries: periodStats.entries || 0
            };
            
            // アクティブ時間の計算
            const actualActiveHours = preCalculatedActiveHours !== null && preCalculatedActiveHours !== undefined ? 
                preCalculatedActiveHours : 
                0; // fallback
            
            // 統計カードを更新
            this.updateStatCard(1, {
                icon: periodConfig.card1.icon,
                label: periodConfig.card1.label,
                value: Utils.formatNumber(safeStats.totalTokens),
                unit: 'tokens'
            });
            
            // コストデータの表示判定
            const hasRealCost = safeStats.costUSD > 0;
            const costValue = hasRealCost ? 
                Utils.formatCurrency(safeStats.costJPY) : 
                Utils.formatCurrency(this.duckDBProcessor.estimateCost(safeStats.inputTokens, safeStats.outputTokens).jpy);
            
            const costLabel = hasRealCost ? 
                periodConfig.card2.label : 
                periodConfig.card2.label + ' (推定)';
            
            this.updateStatCard(2, {
                icon: periodConfig.card2.icon,
                label: costLabel,
                value: costValue,
                unit: hasRealCost ? 'JPY' : '推定'
            });
            
            this.updateStatCard(3, {
                icon: periodConfig.card3.icon,
                label: periodConfig.card3.label,
                value: actualActiveHours.toFixed(1),
                unit: 'hours'
            });
            
            // 4番目のカード
            this.updateStatCard(4, {
                icon: periodConfig.card4.icon,
                label: periodConfig.card4.label,
                value: Utils.formatNumber(safeStats.entries),
                unit: 'entries'
            });
            
            console.timeEnd('Advanced Stats Calculation');
            console.log(`📊 高精度統計: ${safeStats.totalTokens.toLocaleString()}トークン, ${hasRealCost ? '実際' : '推定'}コスト: ${costValue}, アクティブ時間: ${actualActiveHours}h`);
            
        } catch (error) {
            console.error('統計表示エラー:', error);
        }
    }
    
    // 統計概要更新の共通処理
    updateStatsOverviewCore(currentStats, currentActiveHours) {
        
        // 比較期間のデータを計算
        const comparisonData = this.getComparisonPeriodData();
        const comparisonStats = this.dataProcessor.calculateStats(comparisonData);
        
        // 期間に応じてラベルとアイコンを設定
        const periodConfig = this.dataProcessor.getPeriodConfiguration(this.currentPeriod);
        
        // 統計カードを更新
        this.dataProcessor.updateStatCard(1, {
            icon: periodConfig.card1.icon,
            label: periodConfig.card1.label,
            value: Utils.formatNumber(currentStats.totalTokens),
            unit: 'tokens'
        });
        
        this.dataProcessor.updateStatCard(2, {
            icon: periodConfig.card2.icon,
            label: periodConfig.card2.label,
            value: Utils.formatCurrency(currentStats.costJPY),
            unit: 'JPY'
        });
        
        this.dataProcessor.updateStatCard(3, {
            icon: periodConfig.card3.icon,
            label: periodConfig.card3.label,
            value: currentActiveHours.toFixed(1),
            unit: 'hours'
        });
        
        // 4番目のカードの値を期間に応じて設定
        let card4Value, card4Unit;
        if (this.currentPeriod === 'all') {
            card4Value = this.projects.length.toString();
            card4Unit = 'projects';
        } else {
            card4Value = Utils.formatNumber(comparisonStats.totalTokens);
            card4Unit = 'tokens';
        }
        
        this.dataProcessor.updateStatCard(4, {
            icon: periodConfig.card4.icon,
            label: periodConfig.card4.label,
            value: card4Value,
            unit: card4Unit
        });
    }


    // 比較期間のデータを取得（一時的に無効化）
    getComparisonPeriodData() {
        return [];
    }




    
    
    
    
    
    
    
    

    


    // 洞察を更新
    async updateInsights() {
        try {
            const chartData = await this.duckDBProcessor.getChartCompatibleData(this.currentPeriod);
            this.updateInsightsWithData(chartData);
        } catch (error) {
            console.error('洞察更新エラー:', error);
        }
    }
    
    // 洞察を事前取得データで更新（重複処理を回避）
    updateInsightsWithData(chartData) {
        try {
            // 平均日使用量
            const avgDaily = chartData.dailyData.length > 0 ? 
                Utils.roundNumber(chartData.stats.totalTokens / chartData.dailyData.length) : 0;
            document.getElementById('avgDailyUsage').textContent = Utils.formatNumber(avgDaily) + ' tokens';

            // 最も活発な時間
            const peakHour = chartData.hourlyData.indexOf(Math.max(...chartData.hourlyData));
            document.getElementById('peakHour').textContent = `${peakHour}:00 - ${peakHour + 1}:00`;
        } catch (error) {
            console.error('洞察更新エラー:', error);
        }
    }
    
    // 非同期洞察更新（事前取得データ版）
    updateInsightsAsyncWithData(chartData) {
        this.updateInsightsWithData(chartData);
    }
    
    // 洞察更新の共通処理
    updateInsightsCore(stats, dailyData, hourlyData) {
        // 平均日使用量
        const avgDaily = dailyData.length > 0 ? Utils.roundNumber(stats.totalTokens / dailyData.length) : 0;
        document.getElementById('avgDailyUsage').textContent = Utils.formatNumber(avgDaily) + ' tokens';

        // 最も活発な時間
        const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
        document.getElementById('peakHour').textContent = `${peakHour}:00 - ${peakHour + 1}:00`;
    }



    // UIヘルパーメソッド
    setLoading(loading) {
        this.loading = loading;
        this.updateUI();
    }

    // ローディング状態を部分的に更新（画面全体を隠さない）
    setPartialLoading(loading) {
        this.loading = loading;
        // ローディングインジケーターのみ更新
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            if (loading) {
                refreshButton.style.opacity = '0.6';
                refreshButton.style.animation = 'spin 1s linear infinite';
                refreshButton.disabled = true;
            } else {
                refreshButton.style.opacity = '1';
                refreshButton.style.animation = '';
                refreshButton.disabled = false;
            }
        }
    }

    updateUI() {
        const loadingMessage = document.getElementById('loadingMessage');
        const mainDashboard = document.getElementById('mainDashboard');

        if (this.loading) {
            loadingMessage.classList.remove('hidden');
            mainDashboard.classList.add('hidden');
        } else {
            loadingMessage.classList.add('hidden');
            mainDashboard.classList.remove('hidden');
        }
    }

    showAutoRefreshNotification() {
        // リフレッシュボタンにアニメーションを追加
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            refreshButton.style.animation = 'spin 0.5s ease-in-out';
            setTimeout(() => {
                refreshButton.style.animation = '';
            }, 500);
        }
        
        // 簡易的な通知を表示
    }

    // ビュー切り替え
    switchView(view) {
        this.currentView = view;
        
        // ビューボタンのアクティブ状態を更新
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // フィルターバーとメインコンテナの参照
        const timeFilterBar = document.getElementById('timeFilterBar');
        const mainContainer = document.querySelector('.main-container');
        
        if (view === 'dashboard') {
            document.getElementById('dashboardViewBtn').classList.add('active');
            document.getElementById('mainDashboard').classList.remove('hidden');
            document.getElementById('calendarView').classList.add('hidden');
            
            // フィルターバーを表示
            timeFilterBar.classList.remove('hidden');
            mainContainer.classList.add('with-filter-bar');
        } else if (view === 'calendar') {
            document.getElementById('calendarViewBtn').classList.add('active');
            document.getElementById('mainDashboard').classList.add('hidden');
            document.getElementById('calendarView').classList.remove('hidden');
            
            // フィルターバーを非表示
            timeFilterBar.classList.add('hidden');
            mainContainer.classList.remove('with-filter-bar');
            
            this.calendarManager.renderCalendar();
        }
    }








    // 使用量レベルを計算（0-4の5段階）


    // UIを更新（ビュー対応）
    updateUI() {
        const loadingMessage = document.getElementById('loadingMessage');
        const mainDashboard = document.getElementById('mainDashboard');
        const calendarView = document.getElementById('calendarView');
        const timeFilterBar = document.getElementById('timeFilterBar');
        const mainContainer = document.querySelector('.main-container');

        if (this.loading) {
            loadingMessage.classList.remove('hidden');
            mainDashboard.classList.add('hidden');
            calendarView.classList.add('hidden');
            timeFilterBar.classList.add('hidden');
        } else {
            loadingMessage.classList.add('hidden');
            
            if (this.currentView === 'dashboard') {
                mainDashboard.classList.remove('hidden');
                calendarView.classList.add('hidden');
                timeFilterBar.classList.remove('hidden');
                mainContainer.classList.add('with-filter-bar');
            } else if (this.currentView === 'calendar') {
                mainDashboard.classList.add('hidden');
                calendarView.classList.remove('hidden');
                timeFilterBar.classList.add('hidden');
                mainContainer.classList.remove('with-filter-bar');
            }
        }
    }






    // DuckDB監視システムテスト用メソッド
    async testDuckDBMonitoring() {
        console.log('🦆 === DUCKDB MONITORING TEST ===');
        try {
            if (window.electronAPI.testFileWatcher) {
                console.log('🦆 Testing DuckDB query execution...');
                const result = await window.electronAPI.testFileWatcher();
                console.log('🦆 Test result:', result);
                
                if (result.success) {
                    console.log(`🦆 DuckDB monitoring is working! Found ${result.fileCount} log entries.`);
                    console.log('🦆 Method:', result.method);
                    
                    // DuckDBキャッシュクリアテスト
                    this.duckDBProcessor.clearCache();
                    console.log('🦆 Cache cleared for fresh data test');
                    
                    // データ更新テスト
                    await this.refreshData();
                    console.log('🦆 Data refresh completed');
                } else {
                    console.error('🦆 Test failed:', result.error);
                }
            } else {
                console.error('🦆 DuckDB test method not available');
            }
            
            // 監視ステータス確認
            if (window.electronAPI.getFileWatcherStatus) {
                const status = await window.electronAPI.getFileWatcherStatus();
                console.log('🦆 Monitoring status:', status);
            }
            
        } catch (error) {
            console.error('🦆 Test error:', error);
        }
        console.log('🦆 === TEST COMPLETE ===');
        console.log('🦆 Use Ctrl+Shift+T to run this test again');
    }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppState();
});