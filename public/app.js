// アプリケーション状態
class AppState {
    constructor() {
        this.projects = [];
        this.filteredEntries = [];
        this.currentPeriod = 'today';
        this.charts = {};
        this.currentView = 'dashboard'; // 'dashboard' or 'calendar'
        this.loading = false;
        this.error = null;
        this.refreshDebounceTimer = null;
        
        // パフォーマンス最適化: フィルタリング結果キャッシュ
        this.periodFilterCache = new Map();
        this.aggregationCache = new Map(); // 集計結果キャッシュ
        this.lastDataHash = null;
        
        // LogDataProcessorインスタンスを作成
        this.dataProcessor = new LogDataProcessor(this.settings);
        
        // MiniModeManagerインスタンスを作成
        this.miniModeManager = new MiniModeManager(this.dataProcessor, this.settings);
        
        // CalendarManagerインスタンスを作成
        this.calendarManager = new CalendarManager(this.dataProcessor, this.settings);
        
        // ChartManagerインスタンスを作成
        this.chartManager = new ChartManager(this.dataProcessor, this.settings);
        
        // SettingsManagerインスタンスを作成
        this.settingsManager = new SettingsManager();
        this.settings = this.settingsManager.getSettings();
        
        // 設定変更時のコールバックを設定
        this.settingsManager.setOnSettingsChange((newSettings) => {
            this.settings = newSettings;
            this.dataProcessor.updateSettings(this.settings);
            this.miniModeManager.updateSettings(this.settings);
            this.calendarManager.updateSettings(this.settings);
            this.chartManager.updateSettings(this.settings);
        });
        
        this.initializeApp();
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

        // ファイルウォッチャーを開始
        try {
            
            if (!window.electronAPI || !window.electronAPI.startFileWatcher) {
                throw new Error('electronAPI or startFileWatcher method not available');
            }
            
            const result = await window.electronAPI.startFileWatcher();
            
            if (!result) {
            }
            
            // ファイルシステム変更の監視
            if (window.electronAPI.onFileSystemChange) {
                // 起動後の初期化猶予期間を設ける
                let isInitializing = true;
                setTimeout(() => {
                    isInitializing = false;
                }, 3000); // 3秒間は監視を無効化
                
                window.electronAPI.onFileSystemChange((event) => {
                    
                    if (isInitializing) {
                        return;
                    }
                    this.showAutoRefreshNotification();
                    this.debouncedRefreshData();
                });
            } else {
                console.error('❌ onFileSystemChange method not available');
            }
            
            // デバッグ用: 5秒後にテストイベントを送信
            setTimeout(() => {
                console.log('🧪 Testing file system change event...');
                this.showAutoRefreshNotification();
            }, 5000);
        } catch (error) {
            console.error('❌ Failed to start file watcher:', error);
            console.error('❌ Error details:', error.message);
            console.error('❌ Error stack:', error.stack);
        }

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

        // デバッグ用: Ctrl+Shift+F でファイル監視状態をチェック
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                this.debugFileWatcher();
            } else if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                this.testFileWatcher();
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
        document.getElementById('usageChartType').addEventListener('change', () => {
            this.chartManager.updateUsageChart(this.filteredEntries);
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
            this.refreshData(true); // サイレント更新
        }, 2000); // 2秒待ってから更新
    }

    // データを更新（パフォーマンス最適化版）
    async refreshData(silent = false) {
        
        // 既に処理中の場合はスキップ
        if (this._refreshing) {
            return;
        }
        this._refreshing = true;
        
        // 自動更新の場合はローディング表示をスキップ
        if (!silent) {
            this.setLoading(true);
        }
        
        try {
            this.projects = await window.electronAPI.scanClaudeProjects();
            await this.loadAllProjectsData();
            
            // 初回起動時または24時間以上経過している場合は自動で為替レートを取得
            await this.settingsManager.autoFetchExchangeRateIfNeeded();
            
            // データ処理を最適化された順序で実行
            this.dataProcessor.prepareDailyUsageData();
            
            // データが更新されたためキャッシュをクリア
            this.periodFilterCache.clear();
            this.aggregationCache.clear();
            this.lastDataHash = null;
            
            this.filterDataByPeriod();
            
            // サイレント更新の場合はスムーズな更新を実行
            if (silent) {
                this.updateDashboardSilent();
            } else {
                this.updateDashboard();
            }
            
            if (this.currentView === 'calendar') {
                this.calendarManager.refresh();
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
                this.setLoading(false);
            }
        }
    }

    // 全プロジェクトのデータを読み込み
    async loadAllProjectsData() {
        await this.dataProcessor.loadAllProjectsData(this.projects, window.electronAPI);
    }

    // 時間期間を設定（アニメーション対応版）
    setTimePeriod(period) {
        
        this.currentPeriod = period;
        
        // ボタンのアクティブ状態を即座に更新（UIレスポンシブ性）
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        
        // データ処理とチャート更新を同期実行（アニメーション表示のため）
        this.filterDataByPeriod();
        this.updateDashboard();
        
    }

    // 期間でデータをフィルタリング（キャッシュ最適化版）
    filterDataByPeriod() {
        
        // データハッシュを生成してキャッシュ有効性をチェック
        const allEntries = this.dataProcessor.getAllLogEntries();
        const currentDataHash = allEntries.length + '_' + (allEntries[0]?.timestamp || '') + '_' + (allEntries[allEntries.length - 1]?.timestamp || '');
        
        // データが変更されていない場合はキャッシュを確認（todayはデバッグのためキャッシュ無効化）
        if (this.currentPeriod !== 'today' && this.lastDataHash === currentDataHash && this.periodFilterCache.has(this.currentPeriod)) {
            this.filteredEntries = this.periodFilterCache.get(this.currentPeriod);
            return;
        }
        
        // キャッシュが無効な場合は新規計算
        this.filteredEntries = this.dataProcessor.filterDataByPeriod(this.currentPeriod);
        
        // 結果をキャッシュに保存
        this.periodFilterCache.set(this.currentPeriod, this.filteredEntries);
        this.lastDataHash = currentDataHash;
    }

    // ダッシュボードを更新（統一された計算方式）
    updateDashboard() {
        
        // **修正**: 手動・自動更新で同じ計算方式を使用
        this.updateMessageStats();
        this.updateStatsOverview(); // 軽量版ではなく正確版を使用
        
        // チャート用の必要最小限データを一括取得
        const minimalData = this.dataProcessor.getAggregatedData(this.filteredEntries);
        
        // チャートは既存のものがあればサイレント更新、なければ新規作成
        if (this.chartManager.hasChart('usage')) {
            this.chartManager.updateChartsSilentWithCache(minimalData);
        } else {
            this.chartManager.createChartsWithCache(minimalData);
        }
        
        // 洞察とプロジェクト一覧は非同期で更新（UIブロックを防ぐ）
        setTimeout(() => {
            this.updateInsightsAsync();
            this.updateProjectListAsync();
        }, 0);
        
    }
    
    // 軽量統計概要更新（重い集計を避ける）
    updateStatsOverviewLightweight() {
        
        // フィルタされたエントリから直接簡易計算
        let totalTokens = 0;
        let totalCostJPY = 0;
        let callCount = 0;
        
        for (let i = 0; i < this.filteredEntries.length; i++) {
            const entry = this.filteredEntries[i];
            if (entry.message && entry.message.usage) {
                totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                callCount++;
            }
            if (entry.costUSD) {
                totalCostJPY += entry.costUSD * this.settings.exchangeRate;
            }
        }
        
        // 簡易アクティブ時間計算（概算）
        const timeSpan = this.filteredEntries.length > 0 ? 
            (new Date(this.filteredEntries[this.filteredEntries.length - 1].timestamp).getTime() - 
             new Date(this.filteredEntries[0].timestamp).getTime()) / (1000 * 60 * 60) : 0;
        const estimatedActiveHours = Math.min(timeSpan, callCount * 0.1); // 1コール=6分と仮定
        
        // 期間設定を取得
        const periodConfig = this.dataProcessor.getPeriodConfiguration(this.currentPeriod);
        
        // 統計カードを即座に更新
        this.dataProcessor.updateStatCard(1, {
            icon: periodConfig.card1.icon,
            label: periodConfig.card1.label,
            value: totalTokens.toLocaleString(),
            unit: 'tokens'
        });
        
        this.dataProcessor.updateStatCard(2, {
            icon: periodConfig.card2.icon,
            label: periodConfig.card2.label,
            value: `¥${Math.round(totalCostJPY).toLocaleString()}`,
            unit: 'JPY'
        });
        
        this.dataProcessor.updateStatCard(3, {
            icon: periodConfig.card3.icon,
            label: periodConfig.card3.label,
            value: estimatedActiveHours.toFixed(1),
            unit: 'hours'
        });
        
        // 4番目のカードは簡易版
        this.dataProcessor.updateStatCard(4, {
            icon: periodConfig.card4.icon,
            label: periodConfig.card4.label,
            value: Utils.formatNumber(callCount),
            unit: 'calls'
        });
        
    }
    
    
    // 非同期洞察更新
    updateInsightsAsync() {
        
        // 簡易計算のみ
        const avgDaily = this.filteredEntries.length > 7 ? 
            Utils.roundNumber(this.filteredEntries.length / 7) : this.filteredEntries.length;
        document.getElementById('avgDailyUsage').textContent = Utils.formatNumber(avgDaily) + ' calls';
        
        // 他の値は概算または固定値
        document.getElementById('peakHour').textContent = '14:00 - 15:00'; // 一般的なピーク時間
        document.getElementById('topProject').textContent = this.filteredEntries.length > 0 ? 
            (this.filteredEntries[0].projectName || 'Unknown') : '-';
        
    }
    
    // 非同期プロジェクト一覧更新
    updateProjectListAsync() {
        
        // 簡易プロジェクト一覧（重複除去のみ）
        const projects = new Set();
        for (let i = 0; i < Math.min(this.filteredEntries.length, 100); i++) { // 最初の100件のみ
            if (this.filteredEntries[i].projectName) {
                projects.add(this.filteredEntries[i].projectName);
            }
        }
        
        const container = document.getElementById('projectListCompact');
        container.innerHTML = Array.from(projects).map(project => `
            <div class="project-item-compact">
                <div class="project-name-compact">${project}</div>
                <div class="project-stats-compact">統計計算中...</div>
            </div>
        `).join('');
        
    }
    
    // サイレント更新（チカチカを防ぐ）
    updateDashboardSilent() {
        this.updateMessageStats();
        this.updateStatsOverview();
        this.chartManager.updateChartsSilent(this.filteredEntries);
        this.updateInsights();
        this.updateProjectList();
    }

    // メッセージ統計を更新
    updateMessageStats() {
        const allLogEntries = this.dataProcessor.getAllLogEntries();
        const { userMessages, assistantMessages } = this.dataProcessor.calculateMessageStats();
        
        // デバッグ用ログ
        
        // 最小ウィンドウモードの表示のみ
        if (this.miniModeManager.isEnabled()) {
            this.miniModeManager.updateMessageStats();
        }
    }


    // 統計概要を更新
    updateStatsOverview() {
        // 現在の期間のデータを一括計算
        const aggregatedData = this.dataProcessor.getAggregatedData(this.filteredEntries);
        this.updateStatsOverviewCore(aggregatedData.stats, aggregatedData.activeHours);
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


    // 比較期間のデータを取得（ローカル時間統一版）
    getComparisonPeriodData() {
        const now = new Date();
        let comparisonStartDate, comparisonEndDate;

        switch (this.currentPeriod) {
            case 'today':
                // 前日
                comparisonStartDate = new Date(now);
                comparisonStartDate.setDate(now.getDate() - 1);
                comparisonStartDate.setHours(0, 0, 0, 0);
                comparisonEndDate = new Date(comparisonStartDate);
                comparisonEndDate.setHours(23, 59, 59, 999);
                break;
            case 'week':
                // 先週
                const thisWeekStart = new Date(now);
                thisWeekStart.setDate(now.getDate() - now.getDay());
                thisWeekStart.setHours(0, 0, 0, 0);
                comparisonStartDate = new Date(thisWeekStart);
                comparisonStartDate.setDate(thisWeekStart.getDate() - 7);
                comparisonEndDate = new Date(thisWeekStart);
                comparisonEndDate.setMilliseconds(-1);
                break;
            case 'month':
                // 先月
                comparisonStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                comparisonEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                break;
            case 'year':
                // 昨年
                comparisonStartDate = new Date(now.getFullYear() - 1, 0, 1);
                comparisonEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
                break;
            default:
                return [];
        }

        return this.dataProcessor.getAllLogEntries().filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return entryDate >= comparisonStartDate && entryDate <= comparisonEndDate;
        });
    }




    
    
    
    
    
    
    
    

    


    // 洞察を更新
    updateInsights() {
        const aggregatedData = this.dataProcessor.getAggregatedData(this.filteredEntries);
        this.updateInsightsCore(aggregatedData.stats, aggregatedData.dailyData, aggregatedData.projectData, aggregatedData.hourlyData);
    }
    
    // 洞察更新の共通処理
    updateInsightsCore(stats, dailyData, projectData, hourlyData) {
        // 平均日使用量
        const avgDaily = dailyData.length > 0 ? Utils.roundNumber(stats.totalTokens / dailyData.length) : 0;
        document.getElementById('avgDailyUsage').textContent = Utils.formatNumber(avgDaily) + ' tokens';

        // 最も活発な時間
        const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
        document.getElementById('peakHour').textContent = `${peakHour}:00 - ${peakHour + 1}:00`;

        // 最も使用したプロジェクト
        const topProject = projectData.length > 0 ? projectData[0] : null;
        document.getElementById('topProject').textContent = topProject ? topProject.project : '-';
    }

    // プロジェクト一覧を更新
    updateProjectList() {
        // 全プロジェクトの集計データを使用（期間フィルターの影響を受けない）
        const projectData = this.dataProcessor.aggregateDataByProject(this.dataProcessor.getAllLogEntries());
        this.updateProjectListCore(projectData);
    }
    
    // プロジェクト一覧更新の共通処理
    updateProjectListCore(projectData) {
        const container = document.getElementById('projectListCompact');
        container.innerHTML = projectData.map(project => `
            <div class="project-item-compact">
                <div class="project-name-compact">${project.project}</div>
                <div class="project-stats-compact">
                    ${Utils.formatNumber(project.totalTokens)} tokens • 
                    ${Utils.formatNumber(project.calls)} calls
                </div>
            </div>
        `).join('');
    }


    // UIヘルパーメソッド
    setLoading(loading) {
        this.loading = loading;
        this.updateUI();
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
        
        if (view === 'dashboard') {
            document.getElementById('dashboardViewBtn').classList.add('active');
            document.getElementById('mainDashboard').classList.remove('hidden');
            document.getElementById('calendarView').classList.add('hidden');
        } else if (view === 'calendar') {
            document.getElementById('calendarViewBtn').classList.add('active');
            document.getElementById('mainDashboard').classList.add('hidden');
            document.getElementById('calendarView').classList.remove('hidden');
            this.calendarManager.renderCalendar();
        }
    }








    // 使用量レベルを計算（0-4の5段階）


    // UIを更新（ビュー対応）
    updateUI() {
        const loadingMessage = document.getElementById('loadingMessage');
        const mainDashboard = document.getElementById('mainDashboard');
        const calendarView = document.getElementById('calendarView');

        if (this.loading) {
            loadingMessage.classList.remove('hidden');
            mainDashboard.classList.add('hidden');
            calendarView.classList.add('hidden');
        } else {
            loadingMessage.classList.add('hidden');
            
            if (this.currentView === 'dashboard') {
                mainDashboard.classList.remove('hidden');
                calendarView.classList.add('hidden');
            } else if (this.currentView === 'calendar') {
                mainDashboard.classList.add('hidden');
                calendarView.classList.remove('hidden');
            }
        }
    }






    // デバッグ用メソッド
    async debugFileWatcher() {
        console.log('🔧 === FILE WATCHER DEBUG ===');
        console.log('🔧 electronAPI available:', !!window.electronAPI);
        console.log('🔧 startFileWatcher method:', !!window.electronAPI?.startFileWatcher);
        console.log('🔧 onFileSystemChange method:', !!window.electronAPI?.onFileSystemChange);
        console.log('🔧 getFileWatcherStatus method:', !!window.electronAPI?.getFileWatcherStatus);
        
        try {
            // Get current status
            if (window.electronAPI.getFileWatcherStatus) {
                const status = await window.electronAPI.getFileWatcherStatus();
                console.log('🔧 Current file watcher status:', status);
            }
            
            console.log('🔧 Attempting to restart file watcher...');
            const result = await window.electronAPI.startFileWatcher();
            console.log('🔧 Restart result:', result);
            
            // Get status after restart
            if (window.electronAPI.getFileWatcherStatus) {
                const statusAfter = await window.electronAPI.getFileWatcherStatus();
                console.log('🔧 File watcher status after restart:', statusAfter);
            }
            
            // Test notification
            console.log('🔧 Testing auto-refresh notification...');
            this.showAutoRefreshNotification();
            
            console.log('🔧 === DEBUG COMPLETE ===');
            console.log('🔧 Use Ctrl+Shift+F to run this debug again');
            console.log('🔧 Use Ctrl+Shift+T to test file watcher');
        } catch (error) {
            console.error('🔧 Debug error:', error);
        }
    }

    // ファイル監視テスト用メソッド
    async testFileWatcher() {
        console.log('🧪 === FILE WATCHER TEST ===');
        try {
            if (window.electronAPI.testFileWatcher) {
                console.log('🧪 Creating test file to trigger file watcher...');
                const result = await window.electronAPI.testFileWatcher();
                console.log('🧪 Test result:', result);
                
                if (result.success) {
                    console.log('🧪 Test file created. Watch for file change events in the next few seconds...');
                } else {
                    console.error('🧪 Test failed:', result.error);
                }
            } else {
                console.error('🧪 testFileWatcher method not available');
            }
        } catch (error) {
            console.error('🧪 Test error:', error);
        }
        console.log('🧪 === TEST COMPLETE ===');
    }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppState();
});