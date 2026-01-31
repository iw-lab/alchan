// src/utils/errorLogger.js
// 앱 전역 에러 로깅 유틸리티
// SuperAdmin 대시보드에서 모니터링 가능

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

import { logger } from "../utils/logger";
// 에러 심각도 수준
export const ErrorSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

// 에러 타입
export const ErrorType = {
  RENDER: 'render',
  NETWORK: 'network',
  AUTH: 'auth',
  DATABASE: 'database',
  INFINITE_LOOP: 'infinite_loop',
  PERFORMANCE: 'performance',
  RUNTIME: 'runtime',
  UNKNOWN: 'unknown',
};

// 에러 로그를 Firebase에 저장
export const logError = async ({
  type = ErrorType.UNKNOWN,
  severity = ErrorSeverity.ERROR,
  message,
  stack,
  componentName,
  userId,
  additionalData = {},
}) => {
  try {
    const errorLog = {
      type,
      severity,
      message: message || 'Unknown error',
      stack: stack || new Error().stack,
      componentName: componentName || 'Unknown',
      userId: userId || 'anonymous',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
      timestamp: serverTimestamp(),
      ...additionalData,
    };

    await addDoc(collection(db, 'errorLogs'), errorLog);
    logger.log('[ErrorLogger] 에러 기록됨:', message);
  } catch (logError) {
    logger.error('[ErrorLogger] 에러 기록 실패:', logError);
  }
};

// 무한 루프 감지기
let renderCountMap = new Map();
let lastResetTime = Date.now();

export const detectInfiniteLoop = (componentName, threshold = 100, timeWindow = 1000) => {
  const now = Date.now();

  // 시간 창이 지나면 카운터 리셋
  if (now - lastResetTime > timeWindow) {
    renderCountMap.clear();
    lastResetTime = now;
  }

  const count = (renderCountMap.get(componentName) || 0) + 1;
  renderCountMap.set(componentName, count);

  if (count > threshold) {
    logError({
      type: ErrorType.INFINITE_LOOP,
      severity: ErrorSeverity.CRITICAL,
      message: `무한 루프 감지됨: ${componentName} (${count}회 렌더링/${timeWindow}ms)`,
      componentName,
      additionalData: { renderCount: count, timeWindow },
    });

    // 카운터 리셋하여 중복 로깅 방지
    renderCountMap.set(componentName, 0);

    return true;
  }

  return false;
};

// 성능 모니터링
let performanceMarks = new Map();

export const startPerformanceMark = (markName) => {
  performanceMarks.set(markName, performance.now());
};

export const endPerformanceMark = (markName, warnThreshold = 1000) => {
  const startTime = performanceMarks.get(markName);
  if (!startTime) return null;

  const duration = performance.now() - startTime;
  performanceMarks.delete(markName);

  if (duration > warnThreshold) {
    logError({
      type: ErrorType.PERFORMANCE,
      severity: ErrorSeverity.WARNING,
      message: `성능 경고: ${markName} (${duration.toFixed(2)}ms)`,
      additionalData: { duration, threshold: warnThreshold },
    });
  }

  return duration;
};

// 네트워크 에러 로깅
export const logNetworkError = (error, endpoint, method = 'GET') => {
  logError({
    type: ErrorType.NETWORK,
    severity: ErrorSeverity.ERROR,
    message: `네트워크 에러: ${method} ${endpoint} - ${error.message}`,
    stack: error.stack,
    additionalData: { endpoint, method, status: error.status },
  });
};

// 인증 에러 로깅
export const logAuthError = (error, action) => {
  logError({
    type: ErrorType.AUTH,
    severity: ErrorSeverity.WARNING,
    message: `인증 에러: ${action} - ${error.message}`,
    stack: error.stack,
    additionalData: { action, code: error.code },
  });
};

// 데이터베이스 에러 로깅
export const logDatabaseError = (error, operation, collection) => {
  logError({
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.ERROR,
    message: `DB 에러: ${operation} on ${collection} - ${error.message}`,
    stack: error.stack,
    additionalData: { operation, collection, code: error.code },
  });
};

// 전역 에러 핸들러 설정
export const setupGlobalErrorHandler = (userId) => {
  // 처리되지 않은 에러 캐치
  window.onerror = (message, source, lineno, colno, error) => {
    logError({
      type: ErrorType.RUNTIME,
      severity: ErrorSeverity.CRITICAL,
      message: `전역 에러: ${message}`,
      stack: error?.stack || `${source}:${lineno}:${colno}`,
      userId,
      additionalData: { source, lineno, colno },
    });
    return false; // 기본 에러 핸들링 유지
  };

  // 처리되지 않은 Promise 거부 캐치
  window.onunhandledrejection = (event) => {
    logError({
      type: ErrorType.RUNTIME,
      severity: ErrorSeverity.ERROR,
      message: `처리되지 않은 Promise 거부: ${event.reason?.message || event.reason}`,
      stack: event.reason?.stack,
      userId,
      additionalData: { reason: String(event.reason) },
    });
  };

  logger.log('[ErrorLogger] 전역 에러 핸들러 설정됨');
};

// React Error Boundary에서 사용할 에러 로깅
export const logReactError = (error, errorInfo, componentName) => {
  logError({
    type: ErrorType.RENDER,
    severity: ErrorSeverity.CRITICAL,
    message: `React 렌더링 에러: ${error.message}`,
    stack: error.stack,
    componentName,
    additionalData: {
      componentStack: errorInfo?.componentStack,
    },
  });
};

export default {
  logError,
  detectInfiniteLoop,
  startPerformanceMark,
  endPerformanceMark,
  logNetworkError,
  logAuthError,
  logDatabaseError,
  setupGlobalErrorHandler,
  logReactError,
  ErrorSeverity,
  ErrorType,
};
