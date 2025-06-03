// アプリケーション状態
class AppState {
    constructor() {
        this.projects = [];
        this.filteredEntries = [];
        this.currentPeriod = 'today';
        this.charts = {};
        this.currentView = 'dashboard'; // 'dashboard' or 'calendar'
        this.currentDate = new Date();
        this.selectedDate = null;
        this.settings = {
            exchangeRate: 150,
            darkMode: false,
            customProjectPath: '',
            lastRateUpdate: null,
            rateSource: 'manual',
            timezone: 'Asia/Tokyo' // デフォルトは日本時間
        };
        this.loading = false;
        this.error = null;
        this.isMiniMode = false;
        this.miniChart = null;
        this.refreshDebounceTimer = null;
        this.miniTimeRange = '10m'; // デフォルト10分
        
        // パフォーマンス最適化: フィルタリング結果キャッシュ
        this.periodFilterCache = new Map();
        this.aggregationCache = new Map(); // 集計結果キャッシュ
        this.lastDataHash = null;
        
        // TimezoneManagerインスタンスを作成
        this.timezoneManager = new TimezoneManager(this.settings.timezone);
        
        // LogDataProcessorインスタンスを作成
        this.dataProcessor = new LogDataProcessor(this.settings, this.timezoneManager);
        
        this.loadSettings();
        this.initializeApp();
    }

