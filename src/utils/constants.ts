// src/utils/constants.ts
/**
 * 애플리케이션 전역 상수 정의
 * 매직 넘버를 중앙화하여 유지보수성 향상
 */

// ==================== 금액 제한 ====================
export const LIMITS = {
  MAX_AMOUNT: 1_000_000_000,        // 최대 금액 10억
  MIN_AMOUNT: 1,                     // 최소 금액 1원
  MAX_TRANSFER: 100_000_000,         // 최대 송금액 1억
  MAX_STOCK_QUANTITY: 10_000,        // 주식 최대 수량
  MAX_REAL_ESTATE_PRICE: 10_000_000_000, // 부동산 최대 가격
  MIN_STOCK_PRICE: 100,              // 주식 최소 가격
  MAX_AUCTION_DURATION_HOURS: 24,    // 경매 최대 기간
  MIN_BID_INCREMENT: 100,            // 최소 입찰 증가액
} as const;

// ==================== 캐시 TTL (밀리초) ====================
export const CACHE_TTL = {
  USER_DATA: 5 * 60 * 1000,          // 5분
  CLASS_DATA: 10 * 60 * 1000,        // 10분
  STOCK_DATA: 30 * 1000,             // 30초
  MARKET_DATA: 1 * 60 * 1000,        // 1분
  AUCTION_DATA: 2 * 60 * 1000,       // 2분
  CLASSMATES: 24 * 60 * 60 * 1000,   // 24시간
  SETTINGS: 30 * 60 * 1000,          // 30분
} as const;

// ==================== 기본 세율 ====================
export const TAX_RATES = {
  INCOME: 0.1,                       // 소득세 10%
  SALARY: 0.1,                       // 급여세 10%
  TRANSACTION: 0.005,                // 거래세 0.5%
  STOCK: 0.01,                       // 주식 거래세 1%
  REAL_ESTATE: 0.03,                 // 부동산 취득세 3%
  AUCTION: 0.03,                     // 경매 수수료 3%
  ITEM_STORE: 0.1,                   // 상점 부가세 10%
  ITEM_MARKET: 0.03,                 // 마켓 거래세 3%
  REWARD: 0.05,                      // 보상 세금 5%
} as const;

// ==================== 에러 메시지 ====================
export const MESSAGES = {
  ERROR: {
    INSUFFICIENT_BALANCE: '잔액이 부족합니다',
    INVALID_AMOUNT: '유효한 금액을 입력해주세요',
    AMOUNT_TOO_LARGE: '금액이 너무 큽니다',
    AMOUNT_TOO_SMALL: '금액이 너무 작습니다',
    NETWORK_ERROR: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    UNAUTHORIZED: '권한이 없습니다',
    NOT_FOUND: '데이터를 찾을 수 없습니다',
    INVALID_INPUT: '잘못된 입력입니다',
    SERVER_ERROR: '서버 오류가 발생했습니다',
    TIMEOUT: '요청 시간이 초과되었습니다',
    SESSION_EXPIRED: '세션이 만료되었습니다. 다시 로그인해주세요.',
    ALREADY_EXISTS: '이미 존재합니다',
    SELF_TRANSFER: '자기 자신에게는 송금할 수 없습니다',
    AUCTION_ENDED: '경매가 이미 종료되었습니다',
    STOCK_NOT_ENOUGH: '보유 주식이 부족합니다',
    LOGIN_REQUIRED: '로그인이 필요합니다',
  },
  SUCCESS: {
    TRANSFER: '송금이 완료되었습니다',
    PURCHASE: '구매가 완료되었습니다',
    SALE: '판매가 완료되었습니다',
    UPDATE: '업데이트가 완료되었습니다',
    DELETE: '삭제가 완료되었습니다',
    SAVE: '저장이 완료되었습니다',
    BID: '입찰이 완료되었습니다',
    REGISTER: '등록이 완료되었습니다',
    LOGIN: '로그인되었습니다',
    LOGOUT: '로그아웃되었습니다',
  },
  CONFIRM: {
    DELETE: '정말 삭제하시겠습니까?',
    PURCHASE: '구매하시겠습니까?',
    TRANSFER: '송금하시겠습니까?',
    CANCEL: '취소하시겠습니까?',
    LOGOUT: '로그아웃하시겠습니까?',
  },
  LOADING: {
    DEFAULT: '로딩 중...',
    SAVING: '저장 중...',
    PROCESSING: '처리 중...',
  },
} as const;

// ==================== 폴링 간격 (밀리초) ====================
export const POLLING_INTERVALS = {
  STOCK: 5000,                       // 주식 시세 5초
  AUCTION: 10000,                    // 경매 10초
  NOTIFICATIONS: 30000,              // 알림 30초
  USER_STATUS: 60000,                // 사용자 상태 1분
  DASHBOARD: 30000,                  // 대시보드 30초
} as const;

// ==================== 페이지네이션 ====================
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 10,
  ITEMS_PER_PAGE_OPTIONS: [10, 20, 50, 100],
} as const;

// ==================== 검증 규칙 ====================
export const VALIDATION = {
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 20,
  },
  USERNAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 20,
    PATTERN: /^[가-힣a-zA-Z0-9\s]+$/,
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  CLASS_CODE: {
    MIN_LENGTH: 4,
    MAX_LENGTH: 10,
    PATTERN: /^[a-zA-Z0-9]+$/,
  },
  DESCRIPTION: {
    MAX_LENGTH: 500,
  },
  ITEM_NAME: {
    MAX_LENGTH: 50,
  },
} as const;

// ==================== 기본 값 ====================
export const DEFAULTS = {
  STARTING_MONEY: 10000,             // 시작 자금
  STOCK_INITIAL_PRICE: 1000,         // 주식 초기 가격
  AUCTION_DURATION_HOURS: 24,        // 경매 기본 기간
  WEEKLY_SALARY_INCREASE_RATE: 3.0,  // 주급 인상률 3%
  INTEREST_RATE: 0.05,               // 기본 이자율 5%
} as const;

// ==================== 경로 ====================
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  BANKING: '/banking',
  STOCK: '/banking/stock',
  TRANSFER: '/banking/transfer',
  MARKET: '/market',
  AUCTION: '/market/auction',
  PERSONAL_SHOP: '/market/personal-shop',
  REAL_ESTATE: '/real-estate',
  GOVERNMENT: '/government',
  POLICE: '/government/police',
  COURT: '/government/court',
  TAX: '/government/tax',
  ADMIN: '/admin',
  ADMIN_DATABASE: '/admin/database',
  MY_ITEMS: '/my-items',
  MY_ASSETS: '/my-assets',
  GAMES: '/games',
  SETTINGS: '/settings',
} as const;

// ==================== Firestore 컬렉션 ====================
export const COLLECTIONS = {
  USERS: 'users',
  TRANSACTIONS: 'transactions',
  STOCKS: 'stocks',
  STOCK_HOLDINGS: 'stockHoldings',
  AUCTIONS: 'auctions',
  REAL_ESTATE: 'realEstate',
  NOTIFICATIONS: 'notifications',
  CLASSES: 'classes',
  JOBS: 'jobs',
  ITEMS: 'items',
  INVENTORY: 'inventory',
  TREASURY: 'treasury',
  TAX_SETTINGS: 'taxSettings',
  TAX_RECORDS: 'taxRecords',
  ACTIVITY_LOGS: 'activityLogs',
  SETTINGS: 'settings',
} as const;

// ==================== 아이콘 이모지 ====================
export const ICONS = {
  MONEY: '💰',
  STOCK: '📈',
  STOCK_DOWN: '📉',
  HOUSE: '🏠',
  ITEM: '📦',
  USER: '👤',
  ADMIN: '👑',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',
  AUCTION: '🔨',
  BANK: '🏦',
  GOVERNMENT: '🏛️',
  GAME: '🎮',
  GIFT: '🎁',
  TAX: '📋',
  JOB: '💼',
} as const;

// ==================== 상태 색상 ====================
export const STATUS_COLORS = {
  SUCCESS: 'text-green-500',
  ERROR: 'text-red-500',
  WARNING: 'text-yellow-500',
  INFO: 'text-blue-500',
  NEUTRAL: 'text-gray-500',
} as const;

// ==================== 애니메이션 시간 ====================
export const ANIMATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  TOAST_DURATION: 3500,
  MODAL_DURATION: 200,
} as const;

// ==================== 로컬 스토리지 키 ====================
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PREFERENCES: 'user_preferences',
  THEME: 'theme',
  LANGUAGE: 'language',
  CACHE_PREFIX: 'cache_',
  LAST_SYNC: 'last_sync',
} as const;

// 타입 내보내기
export type LimitKey = keyof typeof LIMITS;
export type CacheTTLKey = keyof typeof CACHE_TTL;
export type TaxRateKey = keyof typeof TAX_RATES;
export type RouteKey = keyof typeof ROUTES;
export type CollectionKey = keyof typeof COLLECTIONS;
