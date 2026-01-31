// src/hooks/usePullToRefresh.js
// 풀투리프레시 기능 훅

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

export function usePullToRefresh(onRefresh, options = {}) {
  const {
    threshold = 80,
    maxPull = 120,
    disabled = false,
    containerRef = null
  } = options;

  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    if (disabled || isRefreshing) return;

    const container = containerRef?.current || document.scrollingElement || document.body;
    if (container.scrollTop > 0) return;

    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing, containerRef]);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling || disabled || isRefreshing) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    if (diff > 0) {
      // 저항감 적용 (당길수록 느려짐)
      const resistance = 0.5;
      const distance = Math.min(diff * resistance, maxPull);
      setPullDistance(distance);

      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [isPulling, disabled, isRefreshing, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;

    setIsPulling(false);

    if (pullDistance >= threshold && onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        logger.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  }, [isPulling, disabled, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef?.current || document;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, containerRef]);

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldRefresh = pullDistance >= threshold;

  return {
    pullDistance,
    isRefreshing,
    isPulling,
    progress,
    shouldRefresh
  };
}

// 풀투리프레시 인디케이터 컴포넌트
export function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 80 }) {
  const progress = Math.min(pullDistance / threshold, 1);
  const shouldShow = pullDistance > 10 || isRefreshing;

  if (!shouldShow) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none"
      style={{
        transform: `translateY(${Math.min(pullDistance, 100)}px)`,
        opacity: isRefreshing ? 1 : progress
      }}
    >
      <div className={`
        w-10 h-10 bg-white dark:bg-gray-800 rounded-full shadow-lg
        flex items-center justify-center
        ${isRefreshing ? 'animate-spin' : ''}
      `}>
        <svg
          className="w-5 h-5 text-indigo-600 dark:text-indigo-400"
          style={{
            transform: isRefreshing ? 'none' : `rotate(${progress * 360}deg)`
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </div>
    </div>
  );
}

export default usePullToRefresh;
