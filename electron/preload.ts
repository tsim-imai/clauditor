const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project scanning
  scanClaudeProjects: () => 
    ipcRenderer.invoke('scan-claude-projects'),
  
  // Project log reading  
  readProjectLogs: (projectPath: string) =>
    ipcRenderer.invoke('read-project-logs', projectPath),

  // App info
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
    
  // Platform info
  getPlatform: () => process.platform,

  // File system watching
  startFileWatcher: () =>
    ipcRenderer.invoke('start-file-watcher'),
  
  stopFileWatcher: () =>
    ipcRenderer.invoke('stop-file-watcher'),

  // Listen to file system changes
  onFileSystemChange: (callback: (event: any) => void) => {
    ipcRenderer.on('file-system-change', (_, event) => callback(event));
  },

  // Remove file system change listener
  removeFileSystemChangeListener: () => {
    ipcRenderer.removeAllListeners('file-system-change');
  },

  // Show directory dialog
  showDirectoryDialog: () =>
    ipcRenderer.invoke('show-directory-dialog'),

  // Validate project path
  validateProjectPath: (path: string) =>
    ipcRenderer.invoke('validate-project-path', path),

  // Fetch exchange rate
  fetchExchangeRate: () =>
    ipcRenderer.invoke('fetch-exchange-rate'),

  // Mini window mode
  setMiniMode: (enabled: boolean) =>
    ipcRenderer.invoke('set-mini-mode', enabled),
    
  getWindowState: () =>
    ipcRenderer.invoke('get-window-state'),

  // File watcher status
  getFileWatcherStatus: () =>
    ipcRenderer.invoke('get-file-watcher-status'),

  // Test file watcher
  testFileWatcher: () =>
    ipcRenderer.invoke('test-file-watcher'),

  // DuckDB query execution
  executeDuckDBQuery: (query: string) =>
    ipcRenderer.invoke('execute-duckdb-query', query),
});