import { Settings, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useState } from 'react';
import { SettingsModal } from './SettingsModal';

export const Header = () => {
  const { settings, updateSettings } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);

  const toggleDarkMode = () => {
    updateSettings({ darkMode: !settings.darkMode });
    // DOM操作はApp.tsxのuseEffectに任せる
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

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </header>
  );
};