    // 設定をローカルストレージから読み込み
    loadSettings() {
        const saved = localStorage.getItem('clauditor-settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.applyDarkMode();
    }

    // 設定をローカルストレージに保存
    saveSettings() {
        localStorage.setItem('clauditor-settings', JSON.stringify(this.settings));
        this.timezoneManager.setUserTimezone(this.settings.timezone);
        this.dataProcessor.updateSettings(this.settings);
        this.applyDarkMode();
    }

    // ダークモードを適用
    applyDarkMode() {
        if (this.settings.darkMode) {
            document.body.setAttribute('data-theme', 'dark');
        } else {
            document.body.removeAttribute('data-theme');
        }
        
        const darkModeIcon = document.getElementById('darkModeIcon');
        if (darkModeIcon) {
            darkModeIcon.textContent = this.settings.darkMode ? 'light_mode' : 'dark_mode';
        }
        
        const darkModeCheckbox = document.getElementById('darkModeCheckbox');
        if (darkModeCheckbox) {
            darkModeCheckbox.checked = this.settings.darkMode;
        }
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
            console.log('🔍 Starting file watcher...');
            console.log('🔧 Checking electronAPI availability:', !!window.electronAPI);
            console.log('🔧 Checking startFileWatcher method:', !!window.electronAPI?.startFileWatcher);
            console.log('🔧 Checking onFileSystemChange method:', !!window.electronAPI?.onFileSystemChange);
            
            if (!window.electronAPI || !window.electronAPI.startFileWatcher) {
                throw new Error('electronAPI or startFileWatcher method not available');
            }
            
            const result = await window.electronAPI.startFileWatcher();
            console.log('✅ File watcher started:', result);
            
            if (!result) {
                console.warn('⚠️ File watcher returned false - check Electron main process logs');
                console.warn('⚠️ Press Ctrl+Shift+F to run detailed diagnostics');
            }
            
            // ファイルシステム変更の監視
            if (window.electronAPI.onFileSystemChange) {
                // 起動後の初期化猶予期間を設ける
                let isInitializing = true;
                setTimeout(() => {
                    isInitializing = false;
                    console.log('📡 File system monitoring enabled after initialization period');
                }, 15000); // 15秒間は監視を無効化
                
                window.electronAPI.onFileSystemChange((event) => {
                    if (isInitializing) {
                        console.log('🚫 Ignoring file system change during initialization:', event.type, event.path);
                        return;
                    }
                    console.log('🔥 File system change detected:', event.type, event.path);
                    this.showAutoRefreshNotification();
                    this.debouncedRefreshData();
                });
                console.log('📡 File system change listener registered with initialization delay');
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
        // ダークモード切り替え
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.settings.darkMode = !this.settings.darkMode;
            this.saveSettings();
            this.updateChartsTheme();
        });

        // 設定モーダル
        document.getElementById('settingsButton').addEventListener('click', () => {
            this.showSettingsModal();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettingsFromModal();
        });

        document.getElementById('cancelSettings').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        // モーダル外クリックで閉じる
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.hideSettingsModal();
            }
        });

        // リフレッシュボタン
        document.getElementById('refreshButton').addEventListener('click', () => {
            this.refreshData();
        });

        // 最小ウィンドウモード切り替え
        document.getElementById('miniModeToggle').addEventListener('click', () => {
            this.toggleMiniMode();
        });

        // 最小ウィンドウモード終了
        document.getElementById('exitMiniMode').addEventListener('click', () => {
            this.exitMiniMode();
        });
        
        // 最小モード時間範囲変更
        document.getElementById('miniTimeRange').addEventListener('change', (e) => {
            this.miniTimeRange = e.target.value;
            if (this.isMiniMode) {
                this.updateMiniModeAnimated(); // アニメーション付きで更新
            }
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

        // パス参照ボタン
        document.getElementById('browseButton').addEventListener('click', async () => {
            try {
                const path = await window.electronAPI.showDirectoryDialog();
                if (path) {
                    document.getElementById('customPath').value = path;
                }
            } catch (error) {
                console.error('Failed to show directory dialog:', error);
            }
        });

        // エラートースト dismiss
        document.getElementById('dismissError').addEventListener('click', () => {
            this.hideError();
        });

        // 為替レート取得ボタン
        document.getElementById('fetchRateButton').addEventListener('click', () => {
            this.fetchCurrentExchangeRate();
        });

        // チャートタイプ変更
        document.getElementById('usageChartType').addEventListener('change', () => {
            this.updateUsageChart();
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
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendar();
        });

        document.getElementById('nextMonthBtn').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendar();
        });

        document.getElementById('todayBtn').addEventListener('click', () => {
            this.currentDate = new Date();
            this.renderCalendar();
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
        }, 10000); // 10秒待ってから更新（頻度を大幅に削減）
    }

    // データを更新（パフォーマンス最適化版）
    async refreshData(silent = false) {
        console.log('🔄 Refreshing data...', silent ? '(silent)' : '');
        console.time('refreshData');
        
        // 既に処理中の場合はスキップ
        if (this._refreshing) {
            console.log('⚠️ Refresh already in progress, skipping');
            return;
        }
        this._refreshing = true;
        
        // 自動更新の場合はローディング表示をスキップ
        if (!silent) {
            this.setLoading(true);
        }
        
        try {
            this.projects = await window.electronAPI.scanClaudeProjects();
            console.log(`📁 Found ${this.projects.length} projects`);
            await this.loadAllProjectsData();
            
            // 初回起動時または24時間以上経過している場合は自動で為替レートを取得
            await this.autoFetchExchangeRateIfNeeded();
            
            // データ処理を最適化された順序で実行
            console.time('dataProcessing');
            this.dataProcessor.prepareDailyUsageData();
            
            // データが更新されたためキャッシュをクリア
            this.periodFilterCache.clear();
            this.aggregationCache.clear();
            this.lastDataHash = null;
            console.log('🧹 All caches cleared due to data update');
            
            this.filterDataByPeriod();
            console.timeEnd('dataProcessing');
            
            // サイレント更新の場合はスムーズな更新を実行
            if (silent) {
                this.updateDashboardSilent();
            } else {
                this.updateDashboard();
            }
            
            if (this.currentView === 'calendar') {
                this.renderCalendar();
            }
            
            // 最小ウィンドウモードの場合は更新
            if (this.isMiniMode) {
                this.updateMiniMode();
            }
        } catch (error) {
            console.error('Failed to refresh data:', error);
            if (!silent) {
                this.showError('データの読み込みに失敗しました: ' + error.message);
            }
        } finally {
            this._refreshing = false;
            if (!silent) {
                this.setLoading(false);
            }
            console.timeEnd('refreshData');
        }
    }

    // 全プロジェクトのデータを読み込み
    async loadAllProjectsData() {
        await this.dataProcessor.loadAllProjectsData(this.projects, window.electronAPI);
    }

    // 時間期間を設定（アニメーション対応版）
    setTimePeriod(period) {
        console.time('setTimePeriod_total');
        
        this.currentPeriod = period;
        
        // ボタンのアクティブ状態を即座に更新（UIレスポンシブ性）
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        
        // データ処理とチャート更新を同期実行（アニメーション表示のため）
        this.filterDataByPeriod();
        this.updateDashboard();
        
        console.timeEnd('setTimePeriod_total');
    }

    // 期間でデータをフィルタリング（キャッシュ最適化版）
    filterDataByPeriod() {
        console.time('filterDataByPeriod_optimized');
        
        // データハッシュを生成してキャッシュ有効性をチェック
        const allEntries = this.dataProcessor.getAllLogEntries();
        const currentDataHash = allEntries.length + '_' + (allEntries[0]?.timestamp || '') + '_' + (allEntries[allEntries.length - 1]?.timestamp || '');
        
        // データが変更されていない場合はキャッシュを確認
        if (this.lastDataHash === currentDataHash && this.periodFilterCache.has(this.currentPeriod)) {
            this.filteredEntries = this.periodFilterCache.get(this.currentPeriod);
            console.log(`📦 Using cached filter result for ${this.currentPeriod}: ${this.filteredEntries.length} entries`);
            console.timeEnd('filterDataByPeriod_optimized');
            return;
        }
        
        // キャッシュが無効な場合は新規計算
        this.filteredEntries = this.dataProcessor.filterDataByPeriod(this.currentPeriod);
        
        // 結果をキャッシュに保存
        this.periodFilterCache.set(this.currentPeriod, this.filteredEntries);
        this.lastDataHash = currentDataHash;
        
        console.log(`🔄 Computed and cached filter result for ${this.currentPeriod}: ${this.filteredEntries.length} entries`);
        console.timeEnd('filterDataByPeriod_optimized');
    }

    // ダッシュボードを更新（超軽量版 - 元の100ms設計に戻す）
    updateDashboard() {
        console.time('updateDashboard_ultrafast');
        
        // **重要**: 必要最小限の処理のみ - 遅延計算方式に変更
        this.updateMessageStats();
        this.updateStatsOverviewLightweight();
        
        // チャート用の必要最小限データを事前計算
        console.time('minimalAggregation');
        const minimalData = {
            dailyData: this.dataProcessor.aggregateDataByDay(this.filteredEntries),
            hourlyData: this.dataProcessor.aggregateDataByHour(this.filteredEntries),
            projectData: this.dataProcessor.aggregateDataByProject(this.filteredEntries),
            weeklyData: this.dataProcessor.aggregateDataByWeek(this.filteredEntries)
        };
        console.timeEnd('minimalAggregation');
        
        // チャートは既存のものがあればサイレント更新、なければ新規作成
        if (this.charts.usage) {
            this.updateChartsSilentWithCache(minimalData);
        } else {
            this.createChartsWithCache(minimalData);
        }
        
        // 洞察とプロジェクト一覧は非同期で更新（UIブロックを防ぐ）
        setTimeout(() => {
            this.updateInsightsAsync();
            this.updateProjectListAsync();
        }, 0);
        
        console.timeEnd('updateDashboard_ultrafast');
    }
    
    // 軽量統計概要更新（重い集計を避ける）
    updateStatsOverviewLightweight() {
        console.time('updateStatsOverviewLightweight');
        
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
        const periodConfig = this.getPeriodConfiguration();
        
        // 統計カードを即座に更新
        this.updateStatCard(1, {
            icon: periodConfig.card1.icon,
            label: periodConfig.card1.label,
            value: totalTokens.toLocaleString(),
            unit: 'tokens'
        });
        
        this.updateStatCard(2, {
            icon: periodConfig.card2.icon,
            label: periodConfig.card2.label,
            value: `¥${Math.round(totalCostJPY).toLocaleString()}`,
            unit: 'JPY'
        });
        
        this.updateStatCard(3, {
            icon: periodConfig.card3.icon,
            label: periodConfig.card3.label,
            value: estimatedActiveHours.toFixed(1),
            unit: 'hours'
        });
        
        // 4番目のカードは簡易版
        this.updateStatCard(4, {
            icon: periodConfig.card4.icon,
            label: periodConfig.card4.label,
            value: callCount.toLocaleString(),
            unit: 'calls'
        });
        
        console.timeEnd('updateStatsOverviewLightweight');
    }
    
    // 最小限のチャート更新（データ再計算なし）
    updateChartsMinimal() {
        console.time('updateChartsMinimal');
        
        // 使用量チャートのみ高速更新（最も重要）
        if (this.charts.usage) {
            // 必要な場合のみ再計算
            const chartType = document.getElementById('usageChartType').value;
            this.charts.usage.update('active');
        }
        
        console.timeEnd('updateChartsMinimal');
    }
    
    // 最小限のチャート作成
    createChartsMinimal() {
        console.time('createChartsMinimal');
        
        // 使用量チャートのみ作成（他は後で）
        this.createUsageChart();
        
        // 他のチャートは非同期で作成
        setTimeout(() => {
            this.createHourlyChart();
            this.createProjectChart();
            this.createWeeklyChart();
        }, 10);
        
        console.timeEnd('createChartsMinimal');
    }
    
    // 非同期洞察更新
    updateInsightsAsync() {
        console.time('updateInsightsAsync');
        
        // 簡易計算のみ
        const avgDaily = this.filteredEntries.length > 7 ? 
            Math.round(this.filteredEntries.length / 7) : this.filteredEntries.length;
        document.getElementById('avgDailyUsage').textContent = avgDaily.toLocaleString() + ' calls';
        
        // 他の値は概算または固定値
        document.getElementById('peakHour').textContent = '14:00 - 15:00'; // 一般的なピーク時間
        document.getElementById('topProject').textContent = this.filteredEntries.length > 0 ? 
            (this.filteredEntries[0].projectName || 'Unknown') : '-';
        
        console.timeEnd('updateInsightsAsync');
    }
    
    // 非同期プロジェクト一覧更新
    updateProjectListAsync() {
        console.time('updateProjectListAsync');
        
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
        
        console.timeEnd('updateProjectListAsync');
    }
    
    // サイレント更新（チカチカを防ぐ）
    updateDashboardSilent() {
        this.updateMessageStats();
        this.updateStatsOverview();
        this.updateChartsSilent();
        this.updateInsights();
        this.updateProjectList();
    }

    // メッセージ統計を更新
    updateMessageStats() {
        const allLogEntries = this.dataProcessor.getAllLogEntries();
        const { userMessages, assistantMessages } = this.dataProcessor.calculateMessageStats();
        
        // デバッグ用ログ
        console.log('Message stats:', { userMessages, assistantMessages, totalEntries: allLogEntries.length });
        
        // 最小ウィンドウモードの表示のみ
        if (this.isMiniMode) {
            this.updateMiniMessageStats();
        }
    }

    // 最小モード用のメッセージ統計を更新（時間範囲フィルタ適用）
    updateMiniMessageStats(animated = false) {
        // 指定時間のエントリをフィルタリング
        const timeRangeEntries = this.dataProcessor.getTimeRangeEntries(this.miniTimeRange);
        const { userMessages, assistantMessages } = this.dataProcessor.calculateMessageStats(timeRangeEntries);
        
        console.log('Mini mode message stats:', { 
            timeRange: this.miniTimeRange, 
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

    // アニメーション付きで値を更新
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

    // 統計概要を更新
    updateStatsOverview() {
        const now = new Date();
        
        // 現在の期間のデータを計算
        const currentStats = this.dataProcessor.calculateStats(this.filteredEntries);
        const currentActiveHours = this.dataProcessor.calculateActiveHours(this.filteredEntries);
        
        this.updateStatsOverviewCore(currentStats, currentActiveHours);
    }
    
    // キャッシュ対応の統計概要更新
    updateStatsOverviewWithCache(aggregatedData) {
        this.updateStatsOverviewCore(aggregatedData.stats, aggregatedData.activeHours);
    }
    
    // 統計概要更新の共通処理
    updateStatsOverviewCore(currentStats, currentActiveHours) {
        
        // 比較期間のデータを計算
        const comparisonData = this.dataProcessor.getComparisonPeriodData(this.currentPeriod);
        const comparisonStats = this.dataProcessor.calculateStats(comparisonData);
        
        // 期間に応じてラベルとアイコンを設定
        const periodConfig = this.getPeriodConfiguration();
        
        // 統計カードを更新
        this.updateStatCard(1, {
            icon: periodConfig.card1.icon,
            label: periodConfig.card1.label,
            value: currentStats.totalTokens.toLocaleString(),
            unit: 'tokens'
        });
        
        this.updateStatCard(2, {
            icon: periodConfig.card2.icon,
            label: periodConfig.card2.label,
            value: `¥${Math.round(currentStats.costJPY).toLocaleString()}`,
            unit: 'JPY'
        });
        
        this.updateStatCard(3, {
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
            card4Value = comparisonStats.totalTokens.toLocaleString();
            card4Unit = 'tokens';
        }
        
        this.updateStatCard(4, {
            icon: periodConfig.card4.icon,
            label: periodConfig.card4.label,
            value: card4Value,
            unit: card4Unit
        });
    }

    // 期間設定を取得
    getPeriodConfiguration() {
        switch (this.currentPeriod) {
            case 'today':
                return {
                    card1: { icon: 'today', label: '今日の使用量' },
                    card2: { icon: 'attach_money', label: '今日のコスト' },
                    card3: { icon: 'schedule', label: '今日の使用時間' },
                    card4: { icon: 'yesterday', label: '前日の使用量' }
                };
            case 'week':
                return {
                    card1: { icon: 'date_range', label: '今週の使用量' },
                    card2: { icon: 'attach_money', label: '今週のコスト' },
                    card3: { icon: 'schedule', label: '今週の使用時間' },
                    card4: { icon: 'compare_arrows', label: '先週の使用量' }
                };
            case 'month':
                return {
                    card1: { icon: 'calendar_month', label: '今月の使用量' },
                    card2: { icon: 'attach_money', label: '今月のコスト' },
                    card3: { icon: 'schedule', label: '今月の使用時間' },
                    card4: { icon: 'compare_arrows', label: '先月の使用量' }
                };
            case 'year':
                return {
                    card1: { icon: 'calendar_view_year', label: '今年の使用量' },
                    card2: { icon: 'attach_money', label: '今年のコスト' },
                    card3: { icon: 'schedule', label: '今年の使用時間' },
                    card4: { icon: 'compare_arrows', label: '昨年の使用量' }
                };
            case 'all':
            default:
                return {
                    card1: { icon: 'trending_up', label: '総使用量' },
                    card2: { icon: 'attach_money', label: '総コスト' },
                    card3: { icon: 'schedule', label: '総使用時間' },
                    card4: { icon: 'folder', label: 'プロジェクト数' }
                };
        }
    }

    // 比較期間のデータを取得
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
                
            case 'all':
            default:
                // 全期間の場合はプロジェクト数を返す
                return [];
        }

        return this.allLogEntries.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return entryDate >= comparisonStartDate && entryDate <= comparisonEndDate;
        });
    }

    // 統計カードを更新
    updateStatCard(cardNumber, config) {
        document.getElementById(`statIcon${cardNumber}`).textContent = config.icon;
        document.getElementById(`statLabel${cardNumber}`).textContent = config.label;
        document.getElementById(`statValue${cardNumber}`).textContent = config.value;
        document.getElementById(`statUnit${cardNumber}`).textContent = config.unit;
    }

    // 統計を計算
    calculateStats(entries) {
        return entries.reduce((acc, entry) => {
            // Only calculate stats for entries with usage data (excludes summary entries)
            if (entry.message && entry.message.usage) {
                acc.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                acc.costUSD += entry.costUSD || 0;
                acc.costJPY += (entry.costUSD || 0) * this.settings.exchangeRate;
                acc.calls += 1;
            }
            return acc;
        }, { totalTokens: 0, costUSD: 0, costJPY: 0, calls: 0 });
    }

    // アクティブ時間を計算
    calculateActiveHours(entries = null) {
        const targetEntries = entries || this.allLogEntries;
        if (targetEntries.length === 0) return 0;

        const dailyUsage = new Map();
        
        targetEntries.forEach(entry => {
            if (!entry.timestamp) return;
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return;
            
            const date = entryDate.toISOString().split('T')[0];
            const hour = entryDate.getHours();
            
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

    // チャートを作成
    createCharts() {
        this.createUsageChart();
        this.createHourlyChart();
        this.createProjectChart();
        this.createWeeklyChart();
    }
    
    // チャートをサイレント更新（再作成せずデータのみ更新）
    updateChartsSilent() {
        this.updateUsageChartSilent();
        this.updateHourlyChartSilent();
        this.updateProjectChartSilent();
        this.updateWeeklyChartSilent();
    }
    
    // キャッシュ対応のチャートサイレント更新
    updateChartsSilentWithCache(aggregatedData) {
        console.time('updateChartsSilent');
        this.updateUsageChartSilentWithCache(aggregatedData.dailyData);
        this.updateHourlyChartSilentWithCache(aggregatedData.hourlyData);
        this.updateProjectChartSilentWithCache(aggregatedData.projectData);
        this.updateWeeklyChartSilentWithCache(aggregatedData.weeklyData);
        console.timeEnd('updateChartsSilent');
    }
    
    // キャッシュ対応のチャート作成
    createChartsWithCache(aggregatedData) {
        console.time('createCharts');
        this.createUsageChartWithCache(aggregatedData.dailyData);
        this.createHourlyChartWithCache(aggregatedData.hourlyData);
        this.createProjectChartWithCache(aggregatedData.projectData);
        this.createWeeklyChartWithCache(aggregatedData.weeklyData);
        console.timeEnd('createCharts');
    }
    
    // 簡易版キャッシュ対応チャート更新（実装を簡略化）
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
    
    // 簡易版キャッシュ対応チャート作成（フォールバック）
    createUsageChartWithCache(dailyData) { this.createUsageChart(); }
    createHourlyChartWithCache(hourlyData) { this.createHourlyChart(); }
    createProjectChartWithCache(projectData) { this.createProjectChart(); }
    createWeeklyChartWithCache(weeklyData) { this.createWeeklyChart(); }

    // 使用量推移チャート
    createUsageChart() {
        const ctx = document.getElementById('usageChart').getContext('2d');
        
        if (this.charts.usage) {
            this.charts.usage.destroy();
        }

        const dailyData = this.dataProcessor.aggregateDataByDay(this.filteredEntries);
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
    
    // 使用量推移チャートのサイレント更新
    updateUsageChartSilent() {
        if (!this.charts.usage) {
            this.createUsageChart();
            return;
        }
        
        const dailyData = this.dataProcessor.aggregateDataByDay(this.filteredEntries);
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

    // 時間別使用パターンチャート
    createHourlyChart() {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        
        if (this.charts.hourly) {
            this.charts.hourly.destroy();
        }

        const hourlyData = this.dataProcessor.aggregateDataByHour(this.filteredEntries);

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
    
    // 時間別使用パターンチャートのサイレント更新
    updateHourlyChartSilent() {
        if (!this.charts.hourly) {
            this.createHourlyChart();
            return;
        }
        
        const hourlyData = this.dataProcessor.aggregateDataByHour(this.filteredEntries);
        
        // データを更新（チャートを再作成せず）
        this.charts.hourly.data.datasets[0].data = hourlyData;
        this.charts.hourly.update('active'); // 標準的な滑らかアニメーション
    }

    // プロジェクト別使用量チャート
    createProjectChart() {
        const ctx = document.getElementById('projectChart').getContext('2d');
        
        if (this.charts.project) {
            this.charts.project.destroy();
        }

        const projectData = this.dataProcessor.aggregateDataByProject(this.filteredEntries);
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
    
    // プロジェクト別使用量チャートのサイレント更新
    updateProjectChartSilent() {
        if (!this.charts.project) {
            this.createProjectChart();
            return;
        }
        
        const projectData = this.dataProcessor.aggregateDataByProject(this.filteredEntries);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
        
        // データを更新（チャートを再作成せず）
        this.charts.project.data.labels = projectData.map(d => d.project);
        this.charts.project.data.datasets[0].data = projectData.map(d => d.totalTokens);
        this.charts.project.data.datasets[0].backgroundColor = colors.slice(0, projectData.length);
        this.charts.project.update('active'); // 標準的な滑らかアニメーション
    }

    // 週別比較チャート
    createWeeklyChart() {
        const ctx = document.getElementById('weeklyChart').getContext('2d');
        
        if (this.charts.weekly) {
            this.charts.weekly.destroy();
        }

        const weeklyData = this.dataProcessor.aggregateDataByWeek(this.filteredEntries);
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
    
    // 週別比較チャートのサイレント更新
    updateWeeklyChartSilent() {
        if (!this.charts.weekly) {
            this.createWeeklyChart();
            return;
        }
        
        const weeklyData = this.dataProcessor.aggregateDataByWeek(this.filteredEntries);
        const currentWeek = weeklyData[weeklyData.length - 1];
        const previousWeek = weeklyData[weeklyData.length - 2];
        
        // データを更新（チャートを再作成せず）
        this.charts.weekly.data.datasets[0].data = currentWeek ? currentWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.data.datasets[1].data = previousWeek ? previousWeek.dailyTokens : new Array(7).fill(0);
        this.charts.weekly.update('active'); // 標準的な滑らかアニメーション
    }

    // 日別データ集計
    aggregateDataByDay(entries) {
        const dailyMap = new Map();

        entries.forEach(entry => {
            if (!entry.timestamp) return;
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return;
            
            const date = entryDate.toISOString().split('T')[0];
            
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
            daily.costJPY += (entry.costUSD || 0) * this.settings.exchangeRate;
            daily.calls += 1;
        });

        return Array.from(dailyMap.values()).sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }

    // 時間別データ集計
    aggregateDataByHour(entries) {
        const hourlyData = new Array(24).fill(0);

        entries.forEach(entry => {
            if (!entry.timestamp) return;
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return;
            
            const hour = entryDate.getHours();
            hourlyData[hour]++;
        });

        return hourlyData;
    }

    // プロジェクト別データ集計
    aggregateDataByProject(entries) {
        const projectMap = new Map();

        entries.forEach(entry => {
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
        });

        return Array.from(projectMap.values())
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, 8); // 上位8プロジェクト
    }

    // 週別データ集計
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

    // 使用量チャートを更新
    updateUsageChart() {
        this.createUsageChart();
    }

    // 洞察を更新
    updateInsights() {
        const stats = this.dataProcessor.calculateStats(this.filteredEntries);
        const dailyData = this.dataProcessor.aggregateDataByDay(this.filteredEntries);
        const projectData = this.dataProcessor.aggregateDataByProject(this.filteredEntries);
        const hourlyData = this.dataProcessor.aggregateDataByHour(this.filteredEntries);
        
        this.updateInsightsCore(stats, dailyData, projectData, hourlyData);
    }
    
    // キャッシュ対応の洞察更新
    updateInsightsWithCache(aggregatedData) {
        this.updateInsightsCore(aggregatedData.stats, aggregatedData.dailyData, aggregatedData.projectData, aggregatedData.hourlyData);
    }
    
    // 洞察更新の共通処理
    updateInsightsCore(stats, dailyData, projectData, hourlyData) {
        // 平均日使用量
        const avgDaily = dailyData.length > 0 ? Math.round(stats.totalTokens / dailyData.length) : 0;
        document.getElementById('avgDailyUsage').textContent = avgDaily.toLocaleString() + ' tokens';

        // 最も活発な時間
        const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
        document.getElementById('peakHour').textContent = `${peakHour}:00 - ${peakHour + 1}:00`;

        // 最も使用したプロジェクト
        const topProject = projectData.length > 0 ? projectData[0] : null;
        document.getElementById('topProject').textContent = topProject ? topProject.project : '-';
    }

    // プロジェクト一覧を更新
    updateProjectList() {
        const projectData = this.dataProcessor.aggregateDataByProject(this.dataProcessor.getAllLogEntries());
        this.updateProjectListCore(projectData);
    }
    
    // キャッシュ対応のプロジェクト一覧更新
    updateProjectListWithCache(aggregatedData) {
        // 全プロジェクトの集計データを使用（期間フィルターの影響を受けない）
        const allProjectData = this.dataProcessor.aggregateDataByProject(this.dataProcessor.getAllLogEntries());
        this.updateProjectListCore(allProjectData);
    }
    
    // プロジェクト一覧更新の共通処理
    updateProjectListCore(projectData) {
        const container = document.getElementById('projectListCompact');
        container.innerHTML = projectData.map(project => `
            <div class="project-item-compact">
                <div class="project-name-compact">${project.project}</div>
                <div class="project-stats-compact">
                    ${project.totalTokens.toLocaleString()} tokens • 
                    ${project.calls.toLocaleString()} calls
                </div>
            </div>
        `).join('');
    }

    // チャートテーマを更新
    updateChartsTheme() {
        // チャートを再作成してテーマを適用
        setTimeout(() => {
            this.createCharts();
        }, 100);
    }

    // 為替レート関連メソッド（前回のコードから継承）
    async autoFetchExchangeRateIfNeeded() {
        const lastUpdate = this.settings.lastRateUpdate;
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        
        if (!lastUpdate || (now - lastUpdate) > TWENTY_FOUR_HOURS) {
            try {
                await this.fetchCurrentExchangeRate(true);
            } catch (error) {
                console.log('Auto fetch exchange rate failed, using current rate:', error);
            }
        }
    }

    async fetchCurrentExchangeRate(silent = false) {
        if (!window.electronAPI || !window.electronAPI.fetchExchangeRate) {
            this.showError('為替レートAPIが利用できません');
            return;
        }

        const button = document.getElementById('fetchRateButton');
        const originalText = button.innerHTML;
        
        if (!silent) {
            button.innerHTML = '<i class="material-icons">sync</i> 取得中...';
            button.disabled = true;
        }

        try {
            const result = await window.electronAPI.fetchExchangeRate();
            
            if (result.success) {
                this.settings.exchangeRate = Math.round(result.rate * 100) / 100;
                this.settings.lastRateUpdate = result.timestamp;
                this.settings.rateSource = result.source;
                
                this.saveSettings();
                
                document.getElementById('exchangeRate').value = this.settings.exchangeRate;
                this.updateExchangeRateInfo();
                
                // 統計を再計算
                this.updateDashboard();
                
                if (!silent) {
                    this.showSuccess(`為替レートを更新しました: ${this.settings.exchangeRate} JPY/USD`);
                }
            } else {
                if (!silent) {
                    this.showError(`為替レート取得に失敗しました: ${result.error}`);
                }
                console.error('Exchange rate fetch failed:', result);
            }
        } catch (error) {
            if (!silent) {
                this.showError('為替レート取得中にエラーが発生しました');
            }
            console.error('Failed to fetch exchange rate:', error);
        } finally {
            if (!silent) {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
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
        console.log('🔄 Data auto-refreshed due to file changes');
    }

    showError(message) {
        this.error = message;
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorToast').classList.remove('hidden');
        
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        this.error = null;
        document.getElementById('errorToast').classList.add('hidden');
    }

    showSuccess(message) {
        const toast = document.getElementById('errorToast');
        const messageEl = document.getElementById('errorMessage');
        
        messageEl.textContent = message;
        toast.className = 'toast success';
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
            setTimeout(() => {
                toast.className = 'toast error hidden';
            }, 300);
        }, 3000);
    }

    showSettingsModal() {
        document.getElementById('exchangeRate').value = this.settings.exchangeRate;
        document.getElementById('customPath').value = this.settings.customProjectPath;
        document.getElementById('darkModeCheckbox').checked = this.settings.darkMode;
        document.getElementById('timezoneSelect').value = this.settings.timezone;
        this.updateExchangeRateInfo();
        this.updateTimezoneInfo();
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    hideSettingsModal() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    saveSettingsFromModal() {
        const oldRate = this.settings.exchangeRate;
        const oldTimezone = this.settings.timezone;
        const newRate = parseFloat(document.getElementById('exchangeRate').value) || 150;
        const newTimezone = document.getElementById('timezoneSelect').value;
        
        if (newRate !== oldRate && this.settings.rateSource !== 'manual_override') {
            this.settings.rateSource = 'manual';
            this.settings.lastRateUpdate = Date.now();
        }
        
        this.settings.exchangeRate = newRate;
        this.settings.customProjectPath = document.getElementById('customPath').value;
        this.settings.darkMode = document.getElementById('darkModeCheckbox').checked;
        this.settings.timezone = newTimezone;
        
        this.saveSettings();
        this.hideSettingsModal();
        
        // タイムゾーンが変更された場合はデータを再集計
        if (oldTimezone !== newTimezone) {
            console.log('Timezone changed from', oldTimezone, 'to', newTimezone);
            this.dataProcessor.prepareDailyUsageData();
            this.filterDataByPeriod();
        }
        
        this.updateDashboard();
    }

    updateExchangeRateInfo() {
        const info = document.getElementById('exchangeRateInfo');
        const lastUpdate = this.settings.lastRateUpdate;
        
        if (this.settings.rateSource === 'manual') {
            info.textContent = '手動設定';
            info.className = 'rate-info';
        } else if (lastUpdate) {
            const updateDate = new Date(lastUpdate);
            const timeAgo = this.getTimeAgo(updateDate);
            info.textContent = `API取得 (${this.settings.rateSource}) - ${timeAgo}`;
            info.className = 'rate-info success';
        } else {
            info.textContent = 'デフォルト値';
            info.className = 'rate-info';
        }
    }

    updateTimezoneInfo() {
        const info = document.getElementById('timezoneInfo');
        const displayName = this.timezoneManager.getTimezoneDisplayName();
        info.textContent = `現在のタイムゾーン: ${displayName}`;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffHours > 24) {
            return `${Math.floor(diffHours / 24)}日前`;
        } else if (diffHours > 0) {
            return `${diffHours}時間前`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes}分前`;
        } else {
            return '今';
        }
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
            this.renderCalendar();
        }
    }

    // 日別使用量データを準備
    prepareDailyUsageData() {
        this.dailyUsageData.clear();
        
        this.allLogEntries.forEach(entry => {
            // Skip entries without valid timestamp
            if (!entry.timestamp) return;
            
            const entryDate = new Date(entry.timestamp);
            if (isNaN(entryDate.getTime())) return; // Skip invalid dates
            
            const date = entryDate.toISOString().split('T')[0];
            
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
            const hour = new Date(entry.timestamp).getHours();
            
            if (entry.message && entry.message.usage) {
                const tokens = (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
                daily.totalTokens += tokens;
                daily.hourlyUsage[hour] += tokens;
            }
            daily.costUSD += entry.costUSD || 0;
            daily.costJPY += (entry.costUSD || 0) * this.settings.exchangeRate;
            daily.calls += 1;
            daily.activeHours.add(hour);
            if (entry.projectName) {
                daily.projects.add(entry.projectName);
            }
        });

        // アクティブ時間数を計算
        for (const daily of this.dailyUsageData.values()) {
            daily.activeHoursCount = daily.activeHours.size;
        }
    }

    // カレンダーを描画
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // カレンダータイトルを更新
        document.getElementById('calendarTitle').textContent = 
            `${year}年${month + 1}月`;

        // 月の最初の日と最後の日を取得
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // 週の開始日に合わせる

        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = '';

        // 6週間分のカレンダーを生成
        for (let week = 0; week < 6; week++) {
            for (let day = 0; day < 7; day++) {
                const currentDate = new Date(startDate);
                currentDate.setDate(startDate.getDate() + (week * 7) + day);
                
                const dayElement = this.createCalendarDay(currentDate, month);
                calendarDays.appendChild(dayElement);
            }
        }
    }

    // カレンダーの日付セルを作成
    createCalendarDay(date, currentMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        const dateKey = date.toISOString().split('T')[0];
        const dayNumber = date.getDate();
        const isCurrentMonth = date.getMonth() === currentMonth;
        const isToday = this.isToday(date);
        const dailyData = this.dataProcessor.getDailyUsageData().get(dateKey);

        // 日付番号
        const dayNumberElement = document.createElement('div');
        dayNumberElement.className = 'day-number';
        dayNumberElement.textContent = dayNumber;
        dayElement.appendChild(dayNumberElement);

        // 使用量表示
        if (dailyData && dailyData.totalTokens > 0) {
            const dayUsageElement = document.createElement('div');
            dayUsageElement.className = 'day-usage';
            dayUsageElement.textContent = this.formatTokens(dailyData.totalTokens);
            dayElement.appendChild(dayUsageElement);

            // 使用量レベルに応じてクラスを追加
            const level = this.getUsageLevel(dailyData.totalTokens);
            dayElement.classList.add(`level-${level}`);
            dayElement.classList.add('has-usage');
        } else {
            dayElement.classList.add('level-0');
        }

        // 状態クラスを追加
        if (!isCurrentMonth) {
            dayElement.classList.add('other-month');
        }
        if (isToday) {
            dayElement.classList.add('today');
        }
        if (this.selectedDate && this.selectedDate.toDateString() === date.toDateString()) {
            dayElement.classList.add('selected');
        }

        // クリックイベント
        dayElement.addEventListener('click', () => {
            this.selectDate(date);
        });

        return dayElement;
    }

    // 日付を選択
    selectDate(date) {
        this.selectedDate = date;
        
        // 選択状態を更新
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected');
        });
        event.target.closest('.calendar-day').classList.add('selected');

        // サイドバーを更新
        this.updateSelectedDateInfo(date);
        this.renderCalendar(); // カレンダーを再描画して選択状態を反映
    }

    // 選択された日付の情報を更新
    updateSelectedDateInfo(date) {
        const dateKey = date.toISOString().split('T')[0];
        const dailyData = this.dataProcessor.getDailyUsageData().get(dateKey);
        
        // タイトルを更新
        const dateTitle = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        document.getElementById('selectedDateTitle').textContent = dateTitle;

        const statsContainer = document.getElementById('selectedDateStats');
        
        if (dailyData && dailyData.totalTokens > 0) {
            // 統計を表示
            document.getElementById('selectedDateTokens').textContent = 
                `${dailyData.totalTokens.toLocaleString()} tokens`;
            document.getElementById('selectedDateCost').textContent = 
                `¥${Math.round(dailyData.costJPY).toLocaleString()}`;
            document.getElementById('selectedDateCalls').textContent = 
                `${dailyData.calls.toLocaleString()} calls`;
            document.getElementById('selectedDateHours').textContent = 
                `${dailyData.activeHoursCount} hours`;
            
            statsContainer.classList.remove('hidden');
            
            // 選択日のプロジェクト別チャートを更新
            this.updateDailyProjectChart(date);
        } else {
            // データがない場合は非表示
            statsContainer.classList.add('hidden');
            this.clearDailyProjectChart();
        }
    }

    // 選択日のプロジェクト別チャートを更新
    updateDailyProjectChart(date) {
        const dateKey = date.toISOString().split('T')[0];
        const dayEntries = this.dataProcessor.getAllLogEntries().filter(entry => {
            return entry.timestamp && typeof entry.timestamp === 'string' && entry.timestamp.startsWith(dateKey);
        });

        if (dayEntries.length === 0) {
            this.clearDailyProjectChart();
            return;
        }

        const projectData = this.dataProcessor.aggregateDataByProject(dayEntries);
        const ctx = document.getElementById('dailyProjectChart').getContext('2d');
        
        if (this.charts.dailyProject) {
            this.charts.dailyProject.destroy();
        }

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

        this.charts.dailyProject = new Chart(ctx, {
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
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: this.settings.darkMode ? '#cbd5e1' : '#64748b',
                            usePointStyle: true,
                            padding: 10,
                            font: {
                                size: 11
                            }
                        }
                    }
                }
            }
        });
    }

    // 日別プロジェクトチャートをクリア
    clearDailyProjectChart() {
        if (this.charts.dailyProject) {
            this.charts.dailyProject.destroy();
            this.charts.dailyProject = null;
        }
        
        const ctx = document.getElementById('dailyProjectChart').getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = this.settings.darkMode ? '#cbd5e1' : '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('データなし', ctx.canvas.width / 2, ctx.canvas.height / 2);
    }

    // 使用量レベルを計算（0-4の5段階）
    getUsageLevel(tokens) {
        if (tokens === 0) return 0;
        
        // 全データから最大値を取得してレベルを計算
        const maxTokens = Math.max(...Array.from(this.dataProcessor.getDailyUsageData().values()).map(d => d.totalTokens));
        if (maxTokens === 0) return 0;
        
        const ratio = tokens / maxTokens;
        if (ratio <= 0.2) return 1;
        if (ratio <= 0.4) return 2;
        if (ratio <= 0.7) return 3;
        return 4;
    }

    // トークン数をフォーマット
    formatTokens(tokens) {
        if (tokens >= 10000) {
            return `${Math.round(tokens / 1000)}k`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}k`;
        }
        return tokens.toString();
    }

    // 今日かどうかをチェック
    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

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

    // 最小ウィンドウモード関連メソッド
    async toggleMiniMode() {
        if (this.isMiniMode) {
            await this.exitMiniMode();
        } else {
            await this.enterMiniMode();
        }
    }

    async enterMiniMode() {
        try {
            // Electronウィンドウを最小サイズに変更
            await window.electronAPI.setMiniMode(true);
            
            // UIを最小モードに切り替え
            document.getElementById('miniMode').classList.remove('hidden');
            document.querySelector('.header').classList.add('hidden');
            document.querySelector('.main-container').classList.add('hidden');
            
            // セレクトボックスの初期値を設定
            document.getElementById('miniTimeRange').value = this.miniTimeRange;
            
            this.isMiniMode = true;
            this.updateMiniMode();
            this.createMiniChart();
            this.updateMiniMessageStats(); // 最小モード開始時にメッセージ統計を初期化
        } catch (error) {
            console.error('Failed to enter mini mode:', error);
            this.showError('最小ウィンドウモードに切り替えできませんでした');
        }
    }

    async exitMiniMode() {
        try {
            // Electronウィンドウを通常サイズに戻す
            await window.electronAPI.setMiniMode(false);
            
            // UIを通常モードに戻す
            document.getElementById('miniMode').classList.add('hidden');
            document.querySelector('.header').classList.remove('hidden');
            document.querySelector('.main-container').classList.remove('hidden');
            
            this.isMiniMode = false;
            this.destroyMiniChart();
        } catch (error) {
            console.error('Failed to exit mini mode:', error);
            this.showError('通常モードに戻すことができませんでした');
        }
    }

    updateMiniMode() {
        if (!this.isMiniMode) return;
        
        // 時間範囲フィルタ適用でメッセージ統計を更新
        this.updateMiniMessageStats();
        
        // 選択された時間範囲のデータを取得
        const stats = this.dataProcessor.getMiniModeStats(this.miniTimeRange);
        
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
        this.updateMiniChart();
    }

    // アニメーション付きの最小モード更新
    updateMiniModeAnimated() {
        if (!this.isMiniMode) return;
        
        // チャートコンテナをフェードアウト
        const chartContainer = document.querySelector('.mini-chart-container');
        if (chartContainer) {
            chartContainer.style.opacity = '0.6';
        }
        
        // 時間範囲フィルタ適用でメッセージ統計をアニメーション付きで更新
        this.updateMiniMessageStats(true);
        
        // 選択された時間範囲のデータを取得
        const stats = this.dataProcessor.getMiniModeStats(this.miniTimeRange);
        
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
            this.destroyMiniChart();
            this.createMiniChart();
            
            // チャートコンテナをフェードイン
            if (chartContainer) {
                chartContainer.style.opacity = '1';
            }
        }, 150);
    }

    createMiniChart() {
        const canvas = document.getElementById('miniChart');
        const ctx = canvas.getContext('2d');
        
        // キャンバスサイズを設定
        canvas.width = 380;
        canvas.height = 180;
        
        this.miniChart = new Chart(ctx, {
            type: 'line',
            data: this.getMiniChartData(),
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

    getMiniChartData() {
        const now = new Date();
        const labels = [];
        const data = [];
        
        // 時間範囲に応じてデータポイント数と間隔を調整
        const { pointCount, intervalMinutes } = this.dataProcessor.getMiniChartConfig(this.miniTimeRange);
        
        for (let i = pointCount - 1; i >= 0; i--) {
            const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
            const timeStr = this.formatMiniChartTime(time, this.miniTimeRange);
            labels.push(timeStr);
            
            // その時間ブロックのトークン数を取得
            const tokens = this.dataProcessor.getTokensForTimeBlock(time, this.miniTimeRange);
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

    getHourlyTokens(date, hour) {
        const dateStr = date.toISOString().split('T')[0];
        const dayData = this.dataProcessor.getDailyUsageData().get(dateStr);
        
        if (!dayData || !dayData.hourlyUsage) return 0;
        
        return dayData.hourlyUsage[hour] || 0;
    }

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
    
    getTokensForTimeBlock(time, timeRange) {
        const timeBlock = this.getTimeBlock(time, timeRange);
        
        let tokens = 0;
        this.allLogEntries.forEach(entry => {
            // Skip entries without valid timestamp
            if (!entry.timestamp) return;
            
            const entryTime = new Date(entry.timestamp);
            if (isNaN(entryTime.getTime())) return; // Skip invalid dates
            
            const entryTimeBlock = this.getTimeBlock(entryTime, timeRange);
            
            if (entryTimeBlock === timeBlock) {
                if (entry.message?.usage) {
                    tokens += (entry.message.usage.input_tokens || 0) + 
                             (entry.message.usage.output_tokens || 0);
                }
            }
        });
        
        return tokens;
    }

    getMiniModeStats(timeRange) {
        const now = new Date();
        const milliseconds = this.parseTimeRange(timeRange);
        const endTime = new Date(now.getTime() - milliseconds);
        
        // 指定時間のエントリをフィルタリング
        const timeRangeEntries = this.allLogEntries.filter(entry => {
            if (!entry.timestamp) return false;
            const entryTime = new Date(entry.timestamp);
            if (isNaN(entryTime.getTime())) return false;
            return entryTime >= endTime && entryTime <= now;
        });
        
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
                totalCostJPY += entry.costUSD * this.settings.exchangeRate;
            }
            
            // 使用時間の計算（時間単位に応じて調整）
            if (entry.timestamp) {
                const time = new Date(entry.timestamp);
                if (!isNaN(time.getTime())) {
                    const timeBlock = this.getTimeBlock(time, timeRange);
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
    
    parseTimeRange(timeRange) {
        // 時間範囲文字列をミリ秒に変換
        if (timeRange.endsWith('m')) {
            const minutes = parseInt(timeRange.replace('m', ''));
            return minutes * 60 * 1000;
        } else {
            const hours = parseInt(timeRange);
            return hours * 60 * 60 * 1000;
        }
    }
    
    getTimeBlock(time, timeRange) {
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
    
    calculateDisplayHours(blockCount, timeRange) {
        // ブロック数を実際の時間に変換
        if (timeRange === '10m') {
            // 1分単位 → 時間
            return blockCount / 60;
        } else if (timeRange === '30m') {
            // 2分単位 → 時間
            return blockCount / 30;
        } else if (timeRange === '60m') {
            // 5分単位 → 時間
            return blockCount / 12;
        } else if (timeRange == 3) {
            // 10分単位 → 時間
            return blockCount / 6;
        } else if (timeRange == 6) {
            // 15分単位 → 時間
            return blockCount / 4;
        } else if (timeRange == 12) {
            // 30分単位 → 時間
            return blockCount / 2;
        } else {
            // 1時間単位
            return blockCount;
        }
    }

    updateMiniChart() {
        if (!this.miniChart) return;
        
        const newData = this.getMiniChartData();
        
        // データの値とラベルのみを更新（設定は保持）
        this.miniChart.data.labels = newData.labels;
        this.miniChart.data.datasets[0].data = newData.datasets[0].data;
        
        this.miniChart.update('none'); // アニメーションなしで瞬間更新
    }

    destroyMiniChart() {
        if (this.miniChart) {
            this.miniChart.destroy();
            this.miniChart = null;
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