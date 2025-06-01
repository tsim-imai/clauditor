import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('API Error occurred', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  const code = error.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    error: {
      message,
      code,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  });
};

export const createError = (message: string, statusCode: number = 500, code?: string): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
};