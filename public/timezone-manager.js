/**
 * タイムゾーン変換処理を担当するクラス
 * UTC/ローカル変換、日付キー生成、タイムゾーン設定管理を行う
 */
class TimezoneManager {
    constructor(userTimezone = null) {
        // ユーザーのタイムゾーンを設定（デフォルトはブラウザの設定）
        this.userTimezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        // サポートされているタイムゾーンのリスト
        this.supportedTimezones = [
            { value: 'Asia/Tokyo', label: '日本標準時 (JST)', offset: '+09:00' },
            { value: 'UTC', label: '協定世界時 (UTC)', offset: '+00:00' },
            { value: 'America/New_York', label: '東部標準時 (EST)', offset: '-05:00' },
            { value: 'America/Los_Angeles', label: '太平洋標準時 (PST)', offset: '-08:00' },
            { value: 'Europe/London', label: 'グリニッジ標準時 (GMT)', offset: '+00:00' },
            { value: 'Europe/Paris', label: '中央ヨーロッパ時間 (CET)', offset: '+01:00' },
            { value: 'Asia/Shanghai', label: '中国標準時 (CST)', offset: '+08:00' },
            { value: 'Asia/Seoul', label: '韓国標準時 (KST)', offset: '+09:00' },
            { value: 'Australia/Sydney', label: 'オーストラリア東部時間 (AEST)', offset: '+10:00' }
        ];
        
        console.log('TimezoneManager initialized with timezone:', this.userTimezone);
    }

    /**
     * ユーザーのタイムゾーンを設定
     */
    setUserTimezone(timezone) {
        this.userTimezone = timezone;
        console.log('Timezone changed to:', timezone);
    }

    /**
     * 現在のユーザータイムゾーンを取得
     */
    getUserTimezone() {
        return this.userTimezone;
    }

    /**
     * サポートされているタイムゾーン一覧を取得
     */
    getSupportedTimezones() {
        return this.supportedTimezones;
    }

    /**
     * UTC文字列をユーザーのタイムゾーンのDateオブジェクトに変換
     */
    utcToUserTimezone(utcString) {
        if (!utcString) return null;
        
        try {
            const utcDate = new Date(utcString);
            if (isNaN(utcDate.getTime())) return null;
            
            // ユーザーのタイムゾーンに変換
            return new Date(utcDate.toLocaleString('en-US', { timeZone: this.userTimezone }));
        } catch (error) {
            console.warn('Failed to convert UTC to user timezone:', error);
            return new Date(utcString); // フォールバック
        }
    }

