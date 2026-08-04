// src/hooks/useFirestoreData.js
// 통합 Firestore 데이터 훅 - 🔥 v2.0 대폭 최적화 (globalCacheService 통합)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore';
import globalCacheService, { cacheStats } from '../services/globalCacheService';

import { logger } from "../utils/logger";
// ============================================
// 🔥 TTL 상수 - v3.0 극단적 최적화 (Firestore 읽기 95% 감소 목표)
// 거래/업데이트 시 캐시가 강제 무효화되므로 긴 TTL이 안전함
// ============================================
const TTL = {
  // 거의 변경 안됨 (12시간) - 학급정보, 직업목록
  STATIC: 12 * 60 * 60 * 1000,
  // 가끔 변경 (6시간) - 학급 구성원
  SEMI_STATIC: 6 * 60 * 60 * 1000,
  // 자주 변경 (4시간) - 사용자 정보, 아이템
  NORMAL: 4 * 60 * 60 * 1000,
  // 매우 자주 변경 (2시간) - 거래내역, 국고
  FREQUENT: 2 * 60 * 60 * 1000,
  // 실시간성 필요 (1시간) - 최소 TTL
  REALTIME: 60 * 60 * 1000,
};

// ============================================
// 🔥 globalCacheService와 통합된 캐시 래퍼
// ============================================
class UnifiedCache {
  constructor() {
    this.localCache = new Map(); // 메모리 캐시 (빠른 접근용)
    this.hits = 0;
    this.misses = 0;
  }

  generateKey(path, queryParams = null) {
    if (queryParams) {
      return `firestore_${path}:${JSON.stringify(queryParams)}`;
    }
    return `firestore_${path}`;
  }

  get(key) {
    // 1. 로컬 메모리 캐시 먼저 확인 (가장 빠름)
    const localEntry = this.localCache.get(key);
    if (localEntry && Date.now() <= localEntry.expiresAt) {
      localEntry.lastAccessed = Date.now();
      this.hits++;
      return localEntry.data;
    }

    // 2. globalCacheService 확인 (localStorage/IndexedDB 포함)
    const globalData = globalCacheService.get(key);
    if (globalData) {
      // 로컬 캐시에도 저장
      this.localCache.set(key, {
        data: globalData,
        expiresAt: Date.now() + TTL.NORMAL,
        lastAccessed: Date.now(),
      });
      this.hits++;
      return globalData;
    }

    this.misses++;
    return null;
  }

  set(key, data, ttl = TTL.NORMAL) {
    // 로컬 메모리 캐시에 저장
    this.localCache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      updatedAt: Date.now(),
      lastAccessed: Date.now(),
    });

    // globalCacheService에도 저장 (localStorage/IndexedDB 영구화)
    globalCacheService.set(key, data, ttl);

    // 캐시 용량 관리 (최대 300개)
    if (this.localCache.size > 300) {
      this._evictOldest();
    }
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.localCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.localCache.delete(oldestKey);
    }
  }

  invalidate(pattern) {
    // 로컬 캐시 무효화
    if (typeof pattern === 'string') {
      for (const key of this.localCache.keys()) {
        if (key.includes(pattern)) {
          this.localCache.delete(key);
        }
      }
    }
    // globalCacheService 무효화
    globalCacheService.invalidatePattern(pattern);
  }

  clear() {
    this.localCache.clear();
    globalCacheService.clearAll();
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0
      ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1)
      : 0;
    return {
      localSize: this.localCache.size,
      globalStats: globalCacheService.getStats(),
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      cacheStats: cacheStats,
    };
  }

  resetStats() {
    this.hits = 0;
    this.misses = 0;
  }
}

export const globalCache = new UnifiedCache();

// 전역 접근 (개발 환경에서만)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.__firestoreCache = globalCache;
}

// ============================================
// 🔥 단일 문서 훅 - realtime 제거, TTL 증가
// ============================================
export function useDocument(path, options = {}) {
  const {
    enabled = true,
    ttl = TTL.NORMAL, // 🔥 기본값 30분 (기존 5분)
    onError,
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const cacheKey = globalCache.generateKey(path);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    // 캐시 확인
    if (!forceRefresh) {
      const cached = globalCache.get(cacheKey);
      if (cached) {
        logger.log(`%c[DB] ✅ 캐시 히트: ${path}`, 'color: #22c55e;');
        if (mountedRef.current) {
          setData(cached);
          setLoading(false);
        }
        return;
      }
    }

    if (mountedRef.current) {
      setLoading(true);
    }

    try {
      logger.log(`%c[DB] 🔥 Firestore 읽기: ${path}`, 'color: #f97316; font-weight: bold;');
      const docRef = doc(db, ...path.split('/'));
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const docData = { id: docSnap.id, ...docSnap.data() };
        globalCache.set(cacheKey, docData, ttl);
        if (mountedRef.current) {
          setData(docData);
        }
      } else {
        if (mountedRef.current) {
          setData(null);
        }
      }
      if (mountedRef.current) {
        setError(null);
      }
    } catch (err) {
      logger.error(`[useDocument] Error fetching ${path}:`, err);
      if (mountedRef.current) {
        setError(err);
        onError?.(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [path, enabled, cacheKey, ttl, onError]);

  useEffect(() => {
    mountedRef.current = true;

    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [path, enabled, fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch };
}

// ============================================
// 🔥 컬렉션 훅 - realtime 제거, TTL 증가
// ============================================
export function useCollection(path, queryConstraints = [], options = {}) {
  const {
    enabled = true,
    ttl = TTL.NORMAL, // 🔥 기본값 30분 (기존 3분)
    onError,
  } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // 쿼리 파라미터를 문자열로 직렬화
  const queryKey = useMemo(() => {
    try {
      return JSON.stringify(queryConstraints.map(c => c?.toString?.() || ''));
    } catch {
      return '';
    }
  }, [queryConstraints]);

  const cacheKey = globalCache.generateKey(path, queryKey);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    // 캐시 확인
    if (!forceRefresh) {
      const cached = globalCache.get(cacheKey);
      if (cached) {
        logger.log(`%c[DB] ✅ 캐시 히트: ${path} (${cached.length}개)`, 'color: #22c55e;');
        if (mountedRef.current) {
          setData(cached);
          setLoading(false);
        }
        return;
      }
    }

    if (mountedRef.current) {
      setLoading(true);
    }

    try {
      logger.log(`%c[DB] 🔥 Firestore 컬렉션 읽기: ${path}`, 'color: #f97316; font-weight: bold;');
      const colRef = collection(db, ...path.split('/'));
      const q = queryConstraints.length > 0
        ? query(colRef, ...queryConstraints)
        : colRef;

      const querySnap = await getDocs(q);
      const docs = querySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.log(`%c[DB] 📄 ${path}: ${docs.length}개 문서 읽음`, 'color: #f97316;');
      globalCache.set(cacheKey, docs, ttl);
      if (mountedRef.current) {
        setData(docs);
        setError(null);
      }
    } catch (err) {
      logger.error(`[useCollection] Error fetching ${path}:`, err);
      if (mountedRef.current) {
        setError(err);
        onError?.(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [path, enabled, cacheKey, queryConstraints, ttl, onError]);

  useEffect(() => {
    mountedRef.current = true;

    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [path, enabled, queryKey, fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch };
}

// ============================================
// 🔥 학급 데이터 통합 훅 - TTL 대폭 증가
// ============================================
export function useClassData(classCode, options = {}) {
  const { enabled = true } = options;

  // 🔥 학급 정보 - 거의 변경 안됨 (2시간 TTL)
  const classInfo = useDocument(
    classCode ? `classes/${classCode}` : null,
    { enabled: !!classCode && enabled, ttl: TTL.STATIC }
  );

  // 🔥 학급 구성원 - 가끔 변경 (1시간 TTL)
  const members = useCollection(
    'users',
    classCode ? [where('classCode', '==', classCode)] : [],
    { enabled: !!classCode && enabled, ttl: TTL.SEMI_STATIC }
  );

  // 🔥 직업 목록 - 거의 변경 안됨 (2시간 TTL)
  const jobs = useCollection(
    'jobs',
    classCode ? [where('classCode', '==', classCode)] : [],
    { enabled: !!classCode && enabled, ttl: TTL.STATIC }
  );

  // 🔥 국고 잔액 - 자주 변경됨 (10분 TTL)
  const treasury = useDocument(
    classCode ? `nationalTreasuries/${classCode}` : null,
    { enabled: !!classCode && enabled, ttl: TTL.FREQUENT }
  );

  const loading = classInfo.loading || members.loading || jobs.loading || treasury.loading;

  const refetchAll = useCallback(() => {
    classInfo.refetch();
    members.refetch();
    jobs.refetch();
    treasury.refetch();
  }, [classInfo, members, jobs, treasury]);

  return {
    classInfo: classInfo.data,
    members: members.data,
    jobs: jobs.data,
    treasury: treasury.data,
    loading,
    refetchAll,
  };
}

// ============================================
// 🔥 사용자 데이터 훅 - TTL 증가
// ============================================
export function useUserData(userId, options = {}) {
  const { enabled = true } = options;

  // 🔥 기본 사용자 정보 (30분 TTL)
  const userInfo = useDocument(
    userId ? `users/${userId}` : null,
    { enabled: !!userId && enabled, ttl: TTL.NORMAL }
  );

  // 🔥 사용자 아이템 (30분 TTL)
  const items = useCollection(
    userId ? `user_items/${userId}/items` : null,
    [],
    { enabled: !!userId && enabled, ttl: TTL.NORMAL }
  );

  // 🔥 거래 내역 (10분 TTL - 최근 20개)
  const transactions = useCollection(
    'transactions',
    userId ? [
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(20)
    ] : [],
    { enabled: !!userId && enabled, ttl: TTL.FREQUENT }
  );

  const loading = userInfo.loading || items.loading || transactions.loading;

  return {
    user: userInfo.data,
    items: items.data,
    transactions: transactions.data,
    loading,
    refetch: userInfo.refetch,
  };
}

// ============================================
// 🔥 페이지네이션 훅
// ============================================
export function usePaginatedCollection(path, queryConstraints = [], pageSize = 20) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const mountedRef = useRef(true);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !path) return;

    setLoading(true);
    try {
      const colRef = collection(db, ...path.split('/'));
      const constraints = [...queryConstraints, limit(pageSize)];

      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(colRef, ...constraints);
      const querySnap = await getDocs(q);

      const newDocs = querySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (mountedRef.current) {
        setData(prev => [...prev, ...newDocs]);
        setLastDoc(querySnap.docs[querySnap.docs.length - 1] || null);
        setHasMore(newDocs.length === pageSize);
      }
    } catch (err) {
      logger.error('[usePaginatedCollection] Error:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [path, queryConstraints, pageSize, loading, hasMore, lastDoc]);

  const reset = useCallback(() => {
    setData([]);
    setLastDoc(null);
    setHasMore(true);
  }, []);

  // ⚠️ exhaustive-deps 가 loadMore 를 넣으라고 하는데, **넣으면 무한루프다.**
  //    loadMore 의 deps 에 loading·lastDoc 이 들어 있어서 한 번 부를 때마다
  //    setLoading(true) → loadMore 정체성 변경 → 이 effect 재실행 → 다시 loadMore…
  //    가 된다. 여기서 원하는 동작은 "path 가 바뀔 때 처음부터 다시"뿐이므로
  //    의존성은 path 하나가 맞다. (reset 은 deps 가 [] 라 넣어도 무해하지만,
  //    둘 중 하나만 넣으면 규칙이 계속 나머지를 요구하므로 함께 억제한다.)
  //    제대로 고치려면 loadMore 를 ref 에 담거나 함수형 setState 로 loading·lastDoc
  //    의존을 없애야 한다 — 이 훅은 현재 앱에서 아무도 쓰지 않아 미뤄 둔다.
  //    ⚠️ 인라인 억제(eslint-disable-next-line)는 oxlint 가 이 규칙에서 안 받는다(실측).
  //       그래서 .oxlintrc.json 의 overrides 에 이 파일만 예외로 적어 뒀다 —
  //       위 무한루프를 고치면 그 override 도 같이 지울 것.
  useEffect(() => {
    mountedRef.current = true;

    if (path) {
      reset();
      loadMore();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [path]);

  return { data, loading, hasMore, loadMore, reset };
}

// ============================================
// 🔥 캐시 무효화 유틸리티
// ============================================
export function invalidateCache(pattern) {
  globalCache.invalidate(pattern);
}

export function clearCache() {
  globalCache.clear();
}

// 🔥 거래 후 캐시 무효화 헬퍼
export function invalidateUserCache(userId) {
  globalCache.invalidate(`users/${userId}`);
  globalCache.invalidate(`user_items/${userId}`);
  globalCache.invalidate('BATCH');
}

// 🔥 TTL 상수 export
export { TTL };

export default {
  useDocument,
  useCollection,
  useClassData,
  useUserData,
  usePaginatedCollection,
  globalCache,
  invalidateCache,
  clearCache,
  invalidateUserCache,
  TTL,
};
