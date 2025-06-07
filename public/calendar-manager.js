/**
 * カレンダー表示と管理を担当するクラス
 * カレンダー描画、日付選択、日別統計表示、プロジェクト別チャート管理を行う
 */
class CalendarManager {
    constructor(duckDBProcessor, settings) {
        this.duckDBProcessor = duckDBProcessor;
        this.settings = settings;
        this.currentDate = new Date();
        this.monthOffset = 0; // 月オフセット（0=今月, -1=先月, etc）
        
        // デフォルトで今日を選択
        const today = new Date();
        this.selectedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        this.charts = {};
        this.dailyDataCache = new Map(); // 日別データキャッシュ
        
        console.log('CalendarManager initialized with DuckDBProcessor:', !!duckDBProcessor, 'settings:', !!settings);
        console.log('デフォルト選択日:', this.selectedDate);
    }

    /**
     * 設定を更新
     */
    updateSettings(settings) {
        this.settings = settings;
    }

    /**
     * 月オフセットを設定
     */
    setMonthOffset(offset) {
        this.monthOffset = offset;
    }

    /**
     * 表示対象の月を取得
     */
    getDisplayMonth() {
        const now = new Date();
        const displayDate = new Date(now.getFullYear(), now.getMonth() + this.monthOffset, 1);
        return displayDate;
    }

    /**
     * 日別データを取得（DuckDB使用）
     */
    async getDailyUsageData() {
        if (this.dailyDataCache.has('all')) {
            return this.dailyDataCache.get('all');
        }

        try {
            console.log('📅 CalendarManager: DuckDBで日別統計取得');
            // DuckDBから全期間のチャートデータを取得
            const chartData = await this.duckDBProcessor.getChartCompatibleData('all');
            
            // dailyDataを日別マップに変換
            const convertedData = new Map();
            if (chartData && chartData.dailyData) {
                chartData.dailyData.forEach(dayData => {
                    convertedData.set(dayData.date, {
                        totalTokens: dayData.tokens || 0,
                        costJPY: dayData.cost || 0,
                        costUSD: (dayData.cost || 0) / 150, // JPYからUSDに概算変換
                        calls: dayData.calls || 0,
                        inputTokens: Math.round((dayData.tokens || 0) * 0.3), // 概算（30%が入力）
                        outputTokens: Math.round((dayData.tokens || 0) * 0.7) // 概算（70%が出力）
                    });
                });
            }
            
            this.dailyDataCache.set('all', convertedData);
            return convertedData;
            
        } catch (error) {
            console.error('📅 CalendarManager: DuckDBデータ取得エラー:', error);
            return new Map();
        }
    }

    /**
     * トークン数をフォーマット
     */
    formatTokens(tokens) {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
    }

    /**
     * 使用量レベルを計算（0-4の5段階）
     */
    getUsageLevel(tokens) {
        if (tokens === 0) return 0;
        if (tokens <= 1000) return 1;
        if (tokens <= 5000) return 2;
        if (tokens <= 20000) return 3;
        return 4;
    }

    /**
     * 現在の日付を設定
     */
    setCurrentDate(date) {
        this.currentDate = new Date(date);
    }

    /**
     * 現在の日付を取得
     */
    getCurrentDate() {
        return this.currentDate;
    }

    /**
     * 選択された日付を取得
     */
    getSelectedDate() {
        return this.selectedDate;
    }

    /**
     * カレンダーを描画
     */
    async renderCalendar() {
        console.log('CalendarManager.renderCalendar called, monthOffset:', this.monthOffset);
        
        // 表示対象月を取得
        const displayMonth = this.getDisplayMonth();
        const year = displayMonth.getFullYear();
        const month = displayMonth.getMonth();
        
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
                
                const dayElement = await this.createCalendarDay(currentDate, month);
                calendarDays.appendChild(dayElement);
            }
        }

        // 今日が表示される月の場合、今日のデータを表示
        if (this.monthOffset === 0) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            
            // 今日のデータをサイドバーに表示
            await this.displayDateInfo(todayStr);
        }
    }

    /**
     * カレンダーの日付セルを作成
     */
    async createCalendarDay(date, currentMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        // ローカル日付キーを生成
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayNumber = date.getDate();
        const isCurrentMonth = date.getMonth() === currentMonth;
        const isToday = this.isToday(date);
        const dailyUsageData = await this.getDailyUsageData();
        const dailyData = dailyUsageData.get(dateKey);

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

    /**
     * 日付を選択
     */
    async selectDate(date) {
        this.selectedDate = date;
        
        // 選択状態を更新
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected');
        });
        event.target.closest('.calendar-day').classList.add('selected');

        // サイドバーを更新
        await this.updateSelectedDateInfo(date);
        await this.renderCalendar(); // カレンダーを再描画して選択状態を反映
    }

    /**
     * 選択された日付の情報を更新
     */
    async updateSelectedDateInfo(date) {
        // ローカル日付キーを生成
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dailyUsageData = await this.getDailyUsageData();
        const dailyData = dailyUsageData.get(dateKey);
        
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

    /**
     * 選択日のプロジェクト別チャートを更新（簡略化版）
     */
    updateDailyProjectChart(date) {
        // 現在は簡略化のため、プロジェクト別データは表示しない
        this.clearDailyProjectChart();
        
        // TODO: 将来的にDuckDBから特定日のプロジェクト別データを取得する機能を追加
        console.log('📅 プロジェクト別チャート（簡略化版）:', date);
    }

    /**
     * 日別プロジェクトチャートをクリア
     */
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


    /**
     * カレンダーデータを更新（データ更新時に呼び出し）
     */
    async refresh() {
        // キャッシュをクリア
        this.dailyDataCache.clear();
        
        if (this.isVisible()) {
            await this.renderCalendar();
        }
    }

    /**
     * カレンダーが表示されているかチェック
     */
    isVisible() {
        const calendarView = document.getElementById('calendarView');
        return calendarView && !calendarView.classList.contains('hidden');
    }

    /**
     * 今日かどうかをチェック
     */
    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    /**
     * チャートテーマを更新
     */
    updateChartsTheme() {
        // 選択日のプロジェクトチャートを再作成してテーマを適用
        if (this.selectedDate) {
            setTimeout(() => {
                this.updateDailyProjectChart(this.selectedDate);
            }, 100);
        }
    }

    /**
     * すべてのチャートを破棄
     */
    destroyCharts() {
        if (this.charts.dailyProject) {
            this.charts.dailyProject.destroy();
            this.charts.dailyProject = null;
        }
    }
}