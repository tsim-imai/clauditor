import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DataTable } from './components/DataTable';
import { UsageChart } from './components/UsageChart';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorToast } from './components/ErrorToast';
import { LoadingSpinner } from './components/LoadingSpinner';
import { DebugPanel } from './components/DebugPanel';
import { useAppStore } from './stores/useAppStore';

function App() {
  const { settings, loading, selectedProject, logEntries } = useAppStore();

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header />
        
        <div className="flex">
          <Sidebar />
          
          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {loading && selectedProject && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
                  <LoadingSpinner 
                    size="large" 
                    message={`${selectedProject} のデータを読み込み中...`} 
                    className="py-8"
                  />
                </div>
              )}
              
              {!loading && selectedProject && logEntries.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    {selectedProject} にはログデータがありません
                  </p>
                </div>
              )}
              
              {!loading && selectedProject && logEntries.length > 0 && (
                <>
                  <UsageChart />
                  <DataTable />
                </>
              )}
              
              {!selectedProject && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    左側のサイドバーからプロジェクトを選択してください
                  </p>
                </div>
              )}
            </div>
          </main>
        </div>
        
        <ErrorToast />
        <DebugPanel />
      </div>
    </ErrorBoundary>
  );
}

export default App;
