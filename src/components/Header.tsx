import { Settings, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useState } from 'react';

export const Header = () => {
  const { settings, updateSettings } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);
  const [tempRate, setTempRate] = useState(settings.exchangeRate.toString());

  const handleSaveSettings = () => {
    const rate = parseFloat(tempRate);
    if (!isNaN(rate) && rate > 0) {
      updateSettings({ exchangeRate: rate });
      setShowSettings(false);
    }
  };

  const toggleDarkMode = () => {
    updateSettings({ darkMode: !settings.darkMode });
    if (!settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Clauditor
            </h1>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Claude Code 使用状況ダッシュボード
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {settings.darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              設定
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                為替レート (円/USD)
              </label>
              <input
                type="number"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="150"
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};