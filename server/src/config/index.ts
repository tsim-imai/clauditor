export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',
  env: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'],
  
  // Claude projects directory settings
  defaultClaudeProjectsPath: process.env.CLAUDE_PROJECTS_PATH || '~/.claude/projects',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default
  maxConcurrentFiles: parseInt(process.env.MAX_CONCURRENT_FILES || '10', 10),
  
  // Security settings
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMaxRequests: 100, // limit each IP to 100 requests per windowMs
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || 'combined'
} as const;