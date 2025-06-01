import { create } from 'zustand';
import type { LogEntry, DailyStats, AppSettings, ProjectInfo } from '../types';
import type { AppError } from '../types/errors';

interface AppState {
  logEntries: LogEntry[];
  dailyStats: DailyStats[];
  projects: ProjectInfo[];
  selectedProject: string | null;
  settings: AppSettings;
  loading: boolean;
  error: AppError | null;
  setLogEntries: (entries: LogEntry[]) => void;
  setDailyStats: (stats: DailyStats[]) => void;
  setProjects: (projects: ProjectInfo[]) => void;
  setSelectedProject: (projectName: string | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setSettings: (settings: AppSettings) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: AppError | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  logEntries: [],
  dailyStats: [],
  projects: [],
  selectedProject: null,
  loading: false,
  error: null,
  settings: {
    exchangeRate: 150,
    darkMode: false,
    customProjectPath: '',
    useBackendService: false,
    backendServiceUrl: 'http://localhost:3001',
  },
  setLogEntries: (entries) => set({ logEntries: entries }),
  setDailyStats: (stats) => set({ dailyStats: stats }),
  setProjects: (projects) => set({ projects }),
  setSelectedProject: (projectName) => set({ selectedProject: projectName }),
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));