import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache } from '../../utils/cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({ ttl: 1000, maxSize: 3 });
  });

  it('should store and retrieve data', () => {
    const testData = { test: 'data' };
    cache.set('key1', testData);
    
    const retrieved = cache.get('key1');
    expect(retrieved).toEqual(testData);
  });

  it('should return null for non-existent keys', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should respect TTL and expire entries', async () => {
    const testData = { test: 'data' };
    cache.set('key1', testData);
    
    // Should exist immediately
    expect(cache.get('key1')).toEqual(testData);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should be expired
    expect(cache.get('key1')).toBeNull();
  });

  it('should evict LRU entries when max size is reached', () => {
    cache.set('key1', 'data1');
    cache.set('key2', 'data2');
    cache.set('key3', 'data3');
    
    // All should exist
    expect(cache.get('key1')).toBe('data1');
    expect(cache.get('key2')).toBe('data2');
    expect(cache.get('key3')).toBe('data3');
    
    // Add one more, should evict key1 (LRU)
    cache.set('key4', 'data4');
    
    expect(cache.get('key1')).toBeNull(); // Evicted
    expect(cache.get('key2')).toBe('data2');
    expect(cache.get('key3')).toBe('data3');
    expect(cache.get('key4')).toBe('data4');
  });

  it('should provide cache statistics', () => {
    cache.set('key1', 'data1');
    cache.set('key2', 'data2');
    
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.validEntries).toBe(2);
    expect(stats.maxSize).toBe(3);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'data1');
    cache.set('key2', 'data2');
    
    expect(cache.size()).toBe(2);
    
    cache.clear();
    
    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });
});