// src/services/globalCacheService.js - 전역 캐싱 시스템으로 Firestore 사용량 최적화 (IndexedDB 통합)

import { db } from '../firebase';
import {
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
  orderBy,
  limit
} from 'firebase/firestore';
import indexedDBCache from './indexedDBCache';

import { logger } from "../utils/logger";
export const cacheStats = {
  hits: 0,
  misses: 0,
  savings: 0,
};

class GlobalCacheService {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
    this.subscribers = new Map();
    this.pendingRequests = new Map();

    // 🔥 [비용 최적화 v6.0] 극단적 최적화 - Firestore 읽기 95% 감소 목표
    // 거래/업데이트 시 강제 무효화되므로 매우 긴 TTL이 안전함
    this.DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6시간 (2시간→6시간)
    this.USER_TTL = 12 * 60 * 60 * 1000; // 12시간 (6시간→12시간, 거래 시 강제 무효화)
    this.ACTIVITY_LOG_TTL = 2 * 60 * 60 * 1000; // 2시간 (30분→2시간)
    this.ITEMS_TTL = 24 * 60 * 60 * 1000; // 24시간 (12시간→24시간, 아이템은 거의 안 바뀜)
    this.CLASS_DATA_TTL = 24 * 60 * 60 * 1000; // 24시간 (12시간→24시간)
    this.SETTINGS_TTL = 48 * 60 * 60 * 1000; // 48시간 (24시간→48시간, 설정은 거의 안 바뀜)
    this.GOVERNMENT_SETTINGS_TTL = 48 * 60 * 60 * 1000; // 48시간 (정부 설정)

    // 재시도 설정
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000; // 1초
    this.retryCount = new Map();

    // 🔥 [최적화] localStorage 영구 캐싱 활성화
    this.useLocalStorage = true;
    this.localStoragePrefix = 'gc_'; // globalCache prefix

