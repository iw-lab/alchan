// src/utils/logger.ts
// 프로덕션 환경에서 console.log 자동 비활성화
// 개발 환경에서만 로그 출력

const isDev = process.env.NODE_ENV === 'development';

/**
 * 로거 인터페이스
 */
export interface Logger {
  /** 일반 로그 출력 (개발 환경 전용) */
  log: (...args: unknown[]) => void;
  /** 정보성 로그 출력 (개발 환경 전용) */
  info: (...args: unknown[]) => void;
  /** 디버그 로그 출력 (개발 환경 전용) */
  debug: (...args: unknown[]) => void;
  /** 경고 로그 출력 (모든 환경) */
  warn: (...args: unknown[]) => void;
  /** 에러 로그 출력 (모든 환경) */
  error: (...args: unknown[]) => void;
  /** 그룹 로깅 시작 (개발 환경 전용) */
  group: (label: string) => void;
  /** 그룹 로깅 종료 (개발 환경 전용) */
  groupEnd: () => void;
  /** 테이블 로깅 (개발 환경 전용) */
  table: (data: unknown) => void;
  /** 시간 측정 시작 (개발 환경 전용) */
  time: (label: string) => void;
  /** 시간 측정 종료 (개발 환경 전용) */
  timeEnd: (label: string) => void;
}

/**
 * 개발 환경에서만 로그 출력
 * 프로덕션에서는 자동으로 비활성화
 */
export const logger: Logger = {
  log: isDev
    ? (...args: unknown[]) => console.log('[Dev]', ...args)
    : () => {},

  info: isDev
    ? (...args: unknown[]) => console.info('[Info]', ...args)
    : () => {},

  debug: isDev
    ? (...args: unknown[]) => console.debug('[Debug]', ...args)
    : () => {},

  // warn과 error는 프로덕션에서도 출력 (중요한 정보)
  warn: (...args: unknown[]) => console.warn('[Warn]', ...args),
  error: (...args: unknown[]) => console.error('[Error]', ...args),

  // 그룹 로깅 (개발 전용)
  group: isDev
    ? (label: string) => console.group(label)
    : () => {},

  groupEnd: isDev
    ? () => console.groupEnd()
    : () => {},

  // 테이블 로깅 (개발 전용)
  table: isDev
    ? (data: unknown) => console.table(data)
    : () => {},

  // 시간 측정 (개발 전용)
  time: isDev
    ? (label: string) => console.time(label)
    : () => {},

  timeEnd: isDev
    ? (label: string) => console.timeEnd(label)
    : () => {},
};

/**
 * 특정 모듈용 로거 생성
 * @param moduleName - 모듈 이름
 * @returns 모듈별 로거
 */
export const createLogger = (moduleName: string): Omit<Logger, 'group' | 'groupEnd' | 'table' | 'time' | 'timeEnd'> => ({
  log: isDev
    ? (...args: unknown[]) => console.log(`[${moduleName}]`, ...args)
    : () => {},

  info: isDev
    ? (...args: unknown[]) => console.info(`[${moduleName}]`, ...args)
    : () => {},

  debug: isDev
    ? (...args: unknown[]) => console.debug(`[${moduleName}]`, ...args)
    : () => {},

  warn: (...args: unknown[]) => console.warn(`[${moduleName}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${moduleName}]`, ...args),
});

export default logger;
