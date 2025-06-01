import { Router, Request, Response, NextFunction } from 'express';
import { ClaudeProjectScanner } from '../services/ClaudeProjectScanner.js';
import { FileSystemWatcher } from '../services/FileSystemWatcher.js';
import { createError } from '../middleware/errorHandler.js';
import { validatePath } from '../middleware/security.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import path from 'path';
import { homedir } from 'os';

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  files: string[];
  lastModified: Date;
  totalEntries: number;
}

export interface ScanProjectsQuery {
  projectPath?: string;
  includeStats?: string;
}

export interface ValidatePathQuery {
  path: string;
}

let scanner: ClaudeProjectScanner | null = null;
let watcher: FileSystemWatcher | null = null;

const getScanner = (): ClaudeProjectScanner => {
  if (!scanner) {
    scanner = new ClaudeProjectScanner();
  }
  return scanner;
};

const getWatcher = (): FileSystemWatcher => {
  if (!watcher) {
    watcher = new FileSystemWatcher();
  }
  return watcher;
};

export const createFileSystemRouter = (): Router => {
  const router = Router();

  // GET /api/filesystem/scan-projects
  // ~/.claude/projects/**/*.jsonlをスキャンしてプロジェクト情報を取得
  router.get('/scan-projects', async (req: Request<{}, ProjectInfo[], {}, ScanProjectsQuery>, res: Response<ProjectInfo[]>, next: NextFunction) => {
    try {
      const { projectPath, includeStats } = req.query;
      
      // プロジェクトパスの解決（デフォルトは~/.claude/projects）
      let resolvedPath = projectPath || config.defaultClaudeProjectsPath;
      if (resolvedPath.startsWith('~')) {
        resolvedPath = path.join(homedir(), resolvedPath.slice(1));
      }

      logger.info('Scanning Claude projects', { path: resolvedPath });

      const projectScanner = getScanner();
      const projects = await projectScanner.scanProjects(resolvedPath);

      // 統計情報が必要な場合は追加データを取得
      if (includeStats === 'true') {
        for (const project of projects) {
          try {
            const entries = await projectScanner.getProjectEntries(project);
            project.totalEntries = entries.length;
          } catch (error) {
            logger.warn(`Failed to get stats for project ${project.name}`, error);
            project.totalEntries = 0;
          }
        }
      }

      logger.info(`Found ${projects.length} Claude projects`);
      res.json(projects);
    } catch (error) {
      logger.error('Failed to scan Claude projects', error);
      next(createError('プロジェクトスキャンに失敗しました', 500, 'SCAN_FAILED'));
    }
  });

  // GET /api/filesystem/project/:id/entries
  // 指定したプロジェクトのJSONLエントリを取得
  router.get('/project/:id/entries', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      logger.info('Getting project entries', { projectId: id });

      const projectScanner = getScanner();
      const entries = await projectScanner.getProjectEntriesById(id);

      logger.info(`Retrieved ${entries.length} entries for project ${id}`);
      res.json(entries);
    } catch (error) {
      logger.error('Failed to get project entries', error);
      next(createError('プロジェクトエントリの取得に失敗しました', 500, 'ENTRIES_FAILED'));
    }
  });

  // POST /api/filesystem/validate-path
  // 指定されたパスが有効かどうかを検証
  router.post('/validate-path', validatePath, async (req: Request<{}, { isValid: boolean; message: string }>, res: Response, next: NextFunction) => {
    try {
      const { path: targetPath } = req.body;

      if (!targetPath) {
        return next(createError('パスが指定されていません', 400, 'PATH_REQUIRED'));
      }

      logger.info('Validating path', { path: targetPath });

      const projectScanner = getScanner();
      const isValid = await projectScanner.validatePath(targetPath);

      const message = isValid ? 'パスが有効です' : 'パスが存在しないか、アクセスできません';
      
      res.json({ isValid, message });
    } catch (error) {
      logger.error('Failed to validate path', error);
      next(createError('パスの検証に失敗しました', 500, 'VALIDATION_FAILED'));
    }
  });

  // POST /api/filesystem/watch
  // ファイルシステムの変更監視を開始
  router.post('/watch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { path: watchPath } = req.body;

      if (!watchPath) {
        return next(createError('監視パスが指定されていません', 400, 'WATCH_PATH_REQUIRED'));
      }

      logger.info('Starting file system watch', { path: watchPath });

      const fileWatcher = getWatcher();
      await fileWatcher.startWatching(watchPath);

      res.json({ message: 'ファイルシステム監視を開始しました', path: watchPath });
    } catch (error) {
      logger.error('Failed to start file system watch', error);
      next(createError('ファイルシステム監視の開始に失敗しました', 500, 'WATCH_FAILED'));
    }
  });

  // DELETE /api/filesystem/watch
  // ファイルシステムの変更監視を停止
  router.delete('/watch', (req: Request, res: Response) => {
    try {
      logger.info('Stopping file system watch');

      const fileWatcher = getWatcher();
      fileWatcher.stopWatching();

      res.json({ message: 'ファイルシステム監視を停止しました' });
    } catch (error) {
      logger.error('Failed to stop file system watch', error);
      res.status(500).json({ error: 'ファイルシステム監視の停止に失敗しました' });
    }
  });

  return router;
};