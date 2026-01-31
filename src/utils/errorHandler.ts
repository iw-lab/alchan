// src/utils/errorHandler.ts
/**
 * 중앙화된 에러 처리 유틸리티
 * Firebase 에러를 사용자 친화적 메시지로 변환
 */

import { FirebaseError } from 'firebase/app';
import { MESSAGES } from './constants';

// ==================== 커스텀 에러 클래스 ====================
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code = 'UNKNOWN_ERROR',
    statusCode = 500,
    isOperational = true,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.originalError = originalError;

    // 스택 트레이스 유지
    Error.captureStackTrace(this, this.constructor);
  }
}

// ==================== 에러 코드 매핑 ====================
const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  // Auth 에러
  'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
  'auth/invalid-email': '유효하지 않은 이메일 형식입니다.',
  'auth/operation-not-allowed': '이 작업은 허용되지 않습니다.',
  'auth/weak-password': '비밀번호가 너무 약합니다. 6자 이상 입력해주세요.',
  'auth/user-disabled': '비활성화된 계정입니다.',
  'auth/user-not-found': '등록되지 않은 이메일입니다.',
  'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
  'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'auth/too-many-requests': '너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
  'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
  'auth/requires-recent-login': '보안을 위해 다시 로그인해주세요.',

  // Firestore 에러
  'permission-denied': '접근 권한이 없습니다.',
  'not-found': '데이터를 찾을 수 없습니다.',
  'already-exists': '이미 존재하는 데이터입니다.',
  'resource-exhausted': '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
  'failed-precondition': '작업을 수행할 수 없는 상태입니다.',
  'aborted': '작업이 중단되었습니다.',
  'out-of-range': '유효하지 않은 범위입니다.',
  'unimplemented': '지원하지 않는 기능입니다.',
  'internal': '서버 오류가 발생했습니다.',
  unavailable: '서비스를 일시적으로 사용할 수 없습니다.',
  'data-loss': '데이터 손실이 발생했습니다.',
  unauthenticated: '로그인이 필요합니다.',

  // Functions 에러
  'functions/invalid-argument': '잘못된 요청입니다.',
  'functions/failed-precondition': '요청을 처리할 수 없는 상태입니다.',
  'functions/permission-denied': '권한이 없습니다.',
  'functions/not-found': '요청한 기능을 찾을 수 없습니다.',
  'functions/resource-exhausted': '요청 한도를 초과했습니다.',
  'functions/cancelled': '요청이 취소되었습니다.',
  'functions/unknown': '알 수 없는 오류가 발생했습니다.',
  'functions/internal': '서버 내부 오류가 발생했습니다.',
  'functions/unavailable': '서비스를 일시적으로 사용할 수 없습니다.',
  'functions/deadline-exceeded': '요청 시간이 초과되었습니다.',
};

// ==================== 에러 처리 함수들 ====================

/**
 * 에러를 AppError로 변환
 */
export const handleError = (error: unknown): AppError => {
  // 이미 AppError인 경우
  if (error instanceof AppError) {
    return error;
  }

  // Firebase 에러
  if (error instanceof FirebaseError) {
    const message =
      FIREBASE_ERROR_MESSAGES[error.code] || error.message || MESSAGES.ERROR.SERVER_ERROR;
    return new AppError(message, error.code, getStatusCode(error.code), true, error);
  }

  // 일반 Error
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR', 500, true, error);
  }

  // 문자열
  if (typeof error === 'string') {
    return new AppError(error, 'UNKNOWN_ERROR', 500, true);
  }

  // 기타
  return new AppError(MESSAGES.ERROR.SERVER_ERROR, 'UNKNOWN_ERROR', 500, true);
};

/**
 * 에러 메시지 추출
 */
export const getErrorMessage = (error: unknown): string => {
  const appError = handleError(error);
  return appError.message;
};

/**
 * 에러 코드에 따른 HTTP 상태 코드 반환
 */
const getStatusCode = (code: string): number => {
  const statusCodes: Record<string, number> = {
    'permission-denied': 403,
    'not-found': 404,
    'already-exists': 409,
    unauthenticated: 401,
    'invalid-argument': 400,
    'failed-precondition': 412,
    'resource-exhausted': 429,
  };

  // 코드에서 접두사 제거 (예: 'auth/user-not-found' → 'user-not-found')
  const parts = code.split('/');
  const simpleCode = parts.length > 1 ? parts[1] : code;

  return statusCodes[simpleCode ?? code] ?? 500;
};

/**
 * 에러 로깅 (개발 환경에서만 상세 로깅)
 */
export const logError = (error: unknown, context?: string): void => {
  const appError = handleError(error);

  if (process.env.NODE_ENV === 'development') {
    console.group(`[Error]${context ? ` ${context}` : ''}`);
    console.error('Message:', appError.message);
    console.error('Code:', appError.code);
    console.error('Stack:', appError.stack);
    if (appError.originalError) {
      console.error('Original:', appError.originalError);
    }
    console.groupEnd();
  } else {
    // 프로덕션에서는 간단히 로깅
    console.error(`[Error]${context ? ` ${context}:` : ''} ${appError.message}`);
  }
};

/**
 * 네트워크 에러인지 확인
 */
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof FirebaseError) {
    return (
      error.code === 'unavailable' ||
      error.code === 'auth/network-request-failed' ||
      error.message.toLowerCase().includes('network')
    );
  }

  if (error instanceof Error) {
    return (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch')
    );
  }

  return false;
};

/**
 * 인증 에러인지 확인
 */
export const isAuthError = (error: unknown): boolean => {
  if (error instanceof FirebaseError) {
    return error.code.startsWith('auth/') || error.code === 'unauthenticated';
  }

  if (error instanceof AppError) {
    return error.statusCode === 401 || error.code.startsWith('auth/');
  }

  return false;
};

/**
 * 권한 에러인지 확인
 */
export const isPermissionError = (error: unknown): boolean => {
  if (error instanceof FirebaseError) {
    return error.code === 'permission-denied' || error.code === 'functions/permission-denied';
  }

  if (error instanceof AppError) {
    return error.statusCode === 403;
  }

  return false;
};

/**
 * try-catch 래퍼 (async 함수용)
 */
export const tryCatch = async <T>(
  fn: () => Promise<T>,
  errorHandler?: (error: AppError) => void
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    const appError = handleError(error);
    if (errorHandler) {
      errorHandler(appError);
    } else {
      logError(appError);
    }
    return null;
  }
};

// 기본 내보내기
export default {
  AppError,
  handleError,
  getErrorMessage,
  logError,
  isNetworkError,
  isAuthError,
  isPermissionError,
  tryCatch,
};
