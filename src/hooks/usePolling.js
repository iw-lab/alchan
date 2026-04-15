// src/hooks/usePolling.js - onSnapshot 대체용 Polling Hook (최적화 버전)
import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

// 🔥 [최적화] 페이지별 폴링 간격 상수 - Firestore 읽기 최소화
export const POLLING_INTERVALS = {
  REALTIME: 10 * 60 * 1000,  // 🔥 10분 - 실시간성이 중요한 페이지 (주식거래소, 경매) (5분→10분)
  NORMAL: 30 * 60 * 1000,    // 🔥 30분 - 일반 페이지 (대시보드, 자산) (15분→30분)
  LOW: 60 * 60 * 1000,       // 🔥 1시간 - 거의 변화없는 페이지 (학습자료) (30분→1시간)
  MANUAL: null               // 수동 새로고침만
};

// 🔥 [최적화] 전역 초기 로드 디바운싱 - 여러 폴링이 동시에 실행되지 않도록
let globalInitialLoadQueue = [];
let isProcessingQueue = false;

const processInitialLoadQueue = async () => {
  if (isProcessingQueue || globalInitialLoadQueue.length === 0) return;
  isProcessingQueue = true;

  while (globalInitialLoadQueue.length > 0) {
    const fetchFn = globalInitialLoadQueue.shift();
    await fetchFn();
    // 각 요청 사이에 100ms 간격 추가
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
};

/**
 * Firestore 실시간 리스너(onSnapshot)를 Polling으로 대체하는 Hook
 *
 * @param {Function} queryFn - Firestore 조회 함수 (getDocs 사용)
 * @param {Object} options - 옵션
 * @param {number} options.interval - Polling 간격 (ms, 기본 5분)
 * @param {boolean} options.enabled - Polling 활성화 여부
 * @param {Array} options.deps - 의존성 배열
 *
 * @returns {Object} { data, loading, error, refetch }
 */
export const usePolling = (queryFn, options = {}) => {
  const {
    interval = POLLING_INTERVALS.NORMAL, // 🔥 [최적화] 기본값 15분
    enabled = true,
    deps = []
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const result = await queryFnRef.current();

      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      logger.error('[usePolling] 데이터 조회 오류:', err);
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [enabled]);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;

    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // enabled가 false이거나 수동 모드면 폴링 중지
    if (!enabled || interval === POLLING_INTERVALS.MANUAL) {
      setLoading(false);
      return;
    }

    // 🔥 [최적화] visibility-aware 폴링: 탭이 백그라운드면 폴링 정지하여 read 비용 절감
    const startPolling = () => {
      if (intervalRef.current || !interval || interval <= 0) return;
      intervalRef.current = setInterval(fetchData, interval);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // 🔥 [최적화] 초기 로드: visible일 때만 큐에 추가하여 순차 실행
    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (isVisible) {
      globalInitialLoadQueue.push(fetchData);
      processInitialLoadQueue();
      startPolling();
    }

    // visibility 변화 감지: 탭 활성화 시 즉시 fetch + 폴링 재개, 비활성화 시 정지
    const handleVisibilityChange = () => {
      if (!mountedRef.current) return;
      if (document.visibilityState === 'visible') {
        fetchData();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, interval, enabled, ...deps]); // deps는 스프레드 연산자로 동적 배열이므로 경고 발생, 하지만 의도된 동작

  return { data, loading, error, refetch };
};

/**
 * 여러 쿼리를 동시에 Polling하는 Hook
 *
 * @param {Array<{key: string, queryFn: Function}>} queries - 쿼리 배열
 * @param {Object} options - 옵션
 *
 * @returns {Object} { data: {key: data}, loading, errors, refetchAll }
 */
export const useMultiPolling = (queries, options = {}) => {
  const {
    interval = POLLING_INTERVALS.NORMAL, // 🔥 [최적화] 기본값 15분
    enabled = true,
    deps = []
  } = options;

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchAllData = useCallback(async () => {
    if (!enabled || queries.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.allSettled(
        queries.map(({ key, queryFn }) =>
          queryFn().then(result => ({ key, result }))
        )
      );

      if (mountedRef.current) {
        const newData = {};
        const newErrors = {};

        results.forEach((result, index) => {
          const { key } = queries[index];

          if (result.status === 'fulfilled') {
            newData[key] = result.value.result;
          } else {
            newErrors[key] = result.reason;
            logger.error(`[useMultiPolling] ${key} 조회 오류:`, result.reason);
          }
        });

        setData(newData);
        setErrors(newErrors);
        setLoading(false);
      }
    } catch (err) {
      logger.error('[useMultiPolling] 전체 조회 오류:', err);
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [queries, enabled]);

  const refetchAll = useCallback(() => {
    setLoading(true);
    return fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    mountedRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || queries.length === 0 || interval === POLLING_INTERVALS.MANUAL) {
      setLoading(false);
      return;
    }

    // 🔥 [최적화] visibility-aware 폴링: 탭이 백그라운드면 폴링 정지
    const startPolling = () => {
      if (intervalRef.current || !interval || interval <= 0) return;
      intervalRef.current = setInterval(fetchAllData, interval);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // 초기 1회 fetch는 visible일 때만
    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (isVisible) {
      fetchAllData();
      startPolling();
    }

    const handleVisibilityChange = () => {
      if (!mountedRef.current) return;
      if (document.visibilityState === 'visible') {
        fetchAllData();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllData, interval, enabled, ...deps]); // deps는 스프레드 연산자로 동적 배열이므로 경고 발생, 하지만 의도된 동작

  return { data, loading, errors, refetchAll };
};

export default usePolling;
