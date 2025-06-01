import { create } from 'zustand';
import type { LogEntry, DailyStats, AppSettings, ProjectInfo } from '../types';

interface AppState {
  logEntries: LogEntry[];
  dailyStats: DailyStats[];
  projects: ProjectInfo[];
  selectedProject: string | null;
  settings: AppSettings;
  setLogEntries: (entries: LogEntry[]) => void;
  setDailyStats: (stats: DailyStats[]) => void;
  setProjects: (projects: ProjectInfo[]) => void;
  setSelectedProject: (projectName: string | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  logEntries: [],
  dailyStats: [],
  projects: [],
  selectedProject: null,
  settings: {
    exchangeRate: 150,
    darkMode: false,
  },
  setLogEntries: (entries) => set({ logEntries: entries }),
  setDailyStats: (stats) => set({ dailyStats: stats }),
  setProjects: (projects) => set({ projects }),
  setSelectedProject: (projectName) => set({ selectedProject: projectName }),
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
}));