// Enhanced logging utility for debugging and monitoring

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs
  private currentLevel: LogLevel = LogLevel.INFO;

  constructor() {
    // In development, enable debug logging
    if (import.meta.env.DEV) {
      this.currentLevel = LogLevel.DEBUG;
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      message,
      context,
      error,
    };

    // Add to internal log store
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Console output
    if (level >= this.currentLevel) {
      const levelName = Object.keys(LogLevel).find(key => LogLevel[key as keyof typeof LogLevel] === level) || 'UNKNOWN';
      const prefix = `[${timestamp}] [${levelName}]`;
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(prefix, message, context, error);
          break;
        case LogLevel.INFO:
          console.info(prefix, message, context);
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, context, error);
          break;
        case LogLevel.ERROR:
          console.error(prefix, message, context, error);
          break;
      }
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>, error?: Error) {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context?: Record<string, any>, error?: Error) {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Performance timing utility
  time(label: string): () => void {
    const start = performance.now();
    this.debug(`Timer started: ${label}`);
    
    return () => {
      const duration = performance.now() - start;
      this.debug(`Timer finished: ${label}`, { duration: `${duration.toFixed(2)}ms` });
    };
  }

  // Get recent logs for debugging
  getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Export logs for debugging
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Set log level
  setLevel(level: LogLevel) {
    this.currentLevel = level;
    this.info('Log level changed', { level: Object.keys(LogLevel).find(key => LogLevel[key as keyof typeof LogLevel] === level) || 'UNKNOWN' });
  }

  // Clear logs
  clear() {
    this.logs = [];
    this.info('Logs cleared');
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const time = logger.time.bind(logger);