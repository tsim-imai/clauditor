import { ProjectInfo, LogEntry } from './index';

interface FileSystemChangeEvent {
  type: 'file-added' | 'file-changed' | 'file-removed' | 'project-added' | 'project-removed';
  path: string;
  timestamp: string;
}

declare global {
  interface Window {
    electronAPI: {
      scanClaudeProjects: () => Promise<ProjectInfo[]>;
      readProjectLogs: (projectPath: string) => Promise<LogEntry[]>;
      getAppVersion: () => Promise<string>;
      getPlatform: () => string;
      startFileWatcher: () => Promise<boolean>;
      stopFileWatcher: () => Promise<boolean>;
      onFileSystemChange: (callback: (event: FileSystemChangeEvent) => void) => void;
      removeFileSystemChangeListener: () => void;
      showDirectoryDialog: () => Promise<string | null>;
      validateProjectPath: (path: string) => Promise<boolean>;
    };
  }
}

export {};