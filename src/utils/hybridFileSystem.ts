/**
 * ハイブリッドファイルシステムアクセス
 * Electronとバックエンドサービスの両方に対応
 */

import { backendApiClient, convertBackendToFrontendProject, convertBackendToFrontendLogEntry } from '../services/backendApiClient';
import { scanClaudeProjects as electronScanProjects, readProjectLogs } from './electronFileSystem';
import type { ProjectInfo, LogEntry } from '../types';

export interface HybridFileSystemOptions {
  useBackendService: boolean;
  backendServiceUrl?: string;
  customProjectPath?: string;
}

/**
 * プロジェクトをスキャンする（Electron/バックエンド対応）
 */
export const scanClaudeProjects = async (options: HybridFileSystemOptions): Promise<ProjectInfo[]> => {
  const { useBackendService, backendServiceUrl, customProjectPath } = options;

  if (useBackendService) {
    // バックエンドサービス経由
    try {
      if (backendServiceUrl) {
        backendApiClient.setBaseUrl(backendServiceUrl);
      }

      // サーバーの可用性チェック
      const isAvailable = await backendApiClient.isAvailable();
      if (!isAvailable) {
        throw new Error('バックエンドサービスに接続できません');
      }

      const backendProjects = await backendApiClient.scanClaudeProjects(customProjectPath, true);
      
      // バックエンドの型をフロントエンドの型に変換
      return backendProjects.map(convertBackendToFrontendProject).map(project => ({
        name: project.name,
        path: project.path,
        logFiles: project.files,
        lastModified: project.lastModified,
      }));
    } catch (error) {
      console.error('Backend service scan failed:', error);
      throw new Error(`バックエンドサービス経由のスキャンに失敗しました: ${error}`);
    }
  } else {
    // Electron経由（既存の実装）
    if (!window.electronAPI) {
      throw new Error('Electron API が利用できません');
    }

    return electronScanProjects();
  }
};

/**
 * パスを検証する（Electron/バックエンド対応）
 */
export const validateProjectPath = async (
  path: string, 
  options: HybridFileSystemOptions
): Promise<boolean> => {
  const { useBackendService, backendServiceUrl } = options;

  if (useBackendService) {
    // バックエンドサービス経由
    try {
      if (backendServiceUrl) {
        backendApiClient.setBaseUrl(backendServiceUrl);
      }

      const result = await backendApiClient.validatePath(path);
      return result.isValid;
    } catch (error) {
      console.error('Backend path validation failed:', error);
      return false;
    }
  } else {
    // Electron経由
    if (!window.electronAPI) {
      return false;
    }

    try {
      return await window.electronAPI.validateProjectPath(path);
    } catch (error) {
      console.error('Electron path validation failed:', error);
      return false;
    }
  }
};

/**
 * プロジェクトのJSONLエントリを取得（Electron/バックエンド対応）
 */
export const getProjectEntries = async (
  project: ProjectInfo,
  options: HybridFileSystemOptions
): Promise<LogEntry[]> => {
  const { useBackendService, backendServiceUrl } = options;

  if (useBackendService) {
    // バックエンドサービス経由
    try {
      if (backendServiceUrl) {
        backendApiClient.setBaseUrl(backendServiceUrl);
      }

      // プロジェクトIDを生成（パスベース）
      const projectId = Buffer.from(project.path).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
      const backendEntries = await backendApiClient.getProjectEntries(projectId);
      
      // バックエンドの型をフロントエンドの型に変換
      return backendEntries.map(convertBackendToFrontendLogEntry).map(entry => ({
        timestamp: entry.timestamp,
        message: {
          usage: {
            input_tokens: entry.metadata?.tokenUsage?.input || 0,
            output_tokens: entry.metadata?.tokenUsage?.output || 0,
          }
        },
        costUSD: entry.metadata?.cost || 0,
      }));
    } catch (error) {
      console.error('Backend entries fetch failed:', error);
      throw new Error(`バックエンドサービス経由のエントリ取得に失敗しました: ${error}`);
    }
  } else {
    // Electron経由（既存の実装を利用）
    if (!window.electronAPI) {
      throw new Error('Electron API が利用できません');
    }

    // 既存のElectron実装を呼び出し
    return await readProjectLogs(project.path);
  }
};

/**
 * ファイルシステム監視を開始（Electron/バックエンド対応）
 */
export const startFileSystemWatch = async (
  path: string,
  options: HybridFileSystemOptions
): Promise<void> => {
  const { useBackendService, backendServiceUrl } = options;

  if (useBackendService) {
    // バックエンドサービス経由
    try {
      if (backendServiceUrl) {
        backendApiClient.setBaseUrl(backendServiceUrl);
      }

      await backendApiClient.startFileSystemWatch(path);
      
      // WebSocketやServer-Sent Eventsでリアルタイム更新を受信する実装が必要
      // 現在は基本的な開始のみ実装
    } catch (error) {
      console.error('Backend file watch start failed:', error);
      throw new Error(`バックエンド経由のファイル監視開始に失敗しました: ${error}`);
    }
  } else {
    // Electron経由（既存の実装を利用）
    if (!window.electronAPI) {
      throw new Error('Electron API が利用できません');
    }

    // 既存のElectronファイル監視実装を呼び出し
    // 注: 実際の実装では、useFileSystemWatcherフックを参照
  }
};

/**
 * バックエンドサービスの可用性をチェック
 */
export const checkBackendServiceAvailability = async (serviceUrl: string): Promise<boolean> => {
  try {
    backendApiClient.setBaseUrl(serviceUrl);
    return await backendApiClient.isAvailable();
  } catch {
    return false;
  }
};