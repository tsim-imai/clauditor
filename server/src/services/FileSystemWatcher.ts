import * as chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import path from 'path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: any;
  timestamp: Date;
}

export class FileSystemWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private watchedPath: string | null = null;

  /**
   * 指定されたパスでファイル監視を開始
   */
  async startWatching(watchPath: string): Promise<void> {
    try {
      // 既存の監視を停止
      if (this.watcher) {
        await this.stopWatching();
      }

      logger.info('Starting file system watcher', { path: watchPath });

      // JSONLファイルのみを監視するパターン
      const pattern = path.join(watchPath, '**', '*.jsonl');

      this.watcher = chokidar.watch(pattern, {
        ignored: [
          '**/node_modules/**',
          '**/.*/**', // 隠しディレクトリを無視
          '**/.git/**'
        ],
        persistent: true,
        ignoreInitial: false, // 初期スキャンを実行
        followSymlinks: false,
        depth: 10, // 最大10階層まで監視
        awaitWriteFinish: {
          stabilityThreshold: 1000, // 1秒間ファイルが安定するまで待機
          pollInterval: 100
        }
      });

      this.watchedPath = watchPath;

      // イベントリスナーを設定
      this.setupEventListeners();

      // watcher readyイベントを待つ
      await new Promise<void>((resolve, reject) => {
        this.watcher!.on('ready', () => {
          logger.info('File system watcher is ready', { path: watchPath });
          resolve();
        });

        this.watcher!.on('error', (error: any) => {
          logger.error('File system watcher error', error);
          reject(error);
        });

        // タイムアウト設定（30秒）
        setTimeout(() => {
          reject(new Error('File system watcher initialization timeout'));
        }, 30000);
      });

    } catch (error) {
      logger.error('Failed to start file system watcher', error);
      throw new Error(`ファイルシステム監視の開始に失敗しました: ${error}`);
    }
  }

  /**
   * ファイル監視を停止
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      logger.info('Stopping file system watcher', { path: this.watchedPath });
      
      try {
        await this.watcher.close();
        this.watcher = null;
        this.watchedPath = null;
        
        logger.info('File system watcher stopped');
      } catch (error) {
        logger.error('Error stopping file system watcher', error);
        throw error;
      }
    }
  }

  /**
   * 監視状態を取得
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * 監視中のパスを取得
   */
  getWatchedPath(): string | null {
    return this.watchedPath;
  }

  /**
   * イベントリスナーを設定
   */
  private setupEventListeners(): void {
    if (!this.watcher) return;

    // ファイル追加
    this.watcher.on('add', (filePath: any, stats: any) => {
      logger.debug('File added', { path: filePath });
      this.emitChangeEvent('add', filePath, stats);
    });

    // ファイル変更
    this.watcher.on('change', (filePath: any, stats: any) => {
      logger.debug('File changed', { path: filePath });
      this.emitChangeEvent('change', filePath, stats);
    });

    // ファイル削除
    this.watcher.on('unlink', (filePath: any) => {
      logger.debug('File removed', { path: filePath });
      this.emitChangeEvent('unlink', filePath);
    });

    // ディレクトリ追加
    this.watcher.on('addDir', (dirPath: any, stats: any) => {
      logger.debug('Directory added', { path: dirPath });
      this.emitChangeEvent('addDir', dirPath, stats);
    });

    // ディレクトリ削除
    this.watcher.on('unlinkDir', (dirPath: any) => {
      logger.debug('Directory removed', { path: dirPath });
      this.emitChangeEvent('unlinkDir', dirPath);
    });

    // エラーハンドリング
    this.watcher.on('error', (error: any) => {
      logger.error('File system watcher error', error);
      this.emit('error', error);
    });
  }

  /**
   * 変更イベントを発行
   */
  private emitChangeEvent(
    type: FileChangeEvent['type'], 
    filePath: string, 
    stats?: any
  ): void {
    const event: FileChangeEvent = {
      type,
      path: filePath,
      stats,
      timestamp: new Date()
    };

    this.emit('fileChange', event);
    this.emit(type, event);
  }

  /**
   * 監視対象のファイル数を取得
   */
  getWatchedFilesCount(): number {
    if (!this.watcher) return 0;
    return Object.keys(this.watcher.getWatched()).length;
  }
}