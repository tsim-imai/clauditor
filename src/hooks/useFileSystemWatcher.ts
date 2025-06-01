import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { scanClaudeProjects, readProjectLogs } from '../utils/electronFileSystem';
import { aggregateByDate } from '../utils/dataAggregator';
import { logger, time } from '../utils/logger';

// Check if we're running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const useFileSystemWatcher = () => {
  const { 
    selectedProject, 
    projects, 
    settings,
    setProjects, 
    setLogEntries, 
    setDailyStats, 
    setError,
    clearError
  } = useAppStore();

  // Refresh projects list
  const refreshProjects = useCallback(async () => {
    const endTimer = time('refreshProjects');
    try {
      clearError();
      logger.debug('Refreshing projects list');
      const projectList = await scanClaudeProjects();
      setProjects(projectList);
      logger.info('Projects refreshed successfully', { count: projectList.length });
    } catch (error: any) {
      logger.error('Failed to refresh projects', { error: error.message }, error);
      setError(error.toJSON ? error.toJSON() : {
        type: 'UNKNOWN_ERROR',
        message: error.message || 'プロジェクトの更新に失敗しました',
        timestamp: new Date(),
      });
    } finally {
      endTimer();
    }
  }, [setProjects, setError, clearError]);

  // Refresh current project data
  const refreshCurrentProject = useCallback(async () => {
    if (!selectedProject) return;

    const project = projects.find(p => p.name === selectedProject);
    if (!project) return;

    const endTimer = time(`refreshCurrentProject:${selectedProject}`);
    try {
      clearError();
      logger.debug('Refreshing current project data', { project: selectedProject, path: project.path });
      const entries = await readProjectLogs(project.path);
      const stats = aggregateByDate(entries, settings.exchangeRate);
      
      setLogEntries(entries);
      setDailyStats(stats);
      logger.info('Project data refreshed successfully', { 
        project: selectedProject, 
        entries: entries.length, 
        stats: stats.length 
      });
    } catch (error: any) {
      logger.error('Failed to refresh current project', { 
        project: selectedProject, 
        path: project.path,
        error: error.message 
      }, error);
      setError(error.toJSON ? error.toJSON() : {
        type: 'UNKNOWN_ERROR',
        message: error.message || 'プロジェクトデータの更新に失敗しました',
        timestamp: new Date(),
        context: { projectName: selectedProject, projectPath: project.path },
      });
    } finally {
      endTimer();
    }
  }, [selectedProject, projects, settings.exchangeRate, setLogEntries, setDailyStats, setError, clearError]);

  // Handle file system changes
  const handleFileSystemChange = useCallback(async (event: any) => {
    logger.info('File system change detected', { 
      type: event.type, 
      path: event.path, 
      selectedProject 
    });

    switch (event.type) {
      case 'project-added':
      case 'project-removed':
        logger.debug('Project directory change, refreshing project list');
        await refreshProjects();
        break;

      case 'file-added':
      case 'file-changed':
      case 'file-removed':
        // Check if the changed file belongs to the currently selected project
        if (selectedProject) {
          const project = projects.find(p => p.name === selectedProject);
          if (project && event.path.startsWith(project.path)) {
            logger.debug('File change affects current project, refreshing project data');
            await refreshCurrentProject();
          }
        }
        // Also refresh project list to update file counts and last modified dates
        await refreshProjects();
        break;

      default:
        logger.warn('Unknown file system change type', { type: event.type, path: event.path });
    }
  }, [selectedProject, projects, refreshProjects, refreshCurrentProject]);

  // Set up file system watcher
  useEffect(() => {
    if (!isElectron()) return;

    const setupWatcher = async () => {
      try {
        logger.debug('Setting up file system watcher');
        // Start file watcher
        await window.electronAPI.startFileWatcher();
        
        // Listen for changes
        window.electronAPI.onFileSystemChange(handleFileSystemChange);
        
        logger.info('File system watcher setup complete');
      } catch (error) {
        logger.error('Failed to setup file system watcher', { error }, error as Error);
      }
    };

    setupWatcher();

    // Cleanup function
    return () => {
      if (isElectron()) {
        window.electronAPI.removeFileSystemChangeListener();
        window.electronAPI.stopFileWatcher();
      }
    };
  }, [handleFileSystemChange]);

  return {
    refreshProjects,
    refreshCurrentProject,
    isElectron: isElectron(),
  };
};