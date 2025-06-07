import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { createReadStream, existsSync, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
// import Database from 'duckdb'; // 一時的に無効化
// Type definitions
interface ProjectInfo {
  name: string;
  path: string;
  hasLogs: boolean;
}

interface LogEntry {
  timestamp: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  costUSD?: number;
}

// より確実な開発環境判定: app.isPackaged を使用
const isDev = !app.isPackaged;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 起動時ログ
console.log('Clauditor starting...');
console.log('isDev:', isDev);
console.log('app.isPackaged:', app.isPackaged);
console.log('__dirname:', __dirname);

let mainWindow: BrowserWindow | null = null;
let fileWatcher: chokidar.FSWatcher | null = null;
let duckDB: any | null = null; // 一時的に型を変更

// Simple cache for file contents and metadata
interface CacheEntry {
  data: any;
  timestamp: number;
  fileModTime: number;
  checksum: string;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// DuckDB initialization (一時的に無効化)
const initializeDuckDB = (): Promise<any> => {
  return Promise.reject(new Error('DuckDB は現在無効化されています'));
};

// Execute DuckDB query via child_process (test.shアプローチ)
const executeDuckDBQuery = async (query: string): Promise<any[]> => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    console.log('🦆 Executing DuckDB query via CLI...');
    // JSON出力を強制するために-jsonフラグを使用
    const command = `duckdb -json -c "${query.replace(/"/g, '\\"')}"`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.warn('DuckDB Warning:', stderr);
    }
    
    // JSON出力をパース
    if (!stdout.trim()) {
      console.log('🦆 DuckDB CLI: 空の結果');
      return [];
    }
    
    try {
      // DuckDBの-jsonオプションは配列形式で出力される
      // 改行で分割された不完全なJSONを結合
      const fullJsonString = stdout.trim();
      console.log(`🦆 Debug: Full JSON string length: ${fullJsonString.length}`);
      console.log(`🦆 Debug: First 200 chars: "${fullJsonString.substring(0, 200)}"`);
      
      const data = JSON.parse(fullJsonString);
      
      // 配列でない場合は配列に変換
      const resultArray = Array.isArray(data) ? data : [data];
      
      console.log(`🦆 DuckDB CLI query completed: ${resultArray.length} rows returned`);
      return resultArray;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw stdout length:', stdout.length);
      console.log('Raw stdout (first 500 chars):', stdout.substring(0, 500));
      return [];
    }
    
  } catch (error) {
    console.error('DuckDB CLI Error:', error);
    throw new Error(`DuckDB CLI実行に失敗しました: ${error.message}`);
  }
};

// Generate simple checksum for cache validation
const generateChecksum = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

// Check if cache entry is valid
const isCacheValid = (entry: CacheEntry, fileModTime: number): boolean => {
  const now = Date.now();
  const isNotExpired = (now - entry.timestamp) < CACHE_TTL;
  const isFileUnchanged = entry.fileModTime === fileModTime;
  return isNotExpired && isFileUnchanged;
};

// Get from cache
const getFromCache = <T>(key: string, fileModTime: number): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (!isCacheValid(entry, fileModTime)) {
    cache.delete(key);
    return null;
  }
  
  console.log(`Cache hit: ${key}`);
  return entry.data as T;
};

// Set to cache
const setToCache = <T>(key: string, data: T, fileModTime: number): void => {
  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
    fileModTime,
    checksum: generateChecksum(data),
  };
  
  cache.set(key, entry);
  console.log(`Cache set: ${key} (size: ${JSON.stringify(data).length} bytes)`);
  
  // Clean up old entries (simple LRU)
  if (cache.size > 50) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
};

// Clear cache for specific patterns
const clearCachePattern = (pattern: string): void => {
  const keysToDelete: string[] = [];
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => cache.delete(key));
  console.log(`Cache cleared for pattern: ${pattern} (${keysToDelete.length} entries)`);
};