    /**
     * UTC文字列からユーザータイムゾーンでの日付キー（YYYY-MM-DD）を生成
     */
    getLocalDateKey(utcString) {
        if (!utcString) return null;
        
        try {
            const utcDate = new Date(utcString);
            if (isNaN(utcDate.getTime())) return null;
            
            // ユーザーのタイムゾーンでの日付を取得
            const formatter = new Intl.DateTimeFormat('sv-SE', { // ISO 8601 format
                timeZone: this.userTimezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            return formatter.format(utcDate);
        } catch (error) {
            console.warn('Failed to get local date key:', error);
            // フォールバック: ローカル時間ベースの日付キー
            const fallbackDate = new Date(utcString);
            const year = fallbackDate.getFullYear();
            const month = (fallbackDate.getMonth() + 1).toString().padStart(2, '0');
            const day = fallbackDate.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    /**
     * UTC文字列からユーザータイムゾーンでの時間（0-23）を取得
     */
    getLocalHour(utcString) {
        if (!utcString) return null;
        
        try {
            const utcDate = new Date(utcString);
            if (isNaN(utcDate.getTime())) return null;
            
            // ユーザーのタイムゾーンでの時間を取得
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: this.userTimezone,
                hour: 'numeric',
                hour12: false
            });
            
            return parseInt(formatter.format(utcDate), 10);
        } catch (error) {
            console.warn('Failed to get local hour:', error);
            // フォールバック: ローカル時間
            return new Date(utcString).getHours();
        }
    }

    /**
     * ユーザータイムゾーンでの現在時刻を取得
     */
    getNow() {
        return new Date();
    }

    /**
     * ユーザータイムゾーンでの今日の日付キーを取得
     */
    getTodayDateKey() {
        // 直接ローカル時間で今日の日付キーを生成
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 期間の開始日をユーザータイムゾーンで計算
     */
    getPeriodStartDate(period) {
        const now = this.getNow();
        let startDate;

        // ユーザータイムゾーンでの計算
        const localNow = new Date(now.toLocaleString('en-US', { timeZone: this.userTimezone }));

        switch (period) {
            case 'today':
                startDate = new Date(localNow);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate = new Date(localNow);
                startDate.setDate(localNow.getDate() - localNow.getDay()); // 今週の日曜日
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                startDate = new Date(localNow.getFullYear(), localNow.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(localNow.getFullYear(), 0, 1);
                break;
            case 'all':
            default:
                startDate = new Date(0); // すべての期間
                break;
        }

        return startDate;
    }

    /**
     * 比較期間の開始日と終了日をユーザータイムゾーンで計算
     */
    getComparisonPeriodDates(period) {
        const now = this.getNow();
        const localNow = new Date(now.toLocaleString('en-US', { timeZone: this.userTimezone }));
        let comparisonStartDate, comparisonEndDate;

        switch (period) {
            case 'today':
                // 前日
                comparisonStartDate = new Date(localNow);
                comparisonStartDate.setDate(localNow.getDate() - 1);
                comparisonStartDate.setHours(0, 0, 0, 0);
                comparisonEndDate = new Date(comparisonStartDate);
                comparisonEndDate.setHours(23, 59, 59, 999);
                break;
                
            case 'week':
                // 先週
                const thisWeekStart = new Date(localNow);
                thisWeekStart.setDate(localNow.getDate() - localNow.getDay());
                thisWeekStart.setHours(0, 0, 0, 0);
                
                comparisonStartDate = new Date(thisWeekStart);
                comparisonStartDate.setDate(thisWeekStart.getDate() - 7);
                comparisonEndDate = new Date(thisWeekStart);
                comparisonEndDate.setMilliseconds(-1);
                break;
                
            case 'month':
                // 先月
                comparisonStartDate = new Date(localNow.getFullYear(), localNow.getMonth() - 1, 1);
                comparisonEndDate = new Date(localNow.getFullYear(), localNow.getMonth(), 0, 23, 59, 59, 999);
                break;
                
            case 'year':
                // 昨年
                comparisonStartDate = new Date(localNow.getFullYear() - 1, 0, 1);
                comparisonEndDate = new Date(localNow.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
                break;
                
            case 'all':
            default:
                // 全期間の場合は比較なし
                return { startDate: null, endDate: null };
        }

        return { 
            startDate: comparisonStartDate, 
            endDate: comparisonEndDate 
        };
    }

    /**
     * 週の開始日をユーザータイムゾーンで計算
     */
    getWeekStart(date) {
        const localDate = new Date(date.toLocaleString('en-US', { timeZone: this.userTimezone }));
        const weekStart = new Date(localDate);
        weekStart.setDate(localDate.getDate() - localDate.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    }

    /**
     * タイムゾーンの表示名を取得
     */
    getTimezoneDisplayName(timezone = null) {
        const tz = timezone || this.userTimezone;
        const found = this.supportedTimezones.find(t => t.value === tz);
        if (found) {
            return `${found.label} (${found.offset})`;
        }
        
        // フォールバック: ブラウザのAPIで取得
        try {
            const formatter = new Intl.DateTimeFormat('ja-JP', {
                timeZone: tz,
                timeZoneName: 'long'
            });
            const parts = formatter.formatToParts(new Date());
            const timeZoneName = parts.find(part => part.type === 'timeZoneName');
            return timeZoneName ? timeZoneName.value : tz;
        } catch (error) {
            return tz;
        }
    }

    /**
     * 現在のタイムゾーンのオフセット（分）を取得
     */
    getTimezoneOffset() {
        try {
            const now = new Date();
            const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
            const localTime = new Date(utcTime + this.getTimezoneOffsetMs());
            return Math.floor((localTime.getTime() - utcTime) / 60000);
        } catch (error) {
            console.warn('Failed to get timezone offset:', error);
            return 0;
        }
    }

    /**
     * タイムゾーンのオフセット（ミリ秒）を取得
     */
    getTimezoneOffsetMs() {
        try {
            const now = new Date();
            const utc = new Date(now.toISOString());
            const local = new Date(now.toLocaleString('en-US', { timeZone: this.userTimezone }));
            return local.getTime() - utc.getTime();
        } catch (error) {
            console.warn('Failed to get timezone offset in ms:', error);
            return 0;
        }
    }

    /**
     * 日付範囲がユーザータイムゾーンの特定期間に含まれるかチェック
     */
    isInPeriod(utcString, period) {
        if (!utcString) return false;
        
        try {
            const utcDate = new Date(utcString);
            if (isNaN(utcDate.getTime())) return false;
            
            const startDate = this.getPeriodStartDate(period);
            const localDate = this.utcToUserTimezone(utcString);
            
            return localDate >= startDate;
        } catch (error) {
            console.warn('Failed to check if date is in period:', error);
            return false;
        }
    }

    /**
     * デバッグ情報を出力
     */
    debugInfo() {
        const now = new Date();
        console.log('=== TimezoneManager Debug Info ===');
        console.log('User Timezone:', this.userTimezone);
        console.log('Current UTC:', now.toISOString());
        console.log('Current Local:', now.toLocaleString('en-US', { timeZone: this.userTimezone }));
        console.log('Today Date Key:', this.getTodayDateKey());
        console.log('Timezone Offset (minutes):', this.getTimezoneOffset());
        console.log('Timezone Display Name:', this.getTimezoneDisplayName());
        console.log('===================================');
    }
}