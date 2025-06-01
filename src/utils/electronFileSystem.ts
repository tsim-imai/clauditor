import type { ProjectInfo, LogEntry } from '../types';

// Check if we're running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const scanClaudeProjects = async (): Promise<ProjectInfo[]> => {
  if (isElectron()) {
    try {
      return await window.electronAPI.scanClaudeProjects();
    } catch (error) {
      console.error('Failed to scan Claude projects:', error);
      throw new Error(`Failed to scan projects: ${error}`);
    }
  } else {
    // Fallback to mock data for web version
    const { getMockProjects } = await import('./claudeProjectScanner');
    return getMockProjects();
  }
};

export const readProjectLogs = async (projectPath: string): Promise<LogEntry[]> => {
  if (isElectron()) {
    try {
      return await window.electronAPI.readProjectLogs(projectPath);
    } catch (error) {
      console.error('Failed to read project logs:', error);
      throw new Error(`Failed to read logs: ${error}`);
    }
  } else {
    // Fallback to mock data for web version
    const { generateMockLogEntries } = await import('./mockData');
    const projectName = projectPath.split('/').pop() || 'unknown';
    return generateMockLogEntries(projectName);
  }
};

export const getAppInfo = async (): Promise<{ version: string; platform: string }> => {
  if (isElectron()) {
    try {
      const version = await window.electronAPI.getAppVersion();
      const platform = window.electronAPI.getPlatform();
      return { version, platform };
    } catch (error) {
      console.error('Failed to get app info:', error);
      return { version: 'unknown', platform: 'web' };
    }
  } else {
    return { version: 'web', platform: 'web' };
  }
};