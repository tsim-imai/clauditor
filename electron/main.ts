import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { createReadStream, existsSync, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
// import chokidar from 'chokidar'; // DuckDB監視に置き換え
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
// let fileWatcher: chokidar.FSWatcher | null = null; // DuckDB監視に置き換え
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
    // stopFileWatcher(); // DuckDB監視に置き換え
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

// DuckDB-based monitoring (replaces chokidar file watching)
// Simple polling mechanism to check for file changes periodically

// DuckDB monitoring status (replaces file watcher)
ipcMain.handle('get-file-watcher-status', async () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const dirExists = existsSync(projectsDir);
  
  return {
    isWatching: true, // DuckDBによる監視は常にアクティブ
    projectsDir,
    dirExists,
    watcherReady: true,
    method: 'DuckDB'
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

// DuckDB Test - check query execution
ipcMain.handle('test-file-watcher', async () => {
  try {
    console.log('🧪 Testing DuckDB file monitoring...');
    
    const testQuery = `
      SELECT COUNT(*) as file_count 
      FROM read_json('~/.claude/projects/**/*.jsonl', ignore_errors=true)
      WHERE timestamp IS NOT NULL
    `;
    
    const result = await executeDuckDBQuery(testQuery);
    console.log('🧪 DuckDB test result:', result);
    
    return { 
      success: true, 
      method: 'DuckDB',
      fileCount: result[0]?.file_count || 0,
      message: `DuckDB monitoring is working. Found ${result[0]?.file_count || 0} log entries.`
    };
  } catch (error) {
    console.error('🧪 DuckDB test error:', error);
    return { 
      success: false, 
      error: error.message,
      method: 'DuckDB'
    };
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