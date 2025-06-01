import express from 'express';
import cors from 'cors';
import { createFileSystemRouter } from './routes/filesystem.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimit, securityHeaders, requestLogger, validatePath } from './middleware/security.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(requestLogger);
app.use(rateLimit(config.rateLimitWindowMs, config.rateLimitMaxRequests));

// CORS middleware
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/filesystem', createFileSystemRouter());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'clauditor-server'
  });
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(config.port, config.host, () => {
  logger.info(`Clauditor server running on http://${config.host}:${config.port}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`CORS origins: ${config.corsOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;