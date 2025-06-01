// アプリケーション状態
class AppState {
    constructor() {
        this.projects = [];
        this.selectedProject = null;
        this.logEntries = [];
        this.dailyStats = [];
        this.globalStats = {
            totalTokens: 0,
            costUSD: 0,
            costJPY: 0,
            calls: 0,
            projectCount: 0
        };
        this.allProjectsData = new Map();
        this.settings = {
            exchangeRate: 150,
            darkMode: false,
            customProjectPath: ''
        };
        this.loading = false;
        this.error = null;
        
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
            await window.electronAPI.startFileWatcher();
            
            // ファイルシステム変更の監視
            window.electronAPI.onFileSystemChange((event) => {
                console.log('File system change:', event);
                this.refreshProjects();
            });
        } catch (error) {
            console.error('Failed to start file watcher:', error);
        }

        // プロジェクトを読み込み
        await this.refreshProjects();
    }

    // イベントリスナーを設定
    setupEventListeners() {
        // ダークモード切り替え
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.settings.darkMode = !this.settings.darkMode;
            this.saveSettings();
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
            this.refreshProjects();
        });

        // 全プロジェクトに戻るボタン
        document.getElementById('backToAllProjectsButton').addEventListener('click', () => {
            this.showAllProjectsView();
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
    }

    // プロジェクト一覧を更新
    async refreshProjects() {
        this.setLoading(true);
        try {
            this.projects = await window.electronAPI.scanClaudeProjects();
            this.renderProjects();
            await this.loadAllProjectsData();
        } catch (error) {
            console.error('Failed to scan projects:', error);
            this.showError('プロジェクトの読み込みに失敗しました: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    // 全プロジェクトのデータを読み込み
    async loadAllProjectsData() {
        let totalTokens = 0;
        let totalCostUSD = 0;
        let totalCalls = 0;
        let projectCount = 0;

        for (const project of this.projects) {
            try {
                const logEntries = await window.electronAPI.readProjectLogs(project.path);
                this.allProjectsData.set(project.name, logEntries);
                
                const projectStats = this.calculateProjectStats(logEntries);
                totalTokens += projectStats.totalTokens;
                totalCostUSD += projectStats.costUSD;
                totalCalls += projectStats.calls;
                projectCount++;
            } catch (error) {
                console.warn(`Failed to load data for project ${project.name}:`, error);
            }
        }

        this.globalStats = {
            totalTokens,
            costUSD: totalCostUSD,
            costJPY: totalCostUSD * this.settings.exchangeRate,
            calls: totalCalls,
            projectCount
        };

        // デフォルトで全プロジェクト統計を表示
        this.showAllProjectsView();
    }

    // プロジェクトの統計を計算
    calculateProjectStats(logEntries) {
        return logEntries.reduce((acc, entry) => {
            if (entry.message && entry.message.usage) {
                acc.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
            }
            acc.costUSD += entry.costUSD || 0;
            acc.calls += 1;
            return acc;
        }, { totalTokens: 0, costUSD: 0, calls: 0 });
    }

    // プロジェクトを選択
    async selectProject(project) {
        if (this.selectedProject === project.name) return;
        
        this.selectedProject = project.name;
        this.setLoading(true);
        this.updateUI();

        try {
            // キャッシュからデータを取得するか、新たに読み込み
            if (this.allProjectsData.has(project.name)) {
                this.logEntries = this.allProjectsData.get(project.name);
            } else {
                this.logEntries = await window.electronAPI.readProjectLogs(project.path);
                this.allProjectsData.set(project.name, this.logEntries);
            }
            
            this.processLogEntries();
            this.showProjectStats(project.name);
            this.renderProjects(); // アクティブ状態を更新
        } catch (error) {
            console.error('Failed to read project logs:', error);
            this.showError('プロジェクトデータの読み込みに失敗しました: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    // 全プロジェクト表示
    showAllProjectsView() {
        this.selectedProject = 'all';
        this.combineAllProjectsData();
        
        // 統計表示を全プロジェクト用に切り替え
        this.updateStatsDisplay(true);
        this.renderGlobalStats();
        this.renderChart();
        this.renderTable();
        
        // プロジェクト一覧のアクティブ状態をクリア
        this.renderProjects();
    }

    // 個別プロジェクト統計表示
    showProjectStats(projectName) {
        // 統計表示を個別プロジェクト用に切り替え
        this.updateStatsDisplay(false, projectName);
        this.renderProjectStats();
        this.renderChart();
        this.renderTable();
    }

    // 統計表示の切り替え
    updateStatsDisplay(isGlobal, projectName = '') {
        const statsIcon = document.getElementById('statsIcon');
        const statsTitle = document.getElementById('statsTitle');
        const backButton = document.getElementById('backToAllProjectsButton');
        const statCards = document.querySelectorAll('#mainStatsGrid .stat-card');

        if (isGlobal) {
            // 全プロジェクト表示
            statsIcon.textContent = 'analytics';
            statsTitle.textContent = '全プロジェクト統計';
            backButton.classList.add('hidden');
            
            // カードにグローバルスタイルを適用
            statCards.forEach(card => {
                card.classList.add('global');
            });
        } else {
            // 個別プロジェクト表示
            statsIcon.textContent = 'folder';
            statsTitle.textContent = `${projectName} 統計`;
            backButton.classList.remove('hidden');
            
            // カードからグローバルスタイルを除去
            statCards.forEach(card => {
                card.classList.remove('global');
            });
        }
    }

    // 全プロジェクトのデータを結合
    combineAllProjectsData() {
        this.logEntries = [];
        for (const [projectName, logEntries] of this.allProjectsData) {
            this.logEntries.push(...logEntries);
        }
        // 時系列でソート
        this.logEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.processLogEntries();
    }

    // ログエントリを処理して日別統計を生成
    processLogEntries() {
        const dailyMap = new Map();

        this.logEntries.forEach(entry => {
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            
            if (!dailyMap.has(date)) {
                dailyMap.set(date, {
                    date,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    costUSD: 0,
                    costJPY: 0,
                    calls: 0
                });
            }

            const daily = dailyMap.get(date);
            if (entry.message && entry.message.usage) {
                daily.inputTokens += entry.message.usage.input_tokens || 0;
                daily.outputTokens += entry.message.usage.output_tokens || 0;
                daily.totalTokens += (entry.message.usage.input_tokens || 0) + (entry.message.usage.output_tokens || 0);
            }
            daily.costUSD += entry.costUSD || 0;
            daily.costJPY += (entry.costUSD || 0) * this.settings.exchangeRate;
            daily.calls += 1;
        });

        this.dailyStats = Array.from(dailyMap.values()).sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }

    // ローディング状態を設定
    setLoading(loading) {
        this.loading = loading;
        this.updateUI();
    }

    // エラーを表示
    showError(message) {
        this.error = message;
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorToast').classList.remove('hidden');
        
        // 5秒後に自動で閉じる
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    // エラーを非表示
    hideError() {
        this.error = null;
        document.getElementById('errorToast').classList.add('hidden');
    }

    // 設定モーダルを表示
    showSettingsModal() {
        document.getElementById('exchangeRate').value = this.settings.exchangeRate;
        document.getElementById('customPath').value = this.settings.customProjectPath;
        document.getElementById('darkModeCheckbox').checked = this.settings.darkMode;
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    // 設定モーダルを非表示
    hideSettingsModal() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    // モーダルから設定を保存
    saveSettingsFromModal() {
        this.settings.exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 150;
        this.settings.customProjectPath = document.getElementById('customPath').value;
        this.settings.darkMode = document.getElementById('darkModeCheckbox').checked;
        
        this.saveSettings();
        this.hideSettingsModal();
        
        // グローバル統計のJPY換算を更新
        this.globalStats.costJPY = this.globalStats.costUSD * this.settings.exchangeRate;
        
        // データを再計算
        if (this.logEntries.length > 0) {
            this.processLogEntries();
            this.renderDashboard();
        } else {
            this.renderGlobalStats();
        }
    }

    // UIを更新
    updateUI() {
        const welcomeMessage = document.getElementById('welcomeMessage');
        const loadingMessage = document.getElementById('loadingMessage');
        const mainDashboard = document.getElementById('mainDashboard');

        // すべてを非表示
        welcomeMessage.classList.add('hidden');
        loadingMessage.classList.add('hidden');
        mainDashboard.classList.add('hidden');

        if (this.loading && this.selectedProject) {
            loadingMessage.classList.remove('hidden');
        } else if (this.selectedProject === 'all' || (this.selectedProject && this.logEntries.length > 0)) {
            mainDashboard.classList.remove('hidden');
        } else if (this.globalStats.projectCount > 0) {
            // プロジェクトが読み込まれている場合は全プロジェクト統計を表示
            mainDashboard.classList.remove('hidden');
        } else {
            welcomeMessage.classList.remove('hidden');
        }
    }

    // プロジェクト一覧を描画
    renderProjects() {
        const projectList = document.getElementById('projectList');
        
        if (this.projects.length === 0) {
            projectList.innerHTML = '<div class="loading">プロジェクトが見つかりません</div>';
            return;
        }

        projectList.innerHTML = this.projects.map(project => `
            <div class="project-item ${this.selectedProject === project.name ? 'active' : ''}" 
                 data-project='${JSON.stringify(project)}'>
                <div class="project-name">${project.name}</div>
                <div class="project-meta">
                    ${project.logFiles.length} ファイル • 
                    ${new Date(project.lastModified).toLocaleDateString('ja-JP')}
                </div>
            </div>
        `).join('');

        // プロジェクトクリックイベント
        projectList.querySelectorAll('.project-item').forEach(item => {
            item.addEventListener('click', () => {
                const project = JSON.parse(item.dataset.project);
                this.selectProject(project);
            });
        });
    }

    // グローバル統計を描画
    renderGlobalStats() {
        document.getElementById('statValue1').textContent = this.globalStats.totalTokens.toLocaleString();
        document.getElementById('statValue2').textContent = `$${this.globalStats.costUSD.toFixed(2)}`;
        document.getElementById('statValue3').textContent = `¥${Math.round(this.globalStats.costJPY).toLocaleString()}`;
        document.getElementById('statValue4').textContent = this.globalStats.calls.toLocaleString();
        
        document.getElementById('statProjects1').textContent = `${this.globalStats.projectCount} プロジェクト`;
        document.getElementById('statProjects2').textContent = `${this.globalStats.projectCount} プロジェクト`;
        document.getElementById('statProjects3').textContent = `${this.globalStats.projectCount} プロジェクト`;
        document.getElementById('statProjects4').textContent = `${this.globalStats.projectCount} プロジェクト`;
    }

    // 個別プロジェクト統計を描画
    renderProjectStats() {
        const totals = this.dailyStats.reduce((acc, day) => ({
            totalTokens: acc.totalTokens + day.totalTokens,
            costUSD: acc.costUSD + day.costUSD,
            costJPY: acc.costJPY + day.costJPY,
            calls: acc.calls + day.calls
        }), { totalTokens: 0, costUSD: 0, costJPY: 0, calls: 0 });

        document.getElementById('statValue1').textContent = totals.totalTokens.toLocaleString();
        document.getElementById('statValue2').textContent = `$${totals.costUSD.toFixed(2)}`;
        document.getElementById('statValue3').textContent = `¥${Math.round(totals.costJPY).toLocaleString()}`;
        document.getElementById('statValue4').textContent = totals.calls.toLocaleString();
        
        // プロジェクト統計では詳細情報を非表示
        document.getElementById('statProjects1').textContent = '';
        document.getElementById('statProjects2').textContent = '';
        document.getElementById('statProjects3').textContent = '';
        document.getElementById('statProjects4').textContent = '';
    }


    // チャートを描画
    renderChart() {
        const canvas = document.getElementById('usageChart');
        const ctx = canvas.getContext('2d');
        
        // キャンバスをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.dailyStats.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('データがありません', canvas.width / 2, canvas.height / 2);
            return;
        }

        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        
        // データの最大値を取得
        const maxTokens = Math.max(...this.dailyStats.map(d => d.totalTokens));
        const maxCost = Math.max(...this.dailyStats.map(d => d.costJPY));
        
        if (maxTokens === 0) return;

        // バーの描画
        const barWidth = chartWidth / this.dailyStats.length;
        
        this.dailyStats.forEach((day, index) => {
            const x = padding + index * barWidth;
            const tokenHeight = (day.totalTokens / maxTokens) * chartHeight;
            const costHeight = (day.costJPY / maxCost) * chartHeight;
            
            // トークン使用量のバー (青)
            ctx.fillStyle = '#007bff';
            ctx.fillRect(x + 5, padding + chartHeight - tokenHeight, barWidth * 0.4 - 10, tokenHeight);
            
            // コストのバー (緑)
            ctx.fillStyle = '#28a745';
            ctx.fillRect(x + barWidth * 0.4 + 5, padding + chartHeight - costHeight, barWidth * 0.4 - 10, costHeight);
        });

        // 軸とラベル
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        
        // Y軸
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, padding + chartHeight);
        ctx.stroke();
        
        // X軸
        ctx.beginPath();
        ctx.moveTo(padding, padding + chartHeight);
        ctx.lineTo(padding + chartWidth, padding + chartHeight);
        ctx.stroke();
        
        // 日付ラベル
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        
        this.dailyStats.forEach((day, index) => {
            const x = padding + index * barWidth + barWidth / 2;
            const date = new Date(day.date);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;
            ctx.fillText(label, x, padding + chartHeight + 20);
        });

        // 凡例
        ctx.textAlign = 'left';
        ctx.fillStyle = '#007bff';
        ctx.fillRect(padding, 20, 15, 15);
        ctx.fillStyle = '#666';
        ctx.fillText('トークン使用量', padding + 25, 32);
        
        ctx.fillStyle = '#28a745';
        ctx.fillRect(padding + 150, 20, 15, 15);
        ctx.fillStyle = '#666';
        ctx.fillText('コスト (¥)', padding + 175, 32);
    }

    // テーブルを描画
    renderTable() {
        const tbody = document.getElementById('dataTableBody');
        
        tbody.innerHTML = this.dailyStats.map(day => `
            <tr>
                <td>${new Date(day.date).toLocaleDateString('ja-JP')}</td>
                <td>${day.inputTokens.toLocaleString()}</td>
                <td>${day.outputTokens.toLocaleString()}</td>
                <td>${day.totalTokens.toLocaleString()}</td>
                <td>$${day.costUSD.toFixed(2)}</td>
                <td>¥${Math.round(day.costJPY).toLocaleString()}</td>
                <td>${day.calls.toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppState();
});