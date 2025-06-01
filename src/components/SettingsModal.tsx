import { useState, useEffect } from 'react';
import { X, Folder, AlertTriangle, Check } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { validateProjectPath } from '../utils/hybridFileSystem';
import { BackendModeToggle } from './BackendModeToggle';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const { settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [customPath, setCustomPath] = useState('');
  const [pathValidation, setPathValidation] = useState<{
    isValid: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
    setCustomPath(settings.customProjectPath || '');
  }, [settings, isOpen]);

  const validatePath = async (path: string) => {
    if (!path.trim()) {
      setPathValidation(null);
      return;
    }

    try {
      const isValid = await validateProjectPath(path, {
        useBackendService: localSettings.useBackendService,
        backendServiceUrl: localSettings.backendServiceUrl,
      });
      
      setPathValidation({
        isValid,
        message: isValid 
          ? 'パスが有効です' 
          : 'パスが存在しないか、アクセスできません'
      });
    } catch (error) {
      setPathValidation({
        isValid: false,
        message: 'パスの検証に失敗しました'
      });
    }
  };

  const handlePathChange = (value: string) => {
    setCustomPath(value);
    setLocalSettings(prev => ({
      ...prev,
      customProjectPath: value
    }));
    
    // Debounce validation
    const timeoutId = setTimeout(() => validatePath(value), 500);
    return () => clearTimeout(timeoutId);
  };

  const handleBrowseFolder = async () => {
    if (!window.electronAPI?.showDirectoryDialog) return;
    
    try {
      const selectedPath = await window.electronAPI.showDirectoryDialog();
      if (selectedPath) {
        setCustomPath(selectedPath);
        setLocalSettings(prev => ({
          ...prev,
          customProjectPath: selectedPath
        }));
        validatePath(selectedPath);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const handleSave = () => {
    setSettings(localSettings);
    onClose();
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    setCustomPath(settings.customProjectPath || '');
    setPathValidation(null);
    onClose();
  };

  const resetToDefault = () => {
    setCustomPath('');
    setLocalSettings(prev => ({
      ...prev,
      customProjectPath: ''
    }));
    setPathValidation(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            設定
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Backend Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              ファイルアクセス方式
            </label>
            <BackendModeToggle />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Electronモード: ネイティブファイルアクセス（推奨）<br />
              バックエンドモード: サーバー経由でファイルアクセス
            </p>
          </div>

          {/* Backend Service URL (only when backend mode is enabled) */}
          {localSettings.useBackendService && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                バックエンドサービスURL
              </label>
              <input
                type="url"
                value={localSettings.backendServiceUrl}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  backendServiceUrl: e.target.value
                }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="http://localhost:3001"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                バックエンドサーバーのベースURL
              </p>
            </div>
          )}

          {/* Exchange Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              為替レート（円/USD）
            </label>
            <input
              type="number"
              value={localSettings.exchangeRate}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                exchangeRate: Number(e.target.value) || 150
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              min="1"
              step="0.1"
            />
          </div>

          {/* Dark Mode */}
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={localSettings.darkMode}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  darkMode: e.target.checked
                }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ダークモード
              </span>
            </label>
          </div>

          {/* Custom Project Path */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              プロジェクトディレクトリ
            </label>
            <div className="space-y-2">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  placeholder="~/.claude/projects （デフォルト）"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <button
                  onClick={handleBrowseFolder}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  title="フォルダを選択"
                >
                  <Folder size={16} />
                </button>
              </div>
              
              {pathValidation && (
                <div className={`flex items-center space-x-2 text-sm ${
                  pathValidation.isValid 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {pathValidation.isValid ? <Check size={16} /> : <AlertTriangle size={16} />}
                  <span>{pathValidation.message}</span>
                </div>
              )}
              
              <div className="text-xs text-gray-500 dark:text-gray-400">
                空の場合はデフォルトパス（~/.claude/projects）を使用します
              </div>
              
              {customPath && (
                <button
                  onClick={resetToDefault}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  デフォルトに戻す
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};