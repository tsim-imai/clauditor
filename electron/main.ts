import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { ProjectInfo, LogEntry } from '../src/types';

const isDev = process.env.NODE_ENV === 'development';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset', // macOS native title bar
    show: false, // Don't show until ready
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
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
    
    // Check if directory exists
    try {
      await fs.access(projectsDir);
    } catch {
      console.log('Claude projects directory not found:', projectsDir);
      return [];
    }

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

    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  } catch (error) {
    console.error('Failed to scan Claude projects:', error);
    throw new Error(`Failed to scan projects: ${error}`);
  }
});

ipcMain.handle('read-project-logs', async (_, projectPath: string): Promise<LogEntry[]> => {
  try {
    const files = await fs.readdir(projectPath);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    const allEntries: LogEntry[] = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry;
          if (entry.timestamp && entry.message?.usage && entry.costUSD !== undefined) {
            allEntries.push(entry);
          }
        } catch (parseError) {
          console.warn(`Failed to parse line in ${file}:`, line, parseError);
        }
      }
    }

    return allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch (error) {
    console.error('Failed to read project logs:', error);
    throw new Error(`Failed to read logs: ${error}`);
  }
});

// Get app version
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// Handle app protocol for deep linking (optional)
if (isDev) {
  app.setAsDefaultProtocolClient('clauditor-dev');
} else {
  app.setAsDefaultProtocolClient('clauditor');
}