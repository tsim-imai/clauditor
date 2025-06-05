/**
 * 汎用ユーティリティ関数を提供するクラス
 * フォーマット、時間計算、数値操作などの共通処理を集約
 */
class Utils {
    /**
     * トークン数をフォーマット（k表記）
     */
    static formatTokens(tokens) {
        if (tokens >= 10000) {
            return `${Math.round(tokens / 1000)}k`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}k`;
        }
        return tokens.toString();
    }

    /**
     * 時間の経過を表示用文字列に変換
     */
    static getTimeAgo(date) {
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

    /**
     * 数値を四捨五入
     */
    static roundNumber(number, decimals = 0) {
        return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    /**
     * 数値をローカライズされた文字列に変換
     */
    static formatNumber(number, locale = 'ja-JP') {
        return number.toLocaleString(locale);
    }

    /**
     * 日付をローカライズされた文字列に変換
     */
    static formatDate(date, options = { month: 'short', day: 'numeric' }, locale = 'ja-JP') {
        return new Date(date).toLocaleDateString(locale, options);
    }

    /**
     * 金額をフォーマット（円表記）
     */
    static formatCurrency(amount, currency = 'JPY', locale = 'ja-JP') {
        if (currency === 'JPY') {
            return `¥${Math.round(amount).toLocaleString(locale)}`;
        }
        return amount.toLocaleString(locale, { 
            style: 'currency', 
            currency: currency 
        });
    }

    /**
     * 時間をフォーマット（時間:分表記）
     */
    static formatTime(hours, showDecimals = false) {
        if (showDecimals) {
            return `${hours.toFixed(1)}h`;
        }
        
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);
        
        if (wholeHours === 0) {
            return `${minutes}m`;
        } else if (minutes === 0) {
            return `${wholeHours}h`;
        } else {
            return `${wholeHours}h${minutes}m`;
        }
    }

    /**
     * パーセンテージをフォーマット
     */
    static formatPercentage(value, decimals = 1) {
        return `${(value * 100).toFixed(decimals)}%`;
    }

    /**
     * 配列の中の最大値を取得
     */
    static getMaxValue(array) {
        return Math.max(...array.filter(val => !isNaN(val) && val !== null && val !== undefined));
    }

    /**
     * 配列の中の最小値を取得
     */
    static getMinValue(array) {
        return Math.min(...array.filter(val => !isNaN(val) && val !== null && val !== undefined));
    }

    /**
     * 配列の平均値を計算
     */
    static getAverage(array) {
        const validNumbers = array.filter(val => !isNaN(val) && val !== null && val !== undefined);
        return validNumbers.length > 0 ? validNumbers.reduce((sum, val) => sum + val, 0) / validNumbers.length : 0;
    }

    /**
     * 配列の合計値を計算
     */
    static getSum(array) {
        return array.filter(val => !isNaN(val) && val !== null && val !== undefined)
                   .reduce((sum, val) => sum + val, 0);
    }

    /**
     * 文字列を切り詰める（省略記号付き）
     */
    static truncateString(str, maxLength = 50, suffix = '...') {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - suffix.length) + suffix;
    }

    /**
     * 深いオブジェクトのコピーを作成
     */
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * オブジェクトが空かどうかチェック
     */
    static isEmpty(obj) {
        if (obj === null || obj === undefined) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        if (typeof obj === 'string') return obj.trim().length === 0;
        return false;
    }

    /**
     * 配列をシャッフル
     */
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * レスポンシブデザイン用の画面サイズ判定
     */
    static isMobileScreen() {
        return window.innerWidth <= 768;
    }

    /**
     * レスポンシブデザイン用のタブレット画面判定
     */
    static isTabletScreen() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    }

    /**
     * ダークモード判定
     */
    static isDarkMode() {
        return document.body.hasAttribute('data-theme') && 
               document.body.getAttribute('data-theme') === 'dark';
    }

    /**
     * 色の透明度を調整
     */
    static addAlphaToColor(color, alpha) {
        if (color.startsWith('#')) {
            return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        }
        return color + alpha.toString();
    }

    /**
     * デバウンス処理
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * スロットル処理
     */
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * ローカルストレージの安全な読み書き
     */
    static getFromStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Failed to read from localStorage for key: ${key}`, error);
            return defaultValue;
        }
    }

    static setToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`Failed to write to localStorage for key: ${key}`, error);
            return false;
        }
    }

    /**
     * URLパラメータを取得
     */
    static getURLParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    /**
     * ランダムIDを生成
     */
    static generateRandomId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * バイト数をフォーマット
     */
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}