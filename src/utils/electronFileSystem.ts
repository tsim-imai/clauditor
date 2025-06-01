import type { ProjectInfo, LogEntry } from '../types';
import { ClauditorError, ErrorType, classifyError } from '../types/errors';

// Check if we're running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const scanClaudeProjects = async (): Promise<ProjectInfo[]> => {
  if (isElectron()) {
    try {
      return await window.electronAPI.scanClaudeProjects();
    } catch (error) {
      const classified = classifyError(error);
      console.error('Failed to scan Claude projects:', classified);
      
      // Throw more specific error
      if (classified.type === ErrorType.FILE_NOT_FOUND) {
        throw new ClauditorError(
          ErrorType.FILE_NOT_FOUND,
          'Claude プロジェクトディレクトリが見つかりません',
          'Claude Code を使用してプロジェクトを作成してください',
          { path: '~/.claude/projects' }
        );
      }
      
      throw classified;
    }
  } else {
    // Fallback to mock data for web version
    try {
      const { getMockProjects } = await import('./claudeProjectScanner');
      return getMockProjects();
    } catch (error) {
      throw classifyError(error);
    }
  }
};

export const readProjectLogs = async (projectPath: string): Promise<LogEntry[]> => {
  if (isElectron()) {
    try {
      return await window.electronAPI.readProjectLogs(projectPath);
    } catch (error) {
      const classified = classifyError(error);
      console.error('Failed to read project logs:', classified);
      
      // Add context information
      throw new ClauditorError(
        classified.type,
        classified.message,
        classified.details,
        { projectPath, ...classified.context }
      );
    }
  } else {
    // Fallback to mock data for web version
    try {
      const { generateMockLogEntries } = await import('./mockData');
      const projectName = projectPath.split('/').pop() || 'unknown';
      return generateMockLogEntries(projectName);
    } catch (error) {
      throw classifyError(error);
    }
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