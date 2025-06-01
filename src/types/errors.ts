export enum ErrorType {
  FILE_SYSTEM_ACCESS = 'FILE_SYSTEM_ACCESS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_DATA = 'INVALID_DATA',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  timestamp: Date;
  context?: Record<string, any>;
}

export class ClauditorError extends Error {
  public readonly type: ErrorType;
  public readonly details?: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(type: ErrorType, message: string, details?: string, context?: Record<string, any>) {
    super(message);
    this.name = 'ClauditorError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date();
    this.context = context;
  }

  toJSON(): AppError {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

// Error classification helpers
export const classifyError = (error: unknown): ClauditorError => {
  if (error instanceof ClauditorError) {
    return error;
  }

  if (error instanceof Error) {
    // File system errors
    if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
      return new ClauditorError(ErrorType.FILE_NOT_FOUND, error.message);
    }
    
    if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
      return new ClauditorError(ErrorType.PERMISSION_DENIED, error.message);
    }

    if (error.message.includes('JSON') || error.message.includes('parse')) {
      return new ClauditorError(ErrorType.JSON_PARSE_ERROR, error.message);
    }

    // Network-related errors (for future use)
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return new ClauditorError(ErrorType.NETWORK_ERROR, error.message);
    }

    return new ClauditorError(ErrorType.UNKNOWN_ERROR, error.message);
  }

  return new ClauditorError(
    ErrorType.UNKNOWN_ERROR,
    typeof error === 'string' ? error : 'An unknown error occurred'
  );
};

// User-friendly error messages in Japanese
export const getErrorMessage = (error: AppError): string => {
  switch (error.type) {
    case ErrorType.FILE_SYSTEM_ACCESS:
      return 'ファイルシステムへのアクセスに失敗しました。アプリケーションを再起動してください。';
    
    case ErrorType.PERMISSION_DENIED:
      return 'ファイルアクセス権限がありません。Clauditorにファイルアクセス権限を付与してください。';
    
    case ErrorType.FILE_NOT_FOUND:
      return 'Claude プロジェクトディレクトリまたはログファイルが見つかりません。Claude Code を使用してプロジェクトを作成してください。';
    
    case ErrorType.JSON_PARSE_ERROR:
      return 'ログファイルの形式が正しくありません。ファイルが破損している可能性があります。';
    
    case ErrorType.INVALID_DATA:
      return 'データの形式が無効です。ログファイルの内容を確認してください。';
    
    case ErrorType.NETWORK_ERROR:
      return 'ネットワークエラーが発生しました。接続を確認してください。';
    
    case ErrorType.UNKNOWN_ERROR:
    default:
      return `予期しないエラーが発生しました: ${error.message}`;
  }
};