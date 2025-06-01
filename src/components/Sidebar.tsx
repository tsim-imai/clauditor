import { Upload } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { parseJsonlFiles } from '../utils/jsonlParser';
import { aggregateByDate } from '../utils/dataAggregator';
import { useRef } from 'react';

export const Sidebar = () => {
  const { setLogEntries, setDailyStats, settings } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      const entries = await parseJsonlFiles(files);
      const stats = aggregateByDate(entries, settings.exchangeRate);
      
      setLogEntries(entries);
      setDailyStats(stats);
    } catch (error) {
      console.error('Failed to parse files:', error);
      alert('ファイルの解析に失敗しました。');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <aside className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            ファイルアップロード
          </h2>
          
          <div className="space-y-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <Upload size={20} className="mr-2 text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                JSONL ファイルを選択
              </span>
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jsonl"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <p className="text-xs text-gray-500 dark:text-gray-400">
              複数の .jsonl ファイルを選択できます
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            現在の設定
          </h3>
          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <div>為替レート: {settings.exchangeRate}円/USD</div>
          </div>
        </div>
      </div>
    </aside>
  );
};