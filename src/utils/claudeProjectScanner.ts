import type { LogEntry } from '../types';

export interface ProjectInfo {
  name: string;
  path: string;
  logFiles: string[];
  lastModified: Date;
}

// const getClaudeProjectsPath = () => {
//   const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
//   return `${homeDir}/.claude/projects`;
// };

export const scanClaudeProjects = async (): Promise<ProjectInfo[]> => {
  try {
    // In a browser environment, we can't directly access the file system
    // This would need to be implemented differently in a real application
    // For now, we'll return a mock response
    
    // In a real implementation, this would use:
    // - Electron's file system APIs
    // - A backend service
    // - Browser file system access APIs (with user permission)
    // const projectsPath = getClaudeProjectsPath();
    
    return [];
  } catch (error) {
    console.error('Failed to scan Claude projects:', error);
    return [];
  }
};

export const readProjectLogs = async (projectPath: string): Promise<LogEntry[]> => {
  try {
    // This would read all .jsonl files in the project directory
    // For browser compatibility, this needs special handling
    
    // For demonstration, generate mock data based on project name
    const { generateMockLogEntries } = await import('./mockData');
    const projectName = projectPath.split('/').pop() || 'unknown';
    const mockEntries = generateMockLogEntries(projectName);
    
    return mockEntries;
  } catch (error) {
    console.error(`Failed to read logs for project ${projectPath}:`, error);
    return [];
  }
};

// For demonstration purposes, provide mock data
export const getMockProjects = (): ProjectInfo[] => {
  return [
    {
      name: 'web-app-project',
      path: '/Users/user/.claude/projects/web-app-project',
      logFiles: ['usage-2024-05.jsonl', 'usage-2024-06.jsonl'],
      lastModified: new Date('2024-06-01T10:30:00Z'),
    },
    {
      name: 'data-analysis',
      path: '/Users/user/.claude/projects/data-analysis',
      logFiles: ['usage-2024-06.jsonl'],
      lastModified: new Date('2024-05-28T15:45:00Z'),
    },
    {
      name: 'mobile-app',
      path: '/Users/user/.claude/projects/mobile-app',
      logFiles: ['usage-2024-05.jsonl'],
      lastModified: new Date('2024-05-25T09:15:00Z'),
    },
  ];
};