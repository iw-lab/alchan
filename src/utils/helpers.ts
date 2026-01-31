// src/utils/helpers.ts
/**
 * 공통 유틸리티 함수 모음
 * 프로젝트 전반에서 재사용되는 헬퍼 함수들
 */

import { Timestamp } from 'firebase/firestore';

// ==================== 통화/숫자 포맷팅 ====================

/**
 * 통화 형식 변환 (예: 1000 → "₩1,000")
 */
export const formatCurrency = (amount: number): string => {
  if (!isValidNumber(amount)) return '₩0';
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
};

/**
 * 숫자에 천단위 콤마 (예: 1000 → "1,000")
 */
export const formatNumber = (num: number): string => {
  if (!isValidNumber(num)) return '0';
  return new Intl.NumberFormat('ko-KR').format(num);
};

/**
 * 숫자를 간결하게 표시 (예: 1000 → "1천", 10000 → "1만")
 */
export const formatCompactNumber = (num: number): string => {
  if (!isValidNumber(num)) return '0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 100000000) {
    return `${sign}${(absNum / 100000000).toFixed(1)}억`;
  }
  if (absNum >= 10000) {
    return `${sign}${(absNum / 10000).toFixed(1)}만`;
  }
  if (absNum >= 1000) {
    return `${sign}${(absNum / 1000).toFixed(1)}천`;
  }
  return formatNumber(num);
};

/**
 * 퍼센트 형식 (예: 0.15 → "15%")
 */
export const formatPercent = (value: number, decimals = 1): string => {
  if (!isValidNumber(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * 변화율 형식 (양수면 +, 음수면 -)
 */
export const formatChange = (value: number, decimals = 2): string => {
  if (!isValidNumber(value)) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

// ==================== 날짜/시간 포맷팅 ====================

/**
 * Timestamp 또는 Date를 Date 객체로 변환
 */
export const toDate = (date: Date | Timestamp | string | number): Date => {
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  if (date instanceof Date) {
    return date;
  }
  return new Date(date);
};

/**
 * 날짜 형식 변환 (예: "2024.01.15")
 */
export const formatDate = (
  date: Date | Timestamp | string,
  format: 'short' | 'long' | 'full' = 'short'
): string => {
  try {
    const dateObj = toDate(date);

    if (format === 'short') {
      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dateObj);
    }

    if (format === 'long') {
      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(dateObj);
    }

    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } catch {
    return '날짜 없음';
  }
};

/**
 * 시간만 표시 (예: "14:30")
 */
export const formatTime = (date: Date | Timestamp | string): string => {
  try {
    const dateObj = toDate(date);
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } catch {
    return '--:--';
  }
};

/**
 * 상대 시간 표시 (예: "3분 전", "2시간 전")
 */
export const formatRelativeTime = (date: Date | Timestamp | string): string => {
  try {
    const dateObj = toDate(date);
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;

    return formatDate(dateObj);
  } catch {
    return '알 수 없음';
  }
};

/**
 * 남은 시간 표시 (예: "2시간 30분")
 */
export const formatTimeLeft = (endTime: Date | Timestamp): string => {
  try {
    const end = toDate(endTime);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();

    if (diffMs <= 0) return '종료됨';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) {
      return `${diffDay}일 ${diffHour % 24}시간`;
    }
    if (diffHour > 0) {
      return `${diffHour}시간 ${diffMin % 60}분`;
    }
    if (diffMin > 0) {
      return `${diffMin}분`;
    }
    return `${diffSec}초`;
  } catch {
    return '알 수 없음';
  }
};

// ==================== 검증 함수 ====================

/**
 * 유효한 숫자인지 확인
 */
export const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

/**
 * 유효한 이메일인지 확인
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 빈 값인지 확인 (null, undefined, '', [], {})
 */
export const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
};

// ==================== 계산 함수 ====================

/**
 * 퍼센트 계산
 */
export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

/**
 * 변화율 계산
 */
export const calculateChangeRate = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * 세금 계산
 */
export const calculateTax = (amount: number, rate: number): number => {
  return Math.floor(amount * rate);
};

/**
 * 세후 금액 계산
 */
export const calculateNetAmount = (grossAmount: number, taxRate: number): number => {
  return grossAmount - calculateTax(grossAmount, taxRate);
};

/**
 * 수수료 포함 금액 계산
 */
export const calculateTotalWithFee = (amount: number, feeRate: number): number => {
  return amount + calculateTax(amount, feeRate);
};

/**
 * 범위 내 숫자 제한
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

// ==================== 문자열 처리 ====================

/**
 * HTML 이스케이프 (XSS 방지)
 */
export const escapeHtml = (str: string): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
};

/**
 * 문자열 자르기 (말줄임표 포함)
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
};

/**
 * 첫 글자 대문자
 */
export const capitalize = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// ==================== 배열/객체 처리 ====================

/**
 * 배열 중복 제거
 */
export const uniqueArray = <T>(array: T[], key?: keyof T): T[] => {
  if (!key) {
    return [...new Set(array)];
  }

  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

/**
 * 배열을 청크로 분할
 */
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * 배열 섞기 (Fisher-Yates)
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
};

/**
 * 객체 얕은 비교
 */
export const shallowEqual = (obj1: unknown, obj2: unknown): boolean => {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  if (obj1 === null || obj2 === null) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  return keys1.every(
    (key) => (obj1 as Record<string, unknown>)[key] === (obj2 as Record<string, unknown>)[key]
  );
};

/**
 * 딥 클론
 */
export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
};

// ==================== 비동기 유틸리티 ====================

/**
 * Sleep 함수
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 디바운스
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * 쓰로틀
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * 재시도 로직
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  let lastError: Error = new Error('Unknown error');

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delay * (i + 1)); // 지수 백오프
      }
    }
  }

  throw lastError;
};

// ==================== 에러 처리 ====================

/**
 * 에러 메시지 추출
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '알 수 없는 오류가 발생했습니다';
};

// ==================== 로컬 스토리지 ====================

/**
 * 로컬 스토리지 안전 읽기
 */
export const getLocalStorage = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * 로컬 스토리지 안전 쓰기
 */
export const setLocalStorage = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/**
 * 로컬 스토리지 삭제
 */
export const removeLocalStorage = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

// ==================== 기타 유틸리티 ====================

/**
 * 랜덤 ID 생성
 */
export const generateId = (prefix = ''): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}${timestamp}${random}`;
};

/**
 * 클래스명 조합
 */
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * 안전한 JSON 파싱
 */
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

/**
 * 환경 확인
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};
