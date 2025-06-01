import { ProjectInfo, LogEntry } from './index';

declare global {
  interface Window {
    electronAPI: {
      scanClaudeProjects: () => Promise<ProjectInfo[]>;
      readProjectLogs: (projectPath: string) => Promise<LogEntry[]>;
      getAppVersion: () => Promise<string>;
      getPlatform: () => string;
    };
  }
}

export {};