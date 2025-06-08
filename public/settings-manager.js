import { Utils } from './utils.js';

/**
 * 設定管理とUIモーダル制御を担当するクラス
 * 設定の保存・読み込み、モーダル表示、為替レート取得、ダークモード管理を行う
 */
export class SettingsManager {
    constructor() {
        this.settings = {
            exchangeRate: 150,
            darkMode: false,
            customProjectPath: '',
            lastRateUpdate: null,
            rateSource: 'manual'
        };
        
        this.onSettingsChange = null; // コールバック関数
        
        console.log('SettingsManager initialized');
        this.loadSettings();
        this.applyDarkMode();
    }

    /**
     * 設定変更時のコールバックを設定
     */
    setOnSettingsChange(callback) {
        this.onSettingsChange = callback;
    }

    /**
     * 現在の設定を取得
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * 特定の設定値を取得
     */
    getSetting(key) {
        return this.settings[key];
    }

    /**
     * 設定をローカルストレージから読み込み
     */
    loadSettings() {
        const saved = localStorage.getItem('clauditor-settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.applyDarkMode();
    }

    /**
     * 設定をローカルストレージに保存
     */
    saveSettings() {
        localStorage.setItem('clauditor-settings', JSON.stringify(this.settings));
        this.applyDarkMode();
        
        // 設定変更をアプリケーションに通知
        if (this.onSettingsChange) {
            this.onSettingsChange(this.settings);
        }
    }

    /**
     * 設定を更新
     */
    updateSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }

    /**
     * 複数の設定をまとめて更新
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }

    /**
     * ダークモードを適用
     */
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

    /**
     * ダークモードを切り替え
     */
    toggleDarkMode() {
        this.settings.darkMode = !this.settings.darkMode;
        this.saveSettings();
    }

