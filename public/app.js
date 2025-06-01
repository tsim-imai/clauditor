// アプリケーション状態
class AppState {
    constructor() {
        this.projects = [];
        this.selectedProject = null;
        this.logEntries = [];
        this.dailyStats = [];
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
            darkModeIcon.textContent = this.settings.darkMode ? '☀️' : '🌙';
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
        } catch (error) {
            console.error('Failed to scan projects:', error);
            this.showError('プロジェクトの読み込みに失敗しました: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    // プロジェクトを選択
    async selectProject(project) {
        if (this.selectedProject === project.name) return;
        
        this.selectedProject = project.name;
        this.setLoading(true);
        this.updateUI();

        try {
            this.logEntries = await window.electronAPI.readProjectLogs(project.path);
            this.processLogEntries();
            this.renderDashboard();
        } catch (error) {
            console.error('Failed to read project logs:', error);
            this.showError('プロジェクトデータの読み込みに失敗しました: ' + error.message);
        } finally {
            this.setLoading(false);
        }
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
        
        // データを再計算
        if (this.logEntries.length > 0) {
            this.processLogEntries();
            this.renderDashboard();
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
        } else if (this.selectedProject && this.logEntries.length > 0) {
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
                this.renderProjects(); // アクティブ状態を更新
            });
        });
    }

    // ダッシュボードを描画
    renderDashboard() {
        this.renderStats();
        this.renderChart();
        this.renderTable();
    }

    // 統計を描画
    renderStats() {
        const totals = this.dailyStats.reduce((acc, day) => ({
            totalTokens: acc.totalTokens + day.totalTokens,
            costUSD: acc.costUSD + day.costUSD,
            costJPY: acc.costJPY + day.costJPY,
            calls: acc.calls + day.calls
        }), { totalTokens: 0, costUSD: 0, costJPY: 0, calls: 0 });

        document.getElementById('totalTokens').textContent = totals.totalTokens.toLocaleString();
        document.getElementById('totalCostUSD').textContent = `$${totals.costUSD.toFixed(2)}`;
        document.getElementById('totalCostJPY').textContent = `¥${Math.round(totals.costJPY).toLocaleString()}`;
        document.getElementById('totalCalls').textContent = totals.calls.toLocaleString();
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