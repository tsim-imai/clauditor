import { create } from 'zustand';
import type { LogEntry, DailyStats, AppSettings } from '../types';

interface AppState {
  logEntries: LogEntry[];
  dailyStats: DailyStats[];
  settings: AppSettings;
  setLogEntries: (entries: LogEntry[]) => void;
  setDailyStats: (stats: DailyStats[]) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  logEntries: [],
  dailyStats: [],
  settings: {
    exchangeRate: 150,
    darkMode: false,
  },
  setLogEntries: (entries) => set({ logEntries: entries }),
  setDailyStats: (stats) => set({ dailyStats: stats }),
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
}));