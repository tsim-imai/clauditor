import { contextBridge, ipcRenderer } from 'electron';
import { ProjectInfo, LogEntry } from '../src/types';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project scanning
  scanClaudeProjects: (): Promise<ProjectInfo[]> => 
    ipcRenderer.invoke('scan-claude-projects'),
  
  // Project log reading  
  readProjectLogs: (projectPath: string): Promise<LogEntry[]> =>
    ipcRenderer.invoke('read-project-logs', projectPath),

  // App info
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),
    
  // Platform info
  getPlatform: () => process.platform,

  // File system watching
  startFileWatcher: (): Promise<boolean> =>
    ipcRenderer.invoke('start-file-watcher'),
  
  stopFileWatcher: (): Promise<boolean> =>
    ipcRenderer.invoke('stop-file-watcher'),

  // Listen to file system changes
  onFileSystemChange: (callback: (event: any) => void) => {
    ipcRenderer.on('file-system-change', (_, event) => callback(event));
  },

  // Remove file system change listener
  removeFileSystemChangeListener: () => {
    ipcRenderer.removeAllListeners('file-system-change');
  },
});