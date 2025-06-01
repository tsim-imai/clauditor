import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler.js';
import { logger } from '../utils/logger.js';

// Rate limiting in-memory store (本格運用ではRedisなどを使用)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * シンプルなレート制限ミドルウェア
 */
export const rateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    // 古いエントリをクリーンアップ
    for (const [ip, data] of rateLimitStore.entries()) {
      if (now > data.resetTime) {
        rateLimitStore.delete(ip);
      }
    }

    const clientData = rateLimitStore.get(clientIp);
    
    if (!clientData) {
      // 新しいクライアント
      rateLimitStore.set(clientIp, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (now > clientData.resetTime) {
      // ウィンドウリセット
      rateLimitStore.set(clientIp, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      // レート制限に到達
      logger.warn('Rate limit exceeded', { ip: clientIp, count: clientData.count });
      res.status(429).json({
        error: {
          message: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        }
      });
      return;
    }

    // カウントを増加
    clientData.count++;
    next();
  };
};

/**
 * パス検証ミドルウェア
 * 危険なパスアクセスを防ぐ
 */
export const validatePath = (req: Request, res: Response, next: NextFunction): void => {
  const { path: targetPath } = req.body;
  
  if (!targetPath) {
    next();
    return;
  }

  // 危険なパターンをチェック
  const dangerousPatterns = [
    /\.\./,          // ディレクトリトラバーサル
    /\/etc\//,       // システム設定ディレクトリ
    /\/var\/log\//,  // ログディレクトリ
    /\/proc\//,      // プロセス情報
    /\/sys\//,       // システム情報
    /\/dev\//,       // デバイスファイル
    /\/root\//,      // rootディレクトリ
    /\/usr\/bin\//,  // 実行ファイル
    /\/bin\//,       // 実行ファイル
    /\/sbin\//,      // システム実行ファイル
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(targetPath)) {
      logger.warn('Dangerous path access attempt', { 
        path: targetPath, 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next(createError('アクセスが拒否されました', 403, 'ACCESS_DENIED'));
      return;
    }
  }

  next();
};

/**
 * セキュリティヘッダーを設定
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // XSS防止
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // HTTPS強制（本番環境で有効）
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CSP設定（API サーバーなので基本的なもの）
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  next();
};

/**
 * リクエストログミドルウェア
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request processed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });

  next();
};