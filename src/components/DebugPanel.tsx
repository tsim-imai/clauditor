import { useState, useEffect } from 'react';
import { Bug, X, Download, Trash2 } from 'lucide-react';
import { logger, LogLevel } from '../utils/logger';

export const DebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logLevel, setLogLevel] = useState<LogLevel>(LogLevel.INFO);

  // Only show in development mode
  if (!import.meta.env.DEV) {
    return null;
  }

  useEffect(() => {
    if (isOpen) {
      // Refresh logs when panel opens
      setLogs(logger.getRecentLogs(100));
      
      // Set up interval to refresh logs
      const interval = setInterval(() => {
        setLogs(logger.getRecentLogs(100));
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleExportLogs = () => {
    const logsJson = logger.exportLogs();
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clauditor-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    logger.clear();
    setLogs([]);
  };

  const handleLogLevelChange = (level: LogLevel) => {
    setLogLevel(level);
    logger.setLevel(level);
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG:
        return 'text-gray-600 dark:text-gray-400';
      case LogLevel.INFO:
        return 'text-blue-600 dark:text-blue-400';
      case LogLevel.WARN:
        return 'text-yellow-600 dark:text-yellow-400';
      case LogLevel.ERROR:
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('ja-JP');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-full shadow-lg z-50 transition-colors"
        title="デバッグパネルを開く"
      >
        <Bug size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <Bug size={16} className="text-orange-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">デバッグログ</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X size={16} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center space-x-2">
          <label className="text-xs text-gray-600 dark:text-gray-400">レベル:</label>
          <select
            value={logLevel}
            onChange={(e) => handleLogLevelChange(Number(e.target.value) as LogLevel)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={LogLevel.DEBUG}>DEBUG</option>
            <option value={LogLevel.INFO}>INFO</option>
            <option value={LogLevel.WARN}>WARN</option>
            <option value={LogLevel.ERROR}>ERROR</option>
          </select>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleExportLogs}
            className="flex items-center space-x-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
          >
            <Download size={12} />
            <span>エクスポート</span>
          </button>
          <button
            onClick={handleClearLogs}
            className="flex items-center space-x-1 text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded"
          >
            <Trash2 size={12} />
            <span>クリア</span>
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
            ログがありません
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-gray-500 dark:text-gray-400">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`font-medium ${getLevelColor(log.level)}`}>
                  {Object.keys(LogLevel).find(key => LogLevel[key as keyof typeof LogLevel] === log.level) || 'UNKNOWN'}
                </span>
              </div>
              <div className="text-gray-900 dark:text-white mb-1">
                {log.message}
              </div>
              {log.context && (
                <div className="text-gray-600 dark:text-gray-400 font-mono">
                  {JSON.stringify(log.context, null, 2)}
                </div>
              )}
              {log.error && (
                <div className="text-red-600 dark:text-red-400 font-mono">
                  {log.error.stack || log.error.message}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};