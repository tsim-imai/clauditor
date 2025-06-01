import '@testing-library/jest-dom';

// Mock window.electronAPI for non-Electron environments
Object.defineProperty(window, 'electronAPI', {
  value: {
    scanClaudeProjects: () => Promise.resolve([]),
    readProjectLogs: () => Promise.resolve([]),
    getAppVersion: () => Promise.resolve('1.0.0'),
    getPlatform: () => 'test',
    startFileWatcher: () => Promise.resolve(true),
    stopFileWatcher: () => Promise.resolve(true),
    onFileSystemChange: () => {},
    removeFileSystemChangeListener: () => {},
    showDirectoryDialog: () => Promise.resolve(null),
    validateProjectPath: () => Promise.resolve(true),
  },
  writable: true,
});