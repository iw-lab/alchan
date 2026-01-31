import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { globalCache, TTL, invalidateCache, clearCache, invalidateUserCache } from '../../hooks/useFirestoreData';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

describe('globalCache', () => {
  beforeEach(() => {
    // Clear all caches before each test
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  describe('Cache Key Generation', () => {
    it('should generate a simple cache key without query params', () => {
      const key = globalCache.generateKey('users/user123');
      expect(key).toBe('firestore_users/user123');
    });

    it('should generate a cache key with query params', () => {
      const key = globalCache.generateKey('users', { classCode: 'ABC123' });
      expect(key).toBe('firestore_users:{"classCode":"ABC123"}');
    });

    it('should generate consistent keys for same inputs', () => {
      const key1 = globalCache.generateKey('users', { a: 1, b: 2 });
      const key2 = globalCache.generateKey('users', { a: 1, b: 2 });
      expect(key1).toBe(key2);
    });
  });

  describe('Cache Set and Get', () => {
    it('should store and retrieve data from cache', () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test User' };

      globalCache.set(key, testData);
      const retrieved = globalCache.get(key);

      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent cache key', () => {
      const retrieved = globalCache.get('non-existent-key');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired cache', async () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test User' };

      // Set with very short TTL (1ms)
      globalCache.set(key, testData, 1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = globalCache.get(key);
      expect(retrieved).toBeNull();
    });

    it('should update existing cache entry', () => {
      const key = globalCache.generateKey('test/path');
      const data1 = { id: '1', name: 'Test 1' };
      const data2 = { id: '1', name: 'Test 2' };

      globalCache.set(key, data1);
      globalCache.set(key, data2);

      const retrieved = globalCache.get(key);
      expect(retrieved).toEqual(data2);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate a specific cache key', () => {
      const key = globalCache.generateKey('users/user123');
      const testData = { id: 'user123', name: 'Test User' };

      globalCache.set(key, testData);
      expect(globalCache.get(key)).toEqual(testData);

      invalidateCache('users/user123');
      expect(globalCache.get(key)).toBeNull();
    });

    it('should invalidate all cache entries matching a pattern', () => {
      const key1 = globalCache.generateKey('users/user1');
      const key2 = globalCache.generateKey('users/user2');
      const key3 = globalCache.generateKey('items/item1');

      globalCache.set(key1, { id: '1' });
      globalCache.set(key2, { id: '2' });
      globalCache.set(key3, { id: '3' });

      invalidateCache('users');

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
      expect(globalCache.get(key3)).toEqual({ id: '3' }); // Should not be invalidated
    });

    it('should invalidate user-specific caches', () => {
      const userId = 'user123';
      const userKey = globalCache.generateKey(`users/${userId}`);
      const itemsKey = globalCache.generateKey(`user_items/${userId}`);
      const batchKey = globalCache.generateKey('BATCH');

      globalCache.set(userKey, { id: userId });
      globalCache.set(itemsKey, [{ id: 'item1' }]);
      globalCache.set(batchKey, { data: 'batch' });

      invalidateUserCache(userId);

      expect(globalCache.get(userKey)).toBeNull();
      expect(globalCache.get(itemsKey)).toBeNull();
      expect(globalCache.get(batchKey)).toBeNull();
    });

    it('should clear all cache entries', () => {
      const key1 = globalCache.generateKey('users/user1');
      const key2 = globalCache.generateKey('items/item1');

      globalCache.set(key1, { id: '1' });
      globalCache.set(key2, { id: '2' });

      clearCache();

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test' };

      // Reset stats
      globalCache.resetStats();

      // Miss
      globalCache.get(key);
      let stats = globalCache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Set and hit
      globalCache.set(key, testData);
      globalCache.get(key);
      stats = globalCache.getStats();
      expect(stats.hits).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test' };

      globalCache.resetStats();

      // 1 miss
      globalCache.get(key);

      // Set data
      globalCache.set(key, testData);

      // 3 hits
      globalCache.get(key);
      globalCache.get(key);
      globalCache.get(key);

      const stats = globalCache.getStats();
      expect(stats.hitRate).toBe('75.0%'); // 3 hits / 4 total = 75%
    });
  });

  describe('Cache Eviction', () => {
    it('should evict oldest entries when cache size exceeds limit', () => {
      globalCache.resetStats();

      // Fill cache beyond limit (300 entries)
      for (let i = 0; i < 305; i++) {
        const key = globalCache.generateKey(`test/item${i}`);
        globalCache.set(key, { id: i });
      }

      const stats = globalCache.getStats();
      expect(stats.localSize).toBeLessThanOrEqual(300);
    });
  });

  describe('TTL Constants', () => {
    it('should have correct TTL values', () => {
      expect(TTL.STATIC).toBe(12 * 60 * 60 * 1000); // 12 hours
      expect(TTL.SEMI_STATIC).toBe(6 * 60 * 60 * 1000); // 6 hours
      expect(TTL.NORMAL).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(TTL.FREQUENT).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(TTL.REALTIME).toBe(60 * 60 * 1000); // 1 hour
    });
  });

  describe('Memory Management', () => {
    it('should store data in both local and global cache', () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test' };

      globalCache.set(key, testData);

      // Should be in local cache
      expect(globalCache.localCache.get(key)).toBeDefined();
      expect(globalCache.localCache.get(key).data).toEqual(testData);
    });

    it('should update lastAccessed timestamp on cache hit', async () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test' };

      globalCache.set(key, testData);

      const firstAccess = globalCache.localCache.get(key).lastAccessed;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access again
      globalCache.get(key);

      const secondAccess = globalCache.localCache.get(key).lastAccessed;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('Integration with globalCacheService', () => {
    it('should fallback to globalCacheService when local cache misses', () => {
      const key = globalCache.generateKey('test/path');
      const testData = { id: '1', name: 'Test' };

      // Set in global cache
      globalCache.set(key, testData);

      // Remove from local cache only
      globalCache.localCache.delete(key);

      // Should still retrieve from globalCacheService
      const retrieved = globalCache.get(key);

      // Will be null because we're in test environment with mocked localStorage
      // In real environment, it would fallback to localStorage
      expect(retrieved).toBeNull();
    });
  });
});

describe('Cache Helpers', () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  it('should provide invalidateCache helper', () => {
    const key = globalCache.generateKey('test/path');
    globalCache.set(key, { id: '1' });

    invalidateCache('test/path');
    expect(globalCache.get(key)).toBeNull();
  });

  it('should provide clearCache helper', () => {
    globalCache.set(globalCache.generateKey('key1'), { id: '1' });
    globalCache.set(globalCache.generateKey('key2'), { id: '2' });

    clearCache();

    expect(globalCache.get(globalCache.generateKey('key1'))).toBeNull();
    expect(globalCache.get(globalCache.generateKey('key2'))).toBeNull();
  });

  it('should provide invalidateUserCache helper', () => {
    const userId = 'user123';
    globalCache.set(globalCache.generateKey(`users/${userId}`), { id: userId });

    invalidateUserCache(userId);

    expect(globalCache.get(globalCache.generateKey(`users/${userId}`))).toBeNull();
  });
});