    /**
     * 設定モーダルを表示
     */
    showSettingsModal() {
        document.getElementById('exchangeRate').value = this.settings.exchangeRate;
        document.getElementById('customPath').value = this.settings.customProjectPath;
        document.getElementById('darkModeCheckbox').checked = this.settings.darkMode;
        this.updateExchangeRateInfo();
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    /**
     * 設定モーダルを非表示
     */
    hideSettingsModal() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    /**
     * モーダルから設定を保存
     */
    saveSettingsFromModal() {
        const oldRate = this.settings.exchangeRate;
        const newRate = parseFloat(document.getElementById('exchangeRate').value) || 150;
        
        if (newRate !== oldRate && this.settings.rateSource !== 'manual_override') {
            this.settings.rateSource = 'manual';
            this.settings.lastRateUpdate = Date.now();
        }
        
        this.settings.exchangeRate = newRate;
        this.settings.customProjectPath = document.getElementById('customPath').value;
        this.settings.darkMode = document.getElementById('darkModeCheckbox').checked;
        
        this.saveSettings();
        this.hideSettingsModal();
        
        return this.settings;
    }

    /**
     * 為替レート情報を更新
     */
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

    /**
     * 時間の経過を表示用文字列に変換
     */
    getTimeAgo(date) {
        return Utils.getTimeAgo(date);
    }

    /**
     * 24時間経過しているかチェック
     */
    isExchangeRateStale() {
        const lastUpdate = this.settings.lastRateUpdate;
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        
        return !lastUpdate || (now - lastUpdate) > TWENTY_FOUR_HOURS;
    }

    /**
     * 為替レートを自動取得（24時間経過時）
     */
    async autoFetchExchangeRateIfNeeded() {
        if (this.isExchangeRateStale()) {
            try {
                await this.fetchCurrentExchangeRate(true);
            } catch (error) {
                console.log('Auto fetch exchange rate failed, using current rate:', error);
            }
        }
    }

    /**
     * 現在の為替レートを取得
     */
    async fetchCurrentExchangeRate(silent = false) {
        if (!window.electronAPI || !window.electronAPI.fetchExchangeRate) {
            if (!silent) {
                this.showError('為替レートAPIが利用できません');
            }
            return;
        }

        const button = document.getElementById('fetchRateButton');
        const originalText = button?.innerHTML;
        
        if (!silent && button) {
            button.innerHTML = '<i class="material-icons">sync</i> 取得中...';
            button.disabled = true;
        }

        try {
            const result = await window.electronAPI.fetchExchangeRate();
            
            if (result.success) {
                this.settings.exchangeRate = Utils.roundNumber(result.rate, 2);
                this.settings.lastRateUpdate = result.timestamp;
                this.settings.rateSource = result.source;
                
                this.saveSettings();
                
                const exchangeRateInput = document.getElementById('exchangeRate');
                if (exchangeRateInput) {
                    exchangeRateInput.value = this.settings.exchangeRate;
                }
                this.updateExchangeRateInfo();
                
                if (!silent) {
                    this.showSuccess(`為替レートを更新しました: ${this.settings.exchangeRate} JPY/USD`);
                }
                
                return { success: true, rate: this.settings.exchangeRate };
            } else {
                if (!silent) {
                    this.showError(`為替レート取得に失敗しました: ${result.error}`);
                }
                console.error('Exchange rate fetch failed:', result);
                return { success: false, error: result.error };
            }
        } catch (error) {
            if (!silent) {
                this.showError('為替レート取得中にエラーが発生しました');
            }
            console.error('Failed to fetch exchange rate:', error);
            return { success: false, error: error.message };
        } finally {
            if (!silent && button) {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
    }

    /**
     * エラーメッセージを表示
     */
    showError(message) {
        const errorToast = document.getElementById('errorToast');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorMessage && errorToast) {
            errorMessage.textContent = message;
            errorToast.classList.remove('hidden');
            
            setTimeout(() => {
                this.hideError();
            }, 5000);
        }
    }

    /**
     * エラーメッセージを非表示
     */
    hideError() {
        const errorToast = document.getElementById('errorToast');
        if (errorToast) {
            errorToast.classList.add('hidden');
        }
    }

    /**
     * 成功メッセージを表示
     */
    showSuccess(message) {
        const toast = document.getElementById('errorToast');
        const messageEl = document.getElementById('errorMessage');
        
        if (messageEl && toast) {
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
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // ダークモード切り替え
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', () => {
                this.toggleDarkMode();
            });
        }

        // 設定モーダル
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.showSettingsModal();
            });
        }

        const closeSettings = document.getElementById('closeSettings');
        if (closeSettings) {
            closeSettings.addEventListener('click', () => {
                this.hideSettingsModal();
            });
        }

        const saveSettings = document.getElementById('saveSettings');
        if (saveSettings) {
            saveSettings.addEventListener('click', () => {
                this.saveSettingsFromModal();
            });
        }

        const cancelSettings = document.getElementById('cancelSettings');
        if (cancelSettings) {
            cancelSettings.addEventListener('click', () => {
                this.hideSettingsModal();
            });
        }

        // モーダル外クリックで閉じる
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target.id === 'settingsModal') {
                    this.hideSettingsModal();
                }
            });
        }

        // パス参照ボタン
        const browseButton = document.getElementById('browseButton');
        if (browseButton) {
            browseButton.addEventListener('click', async () => {
                try {
                    const path = await window.electronAPI.showDirectoryDialog();
                    if (path) {
                        document.getElementById('customPath').value = path;
                    }
                } catch (error) {
                    console.error('Failed to show directory dialog:', error);
                }
            });
        }

        // エラートースト dismiss
        const dismissError = document.getElementById('dismissError');
        if (dismissError) {
            dismissError.addEventListener('click', () => {
                this.hideError();
            });
        }

        // 為替レート取得ボタン
        const fetchRateButton = document.getElementById('fetchRateButton');
        if (fetchRateButton) {
            fetchRateButton.addEventListener('click', () => {
                this.fetchCurrentExchangeRate();
            });
        }
    }

    /**
     * 設定の妥当性をチェック
     */
    validateSettings() {
        const errors = [];
        
        if (this.settings.exchangeRate < 1 || this.settings.exchangeRate > 1000) {
            errors.push('為替レートは1-1000の範囲で設定してください');
        }
        
        return errors;
    }

    /**
     * 設定をリセット
     */
    resetSettings() {
        this.settings = {
            exchangeRate: 150,
            darkMode: false,
            customProjectPath: '',
            lastRateUpdate: null,
            rateSource: 'manual'
        };
        this.saveSettings();
    }
}