// Memory-efficient processing of large JSONL files
const processLargeJsonlFile = async (filePath: string, allEntries: LogEntry[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity, // Handle Windows line endings
    });

    let lineCount = 0;
    let processedCount = 0;
    let errorCount = 0;

    rl.on('line', (line) => {
      lineCount++;
      
      // Skip empty lines
      if (!line.trim()) return;

      try {
        const entry = JSON.parse(line) as LogEntry;
        // Include all entries with timestamp or type for comprehensive message tracking
        if (entry.timestamp || entry.type) {
          allEntries.push(entry);
          processedCount++;
        }
      } catch (parseError) {
        errorCount++;
        if (errorCount <= 10) { // Limit error logging to avoid spam
          console.warn(`Failed to parse line ${lineCount} in ${path.basename(filePath)}:`, parseError);
        }
      }

      // Log progress for very large files (every 10k lines)
      if (lineCount % 10000 === 0) {
        console.log(`Processed ${lineCount} lines, ${processedCount} valid entries from ${path.basename(filePath)}`);
      }
    });

    rl.on('close', () => {
      console.log(`Completed processing ${path.basename(filePath)}: ${processedCount} entries from ${lineCount} lines (${errorCount} errors)`);
      resolve();
    });

    rl.on('error', (error) => {
      console.error(`Error reading file ${filePath}:`, error);
      reject(error);
    });
  });
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default', // macOS default title bar for dragging
    title: 'Clauditor - Claude Code 使用状況ダッシュボード',
    show: false, // Don't show until ready
  });

  // Load the app
  const htmlPath = isDev 
    ? path.join(__dirname, '../public/index.html')
    : path.join(__dirname, '../dist/index.html');
    
  console.log('Loading HTML from:', htmlPath);
  console.log('isDev:', isDev);
  console.log('app.isPackaged:', app.isPackaged);
  console.log('__dirname:', __dirname);
  
  mainWindow.loadFile(htmlPath);
  
  // 開発時のみDevToolsを自動で開く
  if (isDev) {
    // DevToolsを別ウィンドウで開く
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    const bounds = mainWindow?.getBounds();
    console.log('Window ready, size:', bounds?.width, 'x', bounds?.height);
    console.log('Window resizable:', mainWindow?.isResizable());
  });

  mainWindow.on('closed', () => {
    stopFileWatcher();
    mainWindow = null;
  });
};

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for file system access
ipcMain.handle('scan-claude-projects', async (): Promise<ProjectInfo[]> => {
  try {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const cacheKey = 'projects:list';
    
    // Check if directory exists
    let dirStat: any;
    try {
      dirStat = await fs.stat(projectsDir);
    } catch {
      console.log('Claude projects directory not found:', projectsDir);
      return [];
    }

    // Check cache first
    const cached = getFromCache<ProjectInfo[]>(cacheKey, dirStat.mtimeMs);
    if (cached) {
      return cached;
    }

    console.log('Scanning Claude projects directory...');
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(projectsDir, entry.name);
        const stat = await fs.stat(projectPath);
        
        // Find JSONL files in the project directory
        const files = await fs.readdir(projectPath);
        const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

        projects.push({
          name: entry.name,
          path: projectPath,
          logFiles: jsonlFiles,
          lastModified: stat.mtime,
        });
      }
    }

    const sortedProjects = projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    
    // Cache the results
    setToCache(cacheKey, sortedProjects, dirStat.mtimeMs);
    
    return sortedProjects;
  } catch (error) {
    console.error('Failed to scan Claude projects:', error);
    throw new Error(`Failed to scan projects: ${error}`);
  }
});

ipcMain.handle('read-project-logs', async (_, projectPath: string): Promise<LogEntry[]> => {
  try {
    const cacheKey = `logs:${projectPath}`;
    
    // Get the most recent modification time from all JSONL files
    const files = await fs.readdir(projectPath);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      console.log(`No JSONL files found in ${path.basename(projectPath)}`);
      return [];
    }

    // Find the most recent modification time among all JSONL files
    let latestModTime = 0;
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = path.join(projectPath, file);
        const stats = await fs.stat(filePath);
        latestModTime = Math.max(latestModTime, stats.mtimeMs);
        return { file, filePath, size: stats.size, modTime: stats.mtimeMs };
      })
    );

    // Check cache first
    const cached = getFromCache<LogEntry[]>(cacheKey, latestModTime);
    if (cached) {
      return cached;
    }

    console.log(`Processing ${filesWithStats.length} JSONL files in ${path.basename(projectPath)}`);
    const allEntries: LogEntry[] = [];
    
    const sortedFiles = filesWithStats.sort((a, b) => b.size - a.size);

    // Process files with memory-efficient streaming for large files
    for (const { file, filePath, size } of sortedFiles) {
      // For large files (>10MB), use streaming approach
      if (size > 10 * 1024 * 1024) {
        console.log(`Processing large file with streaming: ${file} (${Math.round(size / 1024 / 1024)}MB)`);
        await processLargeJsonlFile(filePath, allEntries);
      } else {
        // For smaller files, use regular approach (faster for small files)
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as LogEntry;
            // Include all entries with timestamp or type for comprehensive message tracking
            if (entry.timestamp || entry.type) {
              allEntries.push(entry);
            }
          } catch (parseError) {
            console.warn(`Failed to parse line in ${file}:`, line, parseError);
          }
        }
      }
    }

    const sortedEntries = allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Cache the results
    setToCache(cacheKey, sortedEntries, latestModTime);
    
    console.log(`Loaded ${sortedEntries.length} total log entries from ${path.basename(projectPath)}`);
    return sortedEntries;
  } catch (error) {
    console.error('Failed to read project logs:', error);
    throw new Error(`Failed to read logs: ${error}`);
  }
});

// Get app version
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// File system watching
const startFileWatcher = () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  
  console.log('🔍 Starting file watcher for:', projectsDir);
  console.log('🔍 Home directory:', os.homedir());
  console.log('🔍 Full projects path:', projectsDir);
  
  try {
    // Check if directory exists
    const dirExists = existsSync(projectsDir);
    console.log('🔍 Projects directory exists:', dirExists);
    
    if (!dirExists) {
      console.log('❌ Projects directory does not exist:', projectsDir);
      
      // Try to list what's in the .claude directory
      const claudeDir = path.join(os.homedir(), '.claude');
      console.log('🔍 Checking .claude directory:', claudeDir);
      try {
        const claudeDirExists = existsSync(claudeDir);
        console.log('🔍 .claude directory exists:', claudeDirExists);
        if (claudeDirExists) {
          const contents = readdirSync(claudeDir);
          console.log('🔍 .claude directory contents:', contents);
        }
      } catch (err) {
        console.log('❌ Error checking .claude directory:', err.message);
      }
      
      return false;
    }
    
    // Watch for changes in the projects directory and all subdirectories
    console.log('👀 Setting up Chokidar with aggressive polling...');
    fileWatcher = chokidar.watch(projectsDir, {
      ignored: /^\./, // Only ignore files starting with dot
      persistent: true,
      ignoreInitial: true, // !! CRITICAL: Skip initial scan to prevent startup flood
      depth: 99,
      usePolling: true, // Force polling mode
      interval: 5000, // Poll every 5 seconds (reduced frequency)
      binaryInterval: 5000,
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2 seconds after last change
        pollInterval: 500
      },
      followSymlinks: true,
      atomic: false, // Disable atomic writes detection
      alwaysStat: true, // Always get file stats
      ignorePermissionErrors: false
    });
    
    console.log('👀 Chokidar watcher configured for:', projectsDir);
    console.log('👀 Chokidar options:', {
      ignored: /^\./, 
      persistent: true,
      ignoreInitial: true, // FIXED: Skip initial scan
      depth: 99,
      usePolling: true,
      interval: 5000
    });

    fileWatcher
      .on('add', (filePath) => {
        console.log('📁 File added:', filePath);
        if (filePath.endsWith('.jsonl') && mainWindow) {
          console.log('✅ New JSONL file detected:', filePath);
          // Clear related cache
          clearCachePattern(path.dirname(filePath));
          clearCachePattern('projects:list');
          
          console.log('📡 Sending file-system-change event (add)');
          mainWindow.webContents.send('file-system-change', {
            type: 'file-added',
            path: filePath,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('📁 Non-JSONL file added (ignored):', filePath);
        }
      })
      .on('change', (filePath) => {
        console.log('📝 File changed:', filePath);
        if (filePath.endsWith('.jsonl') && mainWindow) {
          console.log('✅ JSONL file changed:', filePath);
          // Clear related cache
          clearCachePattern(path.dirname(filePath));
          
          console.log('📡 Sending file-system-change event (change)');
          mainWindow.webContents.send('file-system-change', {
            type: 'file-changed',
            path: filePath,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('📝 Non-JSONL file changed (ignored):', filePath);
        }
      })
      .on('raw', (event, path, details) => {
        // Only log JSONL file events to reduce noise
        if (path && path.endsWith('.jsonl')) {
          console.log('🔍 Raw JSONL event:', event, 'path:', path);
        }
      })
      .on('unlink', (filePath) => {
        if (filePath.endsWith('.jsonl') && mainWindow) {
          console.log('JSONL file removed:', filePath);
          // Clear related cache
          clearCachePattern(path.dirname(filePath));
          clearCachePattern('projects:list');
          
          mainWindow.webContents.send('file-system-change', {
            type: 'file-removed',
            path: filePath,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .on('addDir', (dirPath) => {
        // New project directory added
        if (mainWindow && dirPath !== projectsDir) {
          console.log('New project directory detected:', dirPath);
          // Clear project list cache
          clearCachePattern('projects:list');
          
          mainWindow.webContents.send('file-system-change', {
            type: 'project-added',
            path: dirPath,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .on('unlinkDir', (dirPath) => {
        // Project directory removed
        if (mainWindow && dirPath !== projectsDir) {
          console.log('Project directory removed:', dirPath);
          // Clear related cache
          clearCachePattern(dirPath);
          clearCachePattern('projects:list');
          
          mainWindow.webContents.send('file-system-change', {
            type: 'project-removed',
            path: dirPath,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .on('error', (error) => {
        console.error('❌ File watcher error:', error);
      })
      .on('ready', () => {
        console.log('✅ File watcher is ready and monitoring changes');
        console.log('👀 Watcher is now actively monitoring for file changes...');
        
        // List currently watched paths for debugging
        const watchedPaths = fileWatcher?.getWatched();
        if (watchedPaths) {
          console.log('👀 Currently watched directories:', Object.keys(watchedPaths));
        }
      });

    console.log('✅ File watcher started for:', projectsDir);
    
    // Verify the watcher was created successfully
    if (!fileWatcher) {
      console.error('❌ File watcher object is null after creation');
      return false;
    }
    
    console.log('✅ File watcher object created successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to start file watcher:', error);
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    return false;
  }
};

const stopFileWatcher = () => {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log('File watcher stopped');
  }
};

// Start file watcher when app is ready
ipcMain.handle('start-file-watcher', async () => {
  console.log('📡 IPC: start-file-watcher called');
  
  // Check if file watcher is already running
  if (fileWatcher) {
    console.log('⚠️ File watcher already exists, stopping previous instance');
    fileWatcher.close();
    fileWatcher = null;
  }
  
  const result = startFileWatcher();
  console.log('📡 IPC: start-file-watcher result:', result);
  
  // Additional debugging info
  console.log('📡 IPC: fileWatcher exists after start:', !!fileWatcher);
  
  return result;
});

// Stop file watcher
ipcMain.handle('stop-file-watcher', async () => {
  stopFileWatcher();
  return true;
});

// Get file watcher status
ipcMain.handle('get-file-watcher-status', async () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const dirExists = existsSync(projectsDir);
  
  return {
    isWatching: !!fileWatcher,
    projectsDir,
    dirExists,
    watcherReady: fileWatcher ? true : false
  };
});

// Execute DuckDB query
ipcMain.handle('execute-duckdb-query', async (event, query: string) => {
  try {
    console.log('🦆 Executing DuckDB query:', query.substring(0, 100) + '...');
    const result = await executeDuckDBQuery(query);
    console.log(`🦆 DuckDB query completed: ${result.length} rows returned`);
    return result;
  } catch (error) {
    console.error('🦆 DuckDB query failed:', error);
    throw error;
  }
});

// Test file watcher by creating a test file
ipcMain.handle('test-file-watcher', async () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const testDir = path.join(projectsDir, 'test-watcher');
  const testFile = path.join(testDir, 'test.jsonl');
  
  try {
    console.log('🧪 Testing file watcher by creating test file...');
    
    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      await fs.mkdir(testDir, { recursive: true });
      console.log('🧪 Created test directory:', testDir);
    }
    
    // Create a test JSONL file
    const testContent = JSON.stringify({
      timestamp: new Date().toISOString(),
      message: { usage: { input_tokens: 100, output_tokens: 200 } },
      costUSD: 0.01,
      test: true
    }) + '\n';
    
    await fs.writeFile(testFile, testContent);
    console.log('🧪 Created test file:', testFile);
    
    // Clean up after 5 seconds
    setTimeout(async () => {
      try {
        await fs.unlink(testFile);
        await fs.rmdir(testDir);
        console.log('🧪 Cleaned up test files');
      } catch (cleanupError) {
        console.log('🧪 Cleanup error (ignored):', cleanupError.message);
      }
    }, 5000);
    
    return { success: true, testFile };
  } catch (error) {
    console.error('🧪 Test file watcher error:', error);
    return { success: false, error: error.message };
  }
});

// Show directory dialog
ipcMain.handle('show-directory-dialog', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'プロジェクトディレクトリを選択',
    defaultPath: path.join(os.homedir(), '.claude', 'projects'),
  });
  
  return result.canceled ? null : result.filePaths[0];
});

// Validate project path
ipcMain.handle('validate-project-path', async (_, projectPath: string) => {
  try {
    const resolvedPath = path.resolve(projectPath.replace(/^~/, os.homedir()));
    await fs.access(resolvedPath);
    
    // Check if it's a directory
    const stat = await fs.stat(resolvedPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
});

// Fetch current exchange rate USD to JPY
ipcMain.handle('fetch-exchange-rate', async () => {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Return the JPY rate
    return {
      success: true,
      rate: data.rates.JPY,
      timestamp: Date.now(),
      source: 'exchangerate-api.com'
    };
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error);
    
    // Fallback API
    try {
      const fallbackResponse = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!fallbackResponse.ok) {
        throw new Error(`Fallback API error! status: ${fallbackResponse.status}`);
      }
      const fallbackData = await fallbackResponse.json();
      
      return {
        success: true,
        rate: fallbackData.rates.JPY,
        timestamp: Date.now(),
        source: 'open.er-api.com'
      };
    } catch (fallbackError) {
      console.error('Fallback API also failed:', fallbackError);
      return {
        success: false,
        error: 'Failed to fetch exchange rate from all sources',
        fallbackRate: 150 // デフォルト値
      };
    }
  }
});

// Mini window mode handlers
ipcMain.handle('set-mini-mode', async (_, enabled: boolean) => {
  if (!mainWindow) return false;
  
  if (enabled) {
    // Set mini mode: small size, always on top
    const currentBounds = mainWindow.getBounds();
    console.log('Before mini mode - Current size:', currentBounds);
    
    mainWindow.setResizable(true); // まずリサイズ可能にする
    
    // 最小サイズ制約を一時的に削除
    mainWindow.setMinimumSize(200, 150);
    
    // setBoundsでより確実にサイズを設定
    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: 420,
      height: 348
    }, true);
    
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setResizable(false);
    
    // サイズ設定を確認
    setTimeout(() => {
      console.log('After mini mode - Current size:', mainWindow?.getBounds());
    }, 100);
    
    console.log('Entering mini mode, setting size to 420x348');
  } else {
    // Set normal mode: normal size, not always on top
    console.log('Before normal mode - Current size:', mainWindow.getBounds());
    
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    
    // 最小サイズ制約を復元
    mainWindow.setMinimumSize(700, 600);
    
    // setBoundsでより確実にサイズを設定
    mainWindow.setBounds({
      width: 1400,
      height: 900
    }, true);
    
    mainWindow.center(); // ウィンドウを中央に配置
    
    // サイズ設定を確認
    setTimeout(() => {
      console.log('After normal mode - Current size:', mainWindow?.getBounds());
    }, 100);
    
    console.log('Exiting mini mode, setting size to 1400x900');
  }
  
  return true;
});

// Get current window state
ipcMain.handle('get-window-state', async () => {
  if (!mainWindow) return null;
  
  const bounds = mainWindow.getBounds();
  return {
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    width: bounds.width,
    height: bounds.height,
    isMiniMode: bounds.width <= 420
  };
});

// Handle app protocol for deep linking (optional)
if (isDev) {
  app.setAsDefaultProtocolClient('clauditor-dev');
} else {
  app.setAsDefaultProtocolClient('clauditor');
}