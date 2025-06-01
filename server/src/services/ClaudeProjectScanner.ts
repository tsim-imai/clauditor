import { readdir, stat, access, constants } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { homedir } from 'os';
import { glob } from 'glob';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: string;
  content: any;
  metadata?: {
    model?: string;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
    cost?: number;
  };
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  files: string[];
  lastModified: Date;
  totalEntries: number;
}

export class ClaudeProjectScanner {
  private projectsCache = new Map<string, ProjectInfo>();
  private entriesCache = new Map<string, LogEntry[]>();

  async scanProjects(projectsPath: string = config.defaultClaudeProjectsPath): Promise<ProjectInfo[]> {
    try {
      let resolvedPath = projectsPath;
      if (resolvedPath.startsWith('~')) {
        resolvedPath = path.join(homedir(), resolvedPath.slice(1));
      }

      logger.info('Scanning for Claude projects', { path: resolvedPath });

      if (!(await this.validatePath(resolvedPath))) {
        logger.warn('Claude projects path does not exist', { path: resolvedPath });
        return [];
      }

      const pattern = path.join(resolvedPath, '**', '*.jsonl');
      const jsonlFiles = await glob(pattern, { 
        ignore: ['**/node_modules/**', '**/.*/**'],
        absolute: true 
      });

      logger.info(`Found ${jsonlFiles.length} JSONL files`);

      const projectsMap = new Map<string, ProjectInfo>();

      for (const filePath of jsonlFiles) {
        try {
          const projectDir = path.dirname(filePath);
          const projectName = path.basename(projectDir);
          const projectId = this.generateProjectId(projectDir);
          const fileStat = await stat(filePath);

          if (projectsMap.has(projectId)) {
            const project = projectsMap.get(projectId)!;
            project.files.push(filePath);
            if (fileStat.mtime > project.lastModified) {
              project.lastModified = fileStat.mtime;
            }
          } else {
            const project: ProjectInfo = {
              id: projectId,
              name: projectName,
              path: projectDir,
              files: [filePath],
              lastModified: fileStat.mtime,
              totalEntries: 0
            };
            projectsMap.set(projectId, project);
          }
        } catch (error) {
          logger.warn(`Failed to process file ${filePath}`, error);
        }
      }

      const projects = Array.from(projectsMap.values());
      
      this.projectsCache.clear();
      projects.forEach(project => {
        this.projectsCache.set(project.id, project);
      });

      logger.info(`Grouped into ${projects.length} projects`);
      return projects;

    } catch (error) {
      logger.error('Failed to scan Claude projects', error);
      throw new Error(`Project scan failed: ${error}`);
    }
  }

  async getProjectEntries(project: ProjectInfo): Promise<LogEntry[]> {
    const cacheKey = project.id;
    
    if (this.entriesCache.has(cacheKey)) {
      logger.debug('Returning cached entries', { projectId: project.id });
      return this.entriesCache.get(cacheKey)!;
    }

    try {
      logger.info('Loading project entries', { 
        projectId: project.id, 
        fileCount: project.files.length 
      });

      const allEntries: LogEntry[] = [];

      for (const filePath of project.files) {
        try {
          const entries = await this.parseJsonlFile(filePath);
          allEntries.push(...entries);
          logger.debug(`Loaded ${entries.length} entries from ${path.basename(filePath)}`);
        } catch (error) {
          logger.warn(`Failed to parse JSONL file: ${filePath}`, error);
        }
      }

      allEntries.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      this.entriesCache.set(cacheKey, allEntries);

      logger.info(`Loaded ${allEntries.length} total entries for project ${project.name}`);
      return allEntries;

    } catch (error) {
      logger.error('Failed to get project entries', error);
      throw new Error(`Failed to get project entries: ${error}`);
    }
  }

  async getProjectEntriesById(projectId: string): Promise<LogEntry[]> {
    const project = this.projectsCache.get(projectId);
    if (!project) {
      throw new Error(`Project ID ${projectId} not found`);
    }

    return this.getProjectEntries(project);
  }

  async validatePath(targetPath: string): Promise<boolean> {
    try {
      let resolvedPath = targetPath;
      if (resolvedPath.startsWith('~')) {
        resolvedPath = path.join(homedir(), resolvedPath.slice(1));
      }

      await access(resolvedPath, constants.R_OK);
      const pathStat = await stat(resolvedPath);
      return pathStat.isDirectory();
    } catch {
      return false;
    }
  }

  private async parseJsonlFile(filePath: string): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    
    try {
      const fileStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);
          
          const entry: LogEntry = {
            id: parsed.id || `${path.basename(filePath)}-${lineNumber}`,
            timestamp: parsed.timestamp || parsed.created_at || new Date().toISOString(),
            type: parsed.type || 'unknown',
            content: parsed.content || parsed,
            metadata: {
              model: parsed.model,
              tokenUsage: parsed.token_usage || parsed.tokenUsage,
              cost: parsed.cost
            }
          };

          entries.push(entry);
        } catch (parseError) {
          logger.warn(`Invalid JSON at line ${lineNumber} in ${filePath}`, parseError);
        }
      }

      logger.debug(`Parsed ${entries.length} entries from ${path.basename(filePath)}`);
      return entries;

    } catch (error) {
      logger.error(`Failed to parse JSONL file: ${filePath}`, error);
      throw error;
    }
  }

  private generateProjectId(projectPath: string): string {
    return Buffer.from(projectPath).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  clearCache(): void {
    this.projectsCache.clear();
    this.entriesCache.clear();
    logger.info('Scanner cache cleared');
  }
}