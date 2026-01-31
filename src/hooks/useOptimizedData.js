// src/hooks/useOptimizedData.js - 최적화된 데이터 로딩 Hook

import { useState, useEffect, useCallback, useRef } from 'react';
import { globalCache } from '../services/globalCacheService';

import { logger } from "../utils/logger";
export const useOptimizedUserDoc = (uid) => {
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchUserDoc = useCallback(async (forceRefresh = false) => {
    if (!uid) {
      setUserDoc(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userData = await globalCache.getUserDoc(uid, forceRefresh);

      if (mountedRef.current) {
        setUserDoc(userData);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        logger.error('사용자 문서 로딩 오류:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [uid]);

  useEffect(() => {
    fetchUserDoc();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchUserDoc]);

  const refresh = useCallback(() => {
    fetchUserDoc(true);
  }, [fetchUserDoc]);

  return { userDoc, loading, error, refresh };
};

export const useOptimizedClassMembers = (classCode) => {
  const [classMembers, setClassMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchClassMembers = useCallback(async (forceRefresh = false) => {
    if (!classCode || classCode === '미지정') {
      setClassMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const members = await globalCache.getClassMembers(classCode, forceRefresh);

      if (mountedRef.current) {
        setClassMembers(members);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        logger.error('학급 구성원 로딩 오류:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [classCode]);

  useEffect(() => {
    fetchClassMembers();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchClassMembers]);

  const refresh = useCallback(() => {
    fetchClassMembers(true);
  }, [fetchClassMembers]);

  return { classMembers, loading, error, refresh };
};

export const useOptimizedActivityLogs = (classCode, filters = {}) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);

  const fetchLogs = useCallback(async (currentFilters, forceRefresh = false) => {
    if (!classCode || classCode === '미지정') {
      setLogs([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    try {
      const { logs: fetchedLogs, lastVisible: newLastVisible } = await globalCache.getActivityLogs(classCode, { ...currentFilters, limit: 20 }, forceRefresh);

      if (!abortController.signal.aborted && mountedRef.current) {
        setLogs(fetchedLogs || []);
        setLastVisible(newLastVisible || null);
        setHasMore((fetchedLogs || []).length === 20);
        setLoading(false);
      }
    } catch (err) {
      if (!abortController.signal.aborted && mountedRef.current) {
        setError(err);
        setLogs([]);
        setLoading(false);
      }
    }
  }, [classCode]);

  const fetchMore = useCallback(async () => {
    if (!hasMore || loading) return;

    setLoading(true);
    try {
      const { logs: newLogs, lastVisible: newLastVisible } = await globalCache.getActivityLogs(classCode, { ...filters, limit: 20, lastVisible });
      setLogs(prevLogs => [...prevLogs, ...newLogs]);
      setLastVisible(newLastVisible || null);
      setHasMore(newLogs.length === 20);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [classCode, filters, hasMore, loading, lastVisible]);


  // 🔥 [최적화] JSON.stringify를 useMemo로 감싸서 무한 루프 방지
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    mountedRef.current = true;
    fetchLogs(filters);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCode, filterKey, fetchLogs]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setLastVisible(null);
    fetchLogs(filters, true);
  }, [fetchLogs, filters]);

  return { logs, loading, error, refresh, fetchMore, hasMore };
};

export const useStatistics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const statsDoc = await globalCache.getDoc('system_stats', 'activity_summary');
      if (statsDoc) {
        setStats(statsDoc);
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const unsubscribe = globalCache.subscribe("system_stats_activity_summary", setStats);
    return unsubscribe;
  }, [fetchStats]);

  const refresh = useCallback(() => {
    fetchStats(true);
  }, [fetchStats]);

  return { stats, loading, error, refresh };
};

export const useOptimizedItems = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      const items = await globalCache.getItems(forceRefresh);
      setItems(items || []);
      setError(null);
    } catch (err) {
      setError(err);
      logger.error('[useOptimizedItems] 아이템 로딩 오류:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const refresh = useCallback(() => {
    logger.log('[useOptimizedItems] 수동 새로고침 실행');
    fetchItems(true);
  }, [fetchItems]);

  return { items, setItems, loading, error, refresh };
};

export const useOptimizedUserItems = (userId) => {
  const [userItems, setUserItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUserItems = useCallback(async (forceRefresh = false) => {
    if (!userId) {
      setUserItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const items = await globalCache.getUserItems(userId, forceRefresh);
      setUserItems(items || []);
      setError(null);
    } catch (err) {
      setError(err);
      logger.error('[useOptimizedUserItems] 사용자 아이템 로딩 오류:', err);
      setUserItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserItems();
  }, [fetchUserItems]);

  const refresh = useCallback(() => {
    logger.log('[useOptimizedUserItems] 수동 새로고침 실행, userId:', userId);
    fetchUserItems(true);
  }, [fetchUserItems, userId]);

  return { userItems, setUserItems, loading, error, refresh };
};

// 디바운스된 새로고침 Hook
export const useDebouncedRefresh = (refreshFunction, delay = 500) => {
  const timeoutRef = useRef(null);

  const debouncedRefresh = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      refreshFunction(...args);
    }, delay);
  }, [refreshFunction, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedRefresh;
};

// 폴링 Hook (주기적 데이터 갱신)
export const usePolling = (refreshFunction, interval = 300000, enabled = true) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled || !interval) return;

    intervalRef.current = setInterval(() => {
      refreshFunction();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshFunction, interval, enabled]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (!intervalRef.current && enabled) {
      intervalRef.current = setInterval(() => {
        refreshFunction();
      }, interval);
    }
  }, [refreshFunction, interval, enabled]);

  return { stopPolling, startPolling };
};