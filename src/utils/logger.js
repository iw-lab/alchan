// src/utils/logger.js
// 프로덕션 환경에서 console.log 자동 비활성화
// 개발 환경에서만 로그 출력

const isDev = process.env.NODE_ENV === 'development';

/**
 * 개발 환경에서만 로그 출력
 * 프로덕션에서는 자동으로 비활성화
 */
export const logger = {
  log: isDev
    ? (...args) => console.log('[Dev]', ...args)
    : () => {},

  info: isDev
    ? (...args) => console.info('[Info]', ...args)
    : () => {},

  debug: isDev
    ? (...args) => console.debug('[Debug]', ...args)
    : () => {},

  // warn과 error는 프로덕션에서도 출력 (중요한 정보)
  warn: (...args) => console.warn('[Warn]', ...args),
  error: (...args) => console.error('[Error]', ...args),

  // 그룹 로깅 (개발 전용)
  group: isDev
    ? (label) => console.group(label)
    : () => {},

  groupEnd: isDev
    ? () => console.groupEnd()
    : () => {},

  // 테이블 로깅 (개발 전용)
  table: isDev
    ? (data) => console.table(data)
    : () => {},

  // 시간 측정 (개발 전용)
  time: isDev
    ? (label) => console.time(label)
    : () => {},

  timeEnd: isDev
    ? (label) => console.timeEnd(label)
    : () => {},
};

/**
 * 특정 모듈용 로거 생성
 * @param {string} moduleName - 모듈 이름
 * @returns {object} 모듈별 로거
 */
export const createLogger = (moduleName) => ({
  log: isDev
    ? (...args) => console.log(`[${moduleName}]`, ...args)
    : () => {},

  info: isDev
    ? (...args) => console.info(`[${moduleName}]`, ...args)
    : () => {},

  debug: isDev
    ? (...args) => console.debug(`[${moduleName}]`, ...args)
    : () => {},

  warn: (...args) => console.warn(`[${moduleName}]`, ...args),
  error: (...args) => console.error(`[${moduleName}]`, ...args),
});

export default logger;
