// Cache management utility for performance optimization

import { logger } from './logger';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  checksum: string;
  version: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  version?: string; // Cache version for invalidation
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 100;
const CACHE_VERSION = '1.0.0';

export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? DEFAULT_TTL,
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      version: options.version ?? CACHE_VERSION,
    };
  }

  private generateChecksum(data: any): string {
    // Simple checksum based on JSON stringification
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) > this.options.ttl;
  }

  private isValidVersion(entry: CacheEntry): boolean {
    return entry.version === this.options.version;
  }

  private evictLRU(): void {
    if (this.cache.size <= this.options.maxSize) return;

    // Find least recently used entry
    let lruKey: string | null = null;
    let lruAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < lruAccess) {
        lruAccess = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      logger.debug('Cache LRU eviction', { evictedKey: lruKey });
    }
  }

  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      checksum: this.generateChecksum(data),
      version: this.options.version,
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    this.evictLRU();

    logger.debug('Cache set', { key, dataSize: JSON.stringify(data).length });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    if (!this.isValidVersion(entry)) {
      this.delete(key);
      logger.debug('Cache version mismatch', { key, entryVersion: entry.version, currentVersion: this.options.version });
      return null;
    }

    if (this.isExpired(entry)) {
      this.delete(key);
      logger.debug('Cache expired', { key, age: Date.now() - entry.timestamp });
      return null;
    }

    // Update access order
    this.accessOrder.set(key, ++this.accessCounter);
    logger.debug('Cache hit', { key });
    
    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (!this.isValidVersion(entry) || this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    if (deleted) {
      logger.debug('Cache delete', { key });
    }
    return deleted;
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    logger.info('Cache cleared', { previousSize: size });
  }

  size(): number {
    return this.cache.size;
  }

  // Get cache statistics
  getStats() {
    const entries = Array.from(this.cache.entries());
    const expired = entries.filter(([, entry]) => this.isExpired(entry)).length;
    const valid = entries.length - expired;

    return {
      totalEntries: this.cache.size,
      validEntries: valid,
      expiredEntries: expired,
      maxSize: this.options.maxSize,
      ttl: this.options.ttl,
      version: this.options.version,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(([, e]) => e.timestamp)) : null,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(([, e]) => e.timestamp)) : null,
    };
  }

  // Clean up expired entries
  cleanup(): number {
    const sizeBefore = this.cache.size;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidVersion(entry) || this.isExpired(entry)) {
        this.delete(key);
      }
    }
    
    const cleaned = sizeBefore - this.cache.size;
    if (cleaned > 0) {
      logger.info('Cache cleanup completed', { entriesRemoved: cleaned });
    }
    
    return cleaned;
  }
}

// Export singleton instance
export const cache = new MemoryCache();

// Utility functions for common cache patterns
export const cacheKey = {
  project: (projectName: string) => `project:${projectName}`,
  projectLogs: (projectPath: string) => `logs:${projectPath}`,
  projectList: () => 'projects:list',
  dailyStats: (projectName: string, exchangeRate: number) => `stats:${projectName}:${exchangeRate}`,
};

// Auto-cleanup interval (every 5 minutes)
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);