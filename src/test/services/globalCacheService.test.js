import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalCache, cacheStats } from '../../services/globalCacheService';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({
    exists: () => true,
    id: 'test-id',
    data: () => ({ name: 'Test Data' }),
  })),
  getDocs: vi.fn(() => Promise.resolve({
    docs: [
      {
        id: 'doc1',
        data: () => ({ name: 'Document 1' }),
      },
      {
        id: 'doc2',
        data: () => ({ name: 'Document 2' }),
      },
    ],
  })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

// Mock indexedDBCache
vi.mock('../../services/indexedDBCache', () => ({
  default: {
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
}));

describe('GlobalCacheService', () => {
  beforeEach(() => {
    // Clear cache and reset mocks
    globalCache.clearAll();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    globalCache.clearAll();
  });

  describe('Cache Key Generation', () => {
    it('should generate simple cache keys', () => {
      const key = globalCache.generateKey('user', { uid: '123' });
      expect(key).toBe('user_{"uid":"123"}');
    });

    it('should generate keys with sorted parameters', () => {
      const key1 = globalCache.generateKey('test', { b: 2, a: 1 });
      const key2 = globalCache.generateKey('test', { a: 1, b: 2 });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different types', () => {
      const key1 = globalCache.generateKey('user', { uid: '123' });
      const key2 = globalCache.generateKey('class', { uid: '123' });
      expect(key1).not.toBe(key2);
    });
  });

  describe('Cache Set and Get', () => {
    it('should store and retrieve data from memory cache', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test Data', value: 123 };

      globalCache.set(key, data);
      const retrieved = globalCache.get(key);

      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent keys', () => {
      const key = 'non-existent-key';
      const retrieved = globalCache.get(key);

      expect(retrieved).toBeNull();
    });

    it('should store data with custom TTL', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test' };
      const customTTL = 1000; // 1 second

      globalCache.set(key, data, customTTL);
      const retrieved = globalCache.get(key);

      expect(retrieved).toEqual(data);
    });

    it('should return null for expired cache entries', async () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test' };

      // Set with very short TTL
      globalCache.set(key, data, 1); // 1ms

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = globalCache.get(key);
      expect(retrieved).toBeNull();
    });

    it('should update existing cache entries', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data1 = { name: 'First' };
      const data2 = { name: 'Second' };

      globalCache.set(key, data1);
      globalCache.set(key, data2);

      const retrieved = globalCache.get(key);
      expect(retrieved).toEqual(data2);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate specific cache keys', () => {
      const key = globalCache.generateKey('user', { uid: '123' });
      const data = { name: 'Test User' };

      globalCache.set(key, data);
      expect(globalCache.get(key)).toEqual(data);

      globalCache.invalidate(key);
      expect(globalCache.get(key)).toBeNull();
    });

    it('should invalidate cache entries by pattern', () => {
      const key1 = globalCache.generateKey('user', { uid: '1' });
      const key2 = globalCache.generateKey('user', { uid: '2' });
      const key3 = globalCache.generateKey('class', { code: '1' });

      globalCache.set(key1, { name: 'User 1' });
      globalCache.set(key2, { name: 'User 2' });
      globalCache.set(key3, { name: 'Class 1' });

      globalCache.invalidatePattern('user');

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
      expect(globalCache.get(key3)).toEqual({ name: 'Class 1' });
    });

    it('should clear all cache entries', () => {
      const key1 = globalCache.generateKey('test1', {});
      const key2 = globalCache.generateKey('test2', {});

      globalCache.set(key1, { data: 1 });
      globalCache.set(key2, { data: 2 });

      globalCache.clearAll();

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
    });

    it('should clear user-specific data', () => {
      const userId = 'user123';
      const key1 = globalCache.generateKey('user', { uid: userId });
      const key2 = globalCache.generateKey('userItems', { userId });

      globalCache.set(key1, { name: 'User' });
      globalCache.set(key2, { items: [] });

      globalCache.clearUserData(userId);

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
    });

    it('should clear class-specific data', () => {
      const classCode = 'CLASS123';
      const key1 = globalCache.generateKey('classMembers', { classCode });
      const key2 = globalCache.generateKey('activityLogs', { classCode });

      globalCache.set(key1, { members: [] });
      globalCache.set(key2, { logs: [] });

      globalCache.clearClassData(classCode);

      expect(globalCache.get(key1)).toBeNull();
      expect(globalCache.get(key2)).toBeNull();
    });
  });

  describe('TTL Configuration', () => {
    it('should use correct default TTL', () => {
      expect(globalCache.DEFAULT_TTL).toBe(6 * 60 * 60 * 1000); // 6 hours
    });

    it('should use correct user TTL', () => {
      expect(globalCache.USER_TTL).toBe(12 * 60 * 60 * 1000); // 12 hours
    });

    it('should use correct activity log TTL', () => {
      expect(globalCache.ACTIVITY_LOG_TTL).toBe(2 * 60 * 60 * 1000); // 2 hours
    });

    it('should use correct items TTL', () => {
      expect(globalCache.ITEMS_TTL).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('should use correct class data TTL', () => {
      expect(globalCache.CLASS_DATA_TTL).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('should use correct settings TTL', () => {
      expect(globalCache.SETTINGS_TTL).toBe(48 * 60 * 60 * 1000); // 48 hours
    });
  });

  describe('Cache Statistics', () => {
    it('should return cache statistics', () => {
      const key1 = globalCache.generateKey('test1', {});
      const key2 = globalCache.generateKey('test2', {});

      globalCache.set(key1, { data: 1 });
      globalCache.set(key2, { data: 2 });

      const stats = globalCache.getStats();

      expect(stats.cacheSize).toBe(2);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.subscribers).toBe(0);
      expect(typeof stats.memoryUsage).toBe('number');
    });

    it('should track cache hits', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test' };

      // Reset stats
      cacheStats.hits = 0;
      cacheStats.misses = 0;

      globalCache.set(key, data);
      globalCache.get(key); // Hit

      expect(cacheStats.hits).toBeGreaterThan(0);
    });

    it('should track cache misses', () => {
      // Reset stats
      cacheStats.hits = 0;
      cacheStats.misses = 0;

      globalCache.get('non-existent-key'); // Miss

      expect(cacheStats.misses).toBeGreaterThan(0);
    });
  });

  describe('Async Operations', () => {
    it('should get data asynchronously', async () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test Data' };

      globalCache.set(key, data);
      const retrieved = await globalCache.getAsync(key);

      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent keys asynchronously', async () => {
      const retrieved = await globalCache.getAsync('non-existent-key');
      expect(retrieved).toBeNull();
    });
  });

  describe('Retry Logic', () => {
    it('should have retry configuration', () => {
      expect(globalCache.MAX_RETRIES).toBe(3);
      expect(globalCache.RETRY_DELAY).toBe(1000);
    });

    it('should retry failed operations', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Network error');
          error.code = 'unavailable';
          throw error;
        }
        return { success: true };
      });

      const result = await globalCache.retryWithBackoff(operation);

      expect(attempts).toBe(2);
      expect(result).toEqual({ success: true });
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn(async () => {
        const error = new Error('Network error');
        error.code = 'unavailable';
        throw error;
      });

      await expect(globalCache.retryWithBackoff(operation)).rejects.toThrow('Network error');
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('Pending Request Management', () => {
    it('should prevent duplicate concurrent requests', async () => {
      const key = 'test-key';
      let callCount = 0;

      const operation = async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { result: 'success' };
      };

      // Start two concurrent requests
      const promise1 = globalCache.executeOrWait(key, operation);
      const promise2 = globalCache.executeOrWait(key, operation);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Operation should only be called once
      expect(callCount).toBe(1);
      expect(result1).toEqual(result2);
    });

    it('should clean up pending requests after completion', async () => {
      const key = 'test-key';
      const operation = async () => ({ result: 'success' });

      await globalCache.executeOrWait(key, operation);

      const stats = globalCache.getStats();
      expect(stats.pendingRequests).toBe(0);
    });

    it('should clean up pending requests after error', async () => {
      const key = 'test-key';
      const operation = async () => {
        throw new Error('Test error');
      };

      await expect(globalCache.executeOrWait(key, operation)).rejects.toThrow('Test error');

      const stats = globalCache.getStats();
      expect(stats.pendingRequests).toBe(0);
    });
  });

  describe('LocalStorage Integration', () => {
    it('should save data to localStorage', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test Data' };

      globalCache.set(key, data);

      const lsKey = globalCache.localStoragePrefix + key;
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should invalidate localStorage entries', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test Data' };

      globalCache.set(key, data);
      globalCache.invalidate(key);

      const lsKey = globalCache.localStoragePrefix + key;
      expect(localStorage.removeItem).toHaveBeenCalled();
    });

    it('should handle localStorage quota exceeded errors', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const data = { name: 'Test Data' };

      // Mock localStorage to throw quota exceeded error
      localStorage.setItem.mockImplementationOnce(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      // Should not throw, should handle gracefully
      expect(() => globalCache.set(key, data)).not.toThrow();
    });
  });

  describe('Subscribe/Unsubscribe', () => {
    it('should allow subscribing to cache updates', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const callback = vi.fn();

      const unsubscribe = globalCache.subscribe(key, callback);

      globalCache.set(key, { name: 'Test' });

      expect(callback).toHaveBeenCalledWith({ name: 'Test' });
      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing from cache updates', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const callback = vi.fn();

      const unsubscribe = globalCache.subscribe(key, callback);

      globalCache.set(key, { name: 'First' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      globalCache.set(key, { name: 'Second' });
      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should notify multiple subscribers', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      globalCache.subscribe(key, callback1);
      globalCache.subscribe(key, callback2);

      globalCache.set(key, { name: 'Test' });

      expect(callback1).toHaveBeenCalledWith({ name: 'Test' });
      expect(callback2).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('should handle subscriber callback errors gracefully', () => {
      const key = globalCache.generateKey('test', { id: '1' });
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      globalCache.subscribe(key, errorCallback);

      // Should not throw when callback errors
      expect(() => globalCache.set(key, { name: 'Test' })).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    it('should have localStorage prefix configured', () => {
      expect(globalCache.localStoragePrefix).toBe('gc_');
    });

    it('should enable localStorage usage', () => {
      expect(globalCache.useLocalStorage).toBe(true);
    });

    it('should clean up old localStorage items when quota exceeded', () => {
      const cleanupSpy = vi.spyOn(globalCache, 'cleanupOldestLocalStorageItems');

      // Mock localStorage to throw quota error
      localStorage.setItem.mockImplementationOnce(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const key = globalCache.generateKey('test', { id: '1' });
      globalCache.set(key, { name: 'Test' });

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });
});
