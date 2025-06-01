import { Folder, FileText, Calendar } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { aggregateByDate } from '../utils/dataAggregator';
import { getMockProjects, readProjectLogs } from '../utils/claudeProjectScanner';
import { useEffect } from 'react';

export const Sidebar = () => {
  const { 
    projects, 
    selectedProject, 
    settings, 
    setProjects, 
    setSelectedProject, 
    setLogEntries, 
    setDailyStats 
  } = useAppStore();

  useEffect(() => {
    // Load projects on component mount
    const loadProjects = async () => {
      // For now, use mock data since we can't access file system directly in browser
      const projectList = getMockProjects();
      setProjects(projectList);
    };
    
    loadProjects();
  }, [setProjects]);

  const handleProjectSelect = async (projectName: string) => {
    setSelectedProject(projectName);
    
    const project = projects.find(p => p.name === projectName);
    if (!project) return;

    try {
      // In a real implementation, this would read the actual JSONL files
      const entries = await readProjectLogs(project.path);
      const stats = aggregateByDate(entries, settings.exchangeRate);
      
      setLogEntries(entries);
      setDailyStats(stats);
    } catch (error) {
      console.error('Failed to load project logs:', error);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <aside className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen overflow-y-auto">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Claude Projects
          </h2>
          
          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                <Folder size={48} className="mx-auto mb-2 opacity-50" />
                <p>プロジェクトが見つかりません</p>
                <p className="text-xs mt-1">
                  ~/.claude/projects/ を確認してください
                </p>
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.name}
                  onClick={() => handleProjectSelect(project.name)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedProject === project.name
                      ? 'bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Folder 
                      size={16} 
                      className={`mt-1 ${
                        selectedProject === project.name 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-400 dark:text-gray-500'
                      }`} 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {project.name}
                      </div>
                      <div className="flex items-center space-x-1 mt-1">
                        <FileText size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {project.logFiles.length} ファイル
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 mt-1">
                        <Calendar size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(project.lastModified)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            現在の設定
          </h3>
          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <div>為替レート: {settings.exchangeRate}円/USD</div>
            {selectedProject && (
              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  選択中: {selectedProject}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};