import { useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DataTable } from './components/DataTable';
import { UsageChart } from './components/UsageChart';
import { useAppStore } from './stores/useAppStore';

function App() {
  const { settings } = useAppStore();

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      
      <div className="flex">
        <Sidebar />
        
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <UsageChart />
            <DataTable />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
