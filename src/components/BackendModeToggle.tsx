import React from 'react';
import { Server, Laptop } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

/**
 * Electron版とバックエンドサービス版の切り替えコンポーネント
 */
export const BackendModeToggle: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const isBackendMode = settings.useBackendService;

  const toggleMode = () => {
    updateSettings({
      useBackendService: !isBackendMode
    });
  };

  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center space-x-2">
        <Laptop className={`w-5 h-5 ${!isBackendMode ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className={`text-sm font-medium ${!isBackendMode ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
          Electron
        </span>
      </div>
      
      <button
        onClick={toggleMode}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          isBackendMode ? 'bg-blue-600' : 'bg-gray-300'
        }`}
        role="switch"
        aria-checked={isBackendMode}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isBackendMode ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      
      <div className="flex items-center space-x-2">
        <Server className={`w-5 h-5 ${isBackendMode ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className={`text-sm font-medium ${isBackendMode ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
          バックエンド
        </span>
      </div>
      
      <div className="ml-4 text-xs text-gray-500 dark:text-gray-400">
        {isBackendMode ? (
          <span>サーバー経由でファイルアクセス</span>
        ) : (
          <span>ネイティブファイルアクセス</span>
        )}
      </div>
    </div>
  );
};