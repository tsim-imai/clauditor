/**
 * バックエンドAPIクライアント
 * Electronと併用してバックエンドサービス経由でファイルアクセスを行う
 */

export interface BackendProjectInfo {
  id: string;
  name: string;
  path: string;
  files: string[];
  lastModified: string; // ISO string
  totalEntries: number;
}

export interface BackendLogEntry {
  id: string;
  timestamp: string;
  type: string;
  content: any;
  metadata?: {
    model?: string;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
    cost?: number;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
    timestamp: string;
  };
}

class BackendApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:3001', timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * APIリクエストを実行する共通メソッド
   */
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    config.signal = controller.signal;

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Backend API request failed: ${url}`, error);
      throw new Error(`バックエンドAPIリクエストが失敗しました: ${error}`);
    }
  }

  /**
   * サーバーのヘルスチェック
   */
  async healthCheck(): Promise<{ status: string; timestamp: string; service: string }> {
    return this.request('/health');
  }

  /**
   * Claude プロジェクトをスキャン
   */
  async scanClaudeProjects(projectPath?: string, includeStats: boolean = false): Promise<BackendProjectInfo[]> {
    const params = new URLSearchParams();
    if (projectPath) {
      params.append('projectPath', projectPath);
    }
    if (includeStats) {
      params.append('includeStats', 'true');
    }

    const queryString = params.toString();
    const endpoint = `/api/filesystem/scan-projects${queryString ? `?${queryString}` : ''}`;
    
    return this.request<BackendProjectInfo[]>(endpoint);
  }

  /**
   * 指定したプロジェクトのJSONLエントリを取得
   */
  async getProjectEntries(projectId: string): Promise<BackendLogEntry[]> {
    return this.request<BackendLogEntry[]>(`/api/filesystem/project/${projectId}/entries`);
  }

  /**
   * パスが有効かどうかを検証
   */
  async validatePath(path: string): Promise<{ isValid: boolean; message: string }> {
    return this.request<{ isValid: boolean; message: string }>('/api/filesystem/validate-path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  /**
   * ファイルシステム監視を開始
   */
  async startFileSystemWatch(path: string): Promise<{ message: string; path: string }> {
    return this.request<{ message: string; path: string }>('/api/filesystem/watch', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  /**
   * ファイルシステム監視を停止
   */
  async stopFileSystemWatch(): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/filesystem/watch', {
      method: 'DELETE',
    });
  }

  /**
   * バックエンドサーバーが利用可能かチェック
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ベースURLを更新
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * タイムアウト時間を更新
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }
}

// シングルトンインスタンス
export const backendApiClient = new BackendApiClient();

// フロントエンドの型とバックエンドの型の変換ユーティリティ
export const convertBackendToFrontendProject = (backendProject: BackendProjectInfo) => {
  return {
    ...backendProject,
    lastModified: new Date(backendProject.lastModified),
  };
};

export const convertBackendToFrontendLogEntry = (backendEntry: BackendLogEntry) => {
  return {
    ...backendEntry,
    // 必要に応じて型変換を行う
  };
};