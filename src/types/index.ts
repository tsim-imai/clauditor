export interface LogEntry {
  timestamp: string;
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  costUSD: number;
}

export interface DailyStats {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costJPY: number;
}

export interface AppSettings {
  exchangeRate: number;
  darkMode: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  logFiles: string[];
  lastModified: Date;
}