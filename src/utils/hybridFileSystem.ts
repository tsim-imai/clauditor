/**
 * Electronファイルシステムアクセス
 */

import { scanClaudeProjects as electronScanProjects, readProjectLogs } from './electronFileSystem';
import type { ProjectInfo, LogEntry } from '../types';

/**
 * プロジェクトをスキャンする（Electron専用）
 */
export const scanClaudeProjects = async (): Promise<ProjectInfo[]> => {
  console.log('scanClaudeProjects called');
  console.log('window.electronAPI available?:', !!window.electronAPI);
  
  if (!window.electronAPI) {
    console.error('Electron API not available');
    console.log('window object keys:', Object.keys(window));
    throw new Error('Electron API が利用できません');
  }

  console.log('electronAPI methods:', Object.keys(window.electronAPI));
  
  try {
    const projects = await electronScanProjects();
    console.log('Electron found projects:', projects.length);
    console.log('Electron projects details:', projects);
    return projects;
  } catch (error) {
    console.error('Electron scan failed:', error);
    throw error;
  }
};

/**
 * パスを検証する（Electron専用）
 */
export const validateProjectPath = async (path: string): Promise<boolean> => {
  if (!window.electronAPI) {
    return false;
  }

  try {
    return await window.electronAPI.validateProjectPath(path);
  } catch (error) {
    console.error('Electron path validation failed:', error);
    return false;
  }
};

/**
 * プロジェクトのJSONLエントリを取得（Electron専用）
 */
export const getProjectEntries = async (project: ProjectInfo): Promise<LogEntry[]> => {
  if (!window.electronAPI) {
    throw new Error('Electron API が利用できません');
  }

  return await readProjectLogs(project.path);
};

