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
});