    // 캐시 정리 타이머
    this.startCleanupTimer();
    this.startLocalStorageSync();
  }

  // 캐시 키 생성
  generateKey(type, params = {}) {
    const sortedParams = Object.keys(params).sort().reduce((result, key) => {
      result[key] = params[key];
      return result;
    }, {});

    return `${type}_${JSON.stringify(sortedParams)}`;
  }

  // 🔥 [최적화] IndexedDB → 메모리 캐시 순서로 확인 (동기 버전)
  get(key) {
    // 1. 메모리 캐시 확인
    if (this.cache.has(key)) {
      const expiry = this.timestamps.get(key);
      if (Date.now() <= expiry) {
        cacheStats.hits++;
        cacheStats.savings++;
        return this.cache.get(key);
      }
      this.invalidate(key);
    }

    // 2. localStorage 폴백 (IndexedDB 비동기라서 동기 메서드에서는 localStorage 사용)
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        const cached = localStorage.getItem(lsKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const {data, expiry, createdAt} = parsed;

          if (Date.now() <= expiry) {
            // 🔥 [추가] BATCH 캐시는 5분 이상 된 것은 무효화 (거래 후 정확도 보장)
            if (key.includes('BATCH') && createdAt) {
              const age = Date.now() - createdAt;
              if (age > 5 * 60 * 1000) { // 5분 이상
                logger.log(`[GlobalCache] ⚠️ 오래된 BATCH 캐시 무효화: ${key} (${Math.floor(age/1000)}초 경과)`);
                localStorage.removeItem(lsKey);
                cacheStats.misses++;
                return null;
              }
            }

            // localStorage에서 복원하여 메모리 캐시에 저장
            this.cache.set(key, data);
            this.timestamps.set(key, expiry);
            logger.log(`[GlobalCache] ✅ localStorage에서 복원: ${key}`);
            cacheStats.hits++;
            cacheStats.savings++;
            return data;
          } else {
            localStorage.removeItem(lsKey);
          }
        }
      } catch (error) {
        logger.warn('[GlobalCache] localStorage 읽기 오류:', error);
      }
    }

    cacheStats.misses++;
    return null;
  }

  // 🔥 [신규] IndexedDB 사용 비동기 get (추천)
  async getAsync(key) {
    // 1. 메모리 캐시 확인
    if (this.cache.has(key)) {
      const expiry = this.timestamps.get(key);
      if (Date.now() <= expiry) {
        cacheStats.hits++;
        cacheStats.savings++;
        return this.cache.get(key);
      }
      this.invalidate(key);
    }

    // 2. IndexedDB 캐시 확인
    try {
      const cachedData = await indexedDBCache.get(key);
      if (cachedData) {
        // IndexedDB에서 복원하여 메모리 캐시에 저장
        this.cache.set(key, cachedData);
        this.timestamps.set(key, Date.now() + this.DEFAULT_TTL);
        logger.log(`[GlobalCache] ✅ IndexedDB에서 복원: ${key}`);
        cacheStats.hits++;
        cacheStats.savings++;
        return cachedData;
      }
    } catch (error) {
      logger.warn('[GlobalCache] IndexedDB 읽기 오류:', error);
    }

    // 3. localStorage 폴백
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        const cached = localStorage.getItem(lsKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const {data, expiry, createdAt} = parsed;

          if (Date.now() <= expiry) {
            // 🔥 [추가] BATCH 캐시는 5분 이상 된 것은 무효화
            if (key.includes('BATCH') && createdAt) {
              const age = Date.now() - createdAt;
              if (age > 5 * 60 * 1000) {
                logger.log(`[GlobalCache] ⚠️ 오래된 BATCH 캐시 무효화: ${key} (${Math.floor(age/1000)}초 경과)`);
                localStorage.removeItem(lsKey);
                cacheStats.misses++;
                return null;
              }
            }

            this.cache.set(key, data);
            this.timestamps.set(key, expiry);
            logger.log(`[GlobalCache] ✅ localStorage에서 복원: ${key}`);
            cacheStats.hits++;
            cacheStats.savings++;
            return data;
          } else {
            localStorage.removeItem(lsKey);
          }
        }
      } catch (error) {
        logger.warn('[GlobalCache] localStorage 읽기 오류:', error);
      }
    }

    cacheStats.misses++;
    return null;
  }

  // 🔥 [최적화] 메모리, IndexedDB, localStorage 동시 저장
  set(key, data, ttl = this.DEFAULT_TTL) {
    const expiry = Date.now() + ttl;
    const createdAt = Date.now(); // 🔥 [추가] 생성 시간 기록

    // 메모리 캐시 저장
    this.cache.set(key, data);
    this.timestamps.set(key, expiry);

    // IndexedDB 저장 (비동기, 실패해도 무시)
    indexedDBCache.set(key, data, ttl / 1000).catch(err => {
      logger.warn('[GlobalCache] IndexedDB 저장 실패:', err);
    });

    // localStorage 저장 (폴백)
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        localStorage.setItem(lsKey, JSON.stringify({data, expiry, createdAt})); // 🔥 [수정] createdAt 추가
      } catch (error) {
        logger.warn('[GlobalCache] localStorage 쓰기 오류 (용량 초과 가능):', error);
        // localStorage 용량 초과 시 가장 오래된 항목 삭제
        this.cleanupOldestLocalStorageItems(5);
      }
    }

    // 구독자들에게 알림
    if (this.subscribers.has(key)) {
      this.subscribers.get(key).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('구독자 콜백 오류:', error);
        }
      });
    }
  }

  /**
   * 증분 동기화: 캐시된 데이터가 있으면 lastSync 이후 업데이트된 항목만 가져와 병합
   * @param {string} cacheKey - 캐시 키
   * @param {Function} fetchFn - 전체 데이터 조회 함수
   * @param {Function} incrementalFetchFn - timestamp 이후 업데이트된 데이터만 조회하는 함수
   * @param {number} ttl - 캐시 TTL (ms)
   */
  async getWithIncrementalSync(cacheKey, fetchFn, incrementalFetchFn, ttl = 300000) {
    const cached = this.get(cacheKey);

    if (cached && cached._lastSync) {
      const age = Date.now() - cached._lastSync;

      // TTL 이내면 캐시 반환
      if (age < ttl) return cached.data;

      // 증분 조회 시도
      try {
        const updates = await incrementalFetchFn(new Date(cached._lastSync));
        if (updates && updates.length > 0) {
          // 업데이트를 기존 데이터에 병합
          const merged = [...cached.data];
          for (const update of updates) {
            const idx = merged.findIndex(item => item.id === update.id);
            if (idx >= 0) {
              merged[idx] = update;
            } else {
              merged.push(update);
            }
          }
          this.set(cacheKey, { data: merged, _lastSync: Date.now() }, ttl);
          return merged;
        }
        // 업데이트 없음 - 캐시 연장
        this.set(cacheKey, { ...cached, _lastSync: Date.now() }, ttl);
        return cached.data;
      } catch (e) {
        // 증분 조회 실패 - 기존 캐시 반환
        return cached.data;
      }
    }

    // 캐시 없음 - 전체 조회
    const data = await fetchFn();
    this.set(cacheKey, { data, _lastSync: Date.now() }, ttl);
    return data;
  }

  /**
   * Stale-While-Revalidate: 캐시된 데이터를 즉시 반환하고, 백그라운드에서 갱신
   * @param {string} key - 캐시 키
   * @param {Function} fetchFn - 데이터 조회 함수
   * @param {number} maxStaleMs - 최대 stale 허용 시간 (기본 5분)
   */
  async staleWhileRevalidate(key, fetchFn, maxStaleMs = 300000) {
    const cached = this.get(key);

    if (cached !== null) {
      const age = Date.now() - (cached._timestamp || 0);
      if (age > maxStaleMs / 2) {
        // 백그라운드 갱신 (await 하지 않음)
        fetchFn().then(freshData => {
          if (freshData !== null && freshData !== undefined) {
            this.set(key, { ...freshData, _timestamp: Date.now() }, maxStaleMs * 2);
          }
        }).catch(() => {});
      }
      return cached;
    }

    // 캐시 없음 - 반드시 fetch
    const data = await fetchFn();
    this.set(key, { ...data, _timestamp: Date.now() }, maxStaleMs * 2);
    return data;
  }

  // 🔥 [추가] localStorage 용량 초과 시 오래된 항목 삭제
  cleanupOldestLocalStorageItems(count = 10) {
    try {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.localStoragePrefix)) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const {expiry} = JSON.parse(cached);
            items.push({key, expiry});
          }
        }
      }

      // 만료 시간이 가까운 순서로 정렬
      items.sort((a, b) => a.expiry - b.expiry);

      // 가장 오래된 항목 삭제
      for (let i = 0; i < Math.min(count, items.length); i++) {
        localStorage.removeItem(items[i].key);
        logger.log(`[GlobalCache] 오래된 캐시 삭제: ${items[i].key}`);
      }
    } catch (error) {
      logger.warn('[GlobalCache] 캐시 정리 오류:', error);
    }
  }

  // 🔥 [최적화] 메모리와 localStorage 동시 무효화
  invalidate(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
    this.pendingRequests.delete(key);

    // localStorage에서도 삭제
    if (this.useLocalStorage) {
      try {
        const lsKey = this.localStoragePrefix + key;
        localStorage.removeItem(lsKey);
      } catch (error) {
        // 무시
      }
    }
  }

  // 패턴 기반 캐시 무효화 (메모리 + localStorage)
  invalidatePattern(pattern) {
    const keysToInvalidate = [];

    // 메모리 캐시에서 패턴 매칭
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToInvalidate.push(key);
      }
    }

    // 🔥 [수정] localStorage에서도 패턴 매칭하여 삭제
    if (this.useLocalStorage) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const lsKey = localStorage.key(i);
          if (lsKey && lsKey.startsWith(this.localStoragePrefix)) {
            const actualKey = lsKey.substring(this.localStoragePrefix.length);
            if (actualKey.includes(pattern) && !keysToInvalidate.includes(actualKey)) {
              keysToInvalidate.push(actualKey);
            }
          }
        }
      } catch (error) {
        logger.warn('[GlobalCache] localStorage 패턴 검색 오류:', error);
      }
    }

    keysToInvalidate.forEach(key => this.invalidate(key));
    logger.log(`[GlobalCache] 패턴 '${pattern}' 매칭: ${keysToInvalidate.length}개 캐시 무효화`);
  }

  // 구독 추가
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    // 언구독 함수 반환
    return () => {
      if (this.subscribers.has(key)) {
        this.subscribers.get(key).delete(callback);
        if (this.subscribers.get(key).size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  // 지수 백오프를 사용한 재시도 로직
  async retryWithBackoff(operation, retryCount = 0) {
    try {
      return await operation();
    } catch (error) {
      // Firestore 네트워크 오류인 경우에만 재시도
      const isNetworkError =
        error.code === 'unavailable' ||
        error.code === 'deadline-exceeded' ||
        error.message?.includes('Failed to get document') ||
        error.message?.includes('network error') ||
        error.name === 'FirebaseError';

      if (isNetworkError && retryCount < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, retryCount);
        logger.warn(`[GlobalCache] 재시도 중... (${retryCount + 1}/${this.MAX_RETRIES}) - ${delay}ms 대기`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(operation, retryCount + 1);
      }

      // 재시도 횟수 초과 또는 재시도 불가능한 에러
      if (retryCount >= this.MAX_RETRIES) {
        logger.error('[GlobalCache] 최대 재시도 횟수 초과:', error);
      }
      throw error;
    }
  }

  // 중복 요청 방지를 위한 래퍼
  async executeOrWait(key, operation) {
    // 이미 진행 중인 요청이 있으면 대기
    if (this.pendingRequests.has(key)) {
      logger.log('[GlobalCache] 이미 진행 중인 요청 대기:', key);
      return await this.pendingRequests.get(key);
    }

    // 새 요청 실행 (재시도 로직 포함)
    logger.log('[GlobalCache] 새 요청 실행:', key);
    const promise = this.retryWithBackoff(operation);
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      logger.log('[GlobalCache] 요청 성공:', key, '결과 타입:', Array.isArray(result) ? `배열(${result.length}개)` : typeof result);
      this.pendingRequests.delete(key);
      this.retryCount.delete(key);
      return result;
    } catch (error) {
      logger.error('[GlobalCache] executeOrWait 최종 실패:', key, error);
      this.pendingRequests.delete(key);
      throw error;
    }
  }

  // 사용자 문서 가져오기 (캐시됨)
  async getUserDoc(uid, forceRefresh = false) {
    const key = this.generateKey('user', { uid });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        logger.log(`%c[DB] ✅ 캐시 히트: users/${uid}`, 'color: #22c55e;');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        logger.log(`%c[DB] 🔥 Firestore 읽기: users/${uid}`, 'color: #f97316; font-weight: bold;');
        const userRef = doc(db, 'users', uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const userData = { id: docSnap.id, uid: docSnap.id, ...docSnap.data() };
          this.set(key, userData, this.USER_TTL);
          return userData;
        }
        return null;
      } catch (error) {
        logger.error('[GlobalCache] 사용자 문서 조회 오류:', error);
        // 캐시된 데이터가 있으면 반환 (오프라인 모드 대응)
        const cached = this.cache.get(key);
        if (cached) {
          logger.warn('[GlobalCache] 네트워크 오류 - 만료된 캐시 반환:', uid);
          return cached;
        }
        throw error;
      }
    });
  }

  async getDoc(collectionPath, docId, forceRefresh = false) {
    const key = this.generateKey(collectionPath, { docId });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        logger.log(`%c[DB] ✅ 캐시 히트: ${collectionPath}/${docId}`, 'color: #22c55e;');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        logger.log(`%c[DB] 🔥 Firestore 읽기: ${collectionPath}/${docId}`, 'color: #f97316; font-weight: bold;');
        const docRef = doc(db, collectionPath, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const docData = { id: docSnap.id, ...docSnap.data() };
          this.set(key, docData, this.DEFAULT_TTL);
          return docData;
        }
        return null;
      } catch (error) {
        logger.error(`[GlobalCache] ${collectionPath}/${docId} 문서 조회 오류:`, error);
        const cached = this.cache.get(key);
        if (cached) {
          return cached;
        }
        throw error;
      }
    });
  }

  // 학급 구성원 가져오기 (캐시됨)
  async getClassMembers(classCode, forceRefresh = false) {
    const key = this.generateKey('classMembers', { classCode });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        logger.log(`%c[DB] ✅ 캐시 히트: classMembers/${classCode} (${cached.length}명)`, 'color: #22c55e;');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        logger.log(`%c[DB] 🔥 Firestore 컬렉션 읽기: users (classCode=${classCode})`, 'color: #f97316; font-weight: bold;');
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('classCode', '==', classCode));
        const querySnapshot = await getDocs(q);

        const members = querySnapshot.docs.map(doc => ({
          id: doc.id,
          uid: doc.id,
          ...doc.data()
        }));

        logger.log(`%c[DB] 📄 학급 구성원: ${members.length}명 읽음`, 'color: #f97316;');
        this.set(key, members, this.USER_TTL);
        return members;
      } catch (error) {
        logger.error('[GlobalCache] 학급 구성원 조회 오류:', error);
        // 캐시된 데이터가 있으면 반환
        const cached = this.cache.get(key);
        if (cached) {
          logger.warn('[GlobalCache] 네트워크 오류 - 만료된 캐시 반환:', classCode);
          return cached;
        }
        throw error;
      }
    });
  }

  // 활동 로그 가져오기 (캐시됨)
  async getActivityLogs(classCode, filters = {}, forceRefresh = false) {
    const { lastVisible, ...restFilters } = filters;
    const key = this.generateKey('activityLogs', { classCode, ...restFilters });
    logger.log('[GlobalCache] getActivityLogs 호출:', { classCode, filters, forceRefresh, key });

    if (!forceRefresh && !lastVisible) { // lastVisible이 있으면 항상 새로 가져옴
      const cached = this.get(key);
      if (cached) {
        logger.log('[GlobalCache] 활동 로그 캐시 히트:', cached.logs.length, '개');
        return cached;
      }
    }

    logger.log('[GlobalCache] Firestore 활동 로그 조회 시작:', classCode);
    const operation = async () => {
      try {
        const logsRef = collection(db, 'activity_logs');
        let q = query(logsRef, where('classCode', '==', classCode));

        if (filters.dateFilter && filters.dateFilter !== 'all') {
          const now = new Date();
          let startDate = new Date();
          switch (filters.dateFilter) {
            case 'today': startDate.setHours(0, 0, 0, 0); break;
            case 'week': startDate.setDate(now.getDate() - 7); break;
            case 'month': startDate.setMonth(now.getMonth() - 1); break;
          }
          q = query(q, where('timestamp', '>=', startDate));
        }

        q = query(q, orderBy('timestamp', 'desc'));

        if (lastVisible) {
          q = query(q, startAfter(lastVisible));
        }

        q = query(q, limit(filters.limit || 20)); // 페이지당 20개로 기본값 변경

        const querySnapshot = await getDocs(q);
        const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        const result = { logs, lastVisible: newLastVisible };

        if (!lastVisible) { // 첫 페이지일 때만 캐시 저장
            this.set(key, result, this.ACTIVITY_LOG_TTL);
        }

        return result;
      } catch (error) {
        logger.error('[GlobalCache] 활동 로그 조회 오류:', error);
        const cached = this.cache.get(key);
        if (cached) {
          return cached;
        }
        return { logs: [], lastVisible: null };
      }
    };

    // 페이지네이션은 중복 요청 방지를 사용하지 않음 (항상 새 요청)
    return await this.retryWithBackoff(operation);
  }

  // 아이템 데이터 가져오기 (캐시됨)
  async getItems(forceRefresh = false) {
    const key = this.generateKey('items', {});

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        logger.log('[GlobalCache] ✅ getItems - 캐시 히트 (Firestore 읽기 0건):', cached?.length, '개');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        logger.log('[GlobalCache] 🔥 getItems - Firestore 조회 시작 (19건 읽기 예상)');
        const itemsRef = collection(db, 'storeItems');
        const querySnapshot = await getDocs(itemsRef);

        const items = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        logger.log('[GlobalCache] ✅ getItems - Firestore 조회 완료 (' + items.length + '건 읽음)');
        this.set(key, items, this.ITEMS_TTL);
        return items;
      } catch (error) {
        logger.error('[GlobalCache] ❌ getItems - 조회 오류:', error.message);
        const cached = this.cache.get(key);
        if (cached) {
          logger.warn('[GlobalCache] ⚠️ 네트워크 오류 - 만료된 캐시 반환 (Firestore 읽기 0건)');
          return cached.data;
        }
        throw error;
      }
    });
  }

  // 사용자 아이템 가져오기 (캐시됨)
  async getUserItems(userId, forceRefresh = false) {
    const key = this.generateKey('userItems', { userId });

    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        logger.log('[GlobalCache] ✅ getUserItems - 캐시 히트 (Firestore 읽기 0건):', cached?.length, '개');
        return cached;
      }
    }

    return await this.executeOrWait(key, async () => {
      try {
        logger.log('[GlobalCache] 🔥 getUserItems - Firestore 조회 시작 (' + userId + '/inventory)');
        const userInventoryRef = collection(db, 'users', userId, 'inventory');
        const querySnapshot = await getDocs(userInventoryRef);

        const userItems = querySnapshot.docs.map(doc => ({
          id: doc.id,
          source: 'inventory',
          ...doc.data()
        }));

        logger.log('[GlobalCache] ✅ getUserItems - Firestore 조회 완료 (' + userItems.length + '건 읽음)');
        this.set(key, userItems, this.ITEMS_TTL);
        return userItems;
      } catch (error) {
        logger.error('[GlobalCache] ❌ getUserItems - 조회 오류:', error.message);
        const cached = this.cache.get(key);
        if (cached) {
          logger.warn('[GlobalCache] ⚠️ 네트워크 오류 - 만료된 캐시 반환 (Firestore 읽기 0건)');
          return cached.data;
        }
        throw error;
      }
    });
  }

  // 🔥 [최적화] localStorage 동기화 타이머 추가
  startLocalStorageSync() {
    // 30분마다 localStorage의 만료된 항목 정리
    setInterval(() => {
      if (!this.useLocalStorage) return;

      try {
        const now = Date.now();
        const keysToDelete = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.localStoragePrefix)) {
            const cached = localStorage.getItem(key);
            if (cached) {
              const {expiry} = JSON.parse(cached);
              if (now > expiry) {
                keysToDelete.push(key);
              }
            }
          }
        }

        keysToDelete.forEach(key => localStorage.removeItem(key));

        if (keysToDelete.length > 0) {
          logger.log(`[GlobalCache] localStorage 정리: ${keysToDelete.length}개 만료된 항목 제거`);
        }
      } catch (error) {
        logger.warn('[GlobalCache] localStorage 정리 오류:', error);
      }
    }, 30 * 60 * 1000); // 30분마다
  }

  // 캐시 정리 타이머
  startCleanupTimer() {
    setInterval(() => {
      const now = Date.now();
      const expiredKeys = [];

      for (const [key, expiry] of this.timestamps.entries()) {
        if (now > expiry) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => this.invalidate(key));

      if (expiredKeys.length > 0) {
        logger.log(`[GlobalCache] 메모리 캐시 정리: ${expiredKeys.length}개 만료된 항목 제거`);
      }
    }, 60000); // 1분마다 정리
  }

  // 사용자 로그아웃 시 캐시 정리
  clearUserData(userId) {
    this.invalidatePattern(`user_${userId}`);
    this.invalidatePattern(`userItems_${userId}`);
  }

  // 학급 변경 시 캐시 정리
  clearClassData(classCode) {
    this.invalidatePattern(`classMembers_${classCode}`);
    this.invalidatePattern(`activityLogs_${classCode}`);
  }

  // 전체 캐시 정리 (Memory + IndexedDB + localStorage)
  async clearAll() {
    this.cache.clear();
    this.timestamps.clear();
    this.subscribers.clear();
    this.pendingRequests.clear();

    // IndexedDB 정리
    try {
      if (window.indexedDB) {
        const databases = await window.indexedDB.databases?.() || [];
        for (const db of databases) {
          if (db.name?.startsWith('alchan-cache')) {
            window.indexedDB.deleteDatabase(db.name);
          }
        }
      }
    } catch (e) { /* IndexedDB 미지원 환경 무시 */ }

    // localStorage 캐시 키 정리
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('cache_') || key?.startsWith('alchan_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) { /* localStorage 미지원 환경 무시 */ }
  }

  // 캐시 상태 정보
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      subscribers: this.subscribers.size,
      memoryUsage: JSON.stringify([...this.cache.entries()]).length
    };
  }
}

// 전역 인스턴스 생성
export const globalCache = new GlobalCacheService();

// React Hook
export const useGlobalCache = () => {
  return globalCache;
};

export default globalCache;