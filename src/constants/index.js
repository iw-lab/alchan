// src/constants/index.js
// 프로젝트 전역 상수

// 통화 관련
export const CURRENCY = {
  SYMBOL: '원',
  CODE: 'KRW',
};

// 쿠폰 관련
export const COUPON = {
  UNIT: '개',
  DEFAULT_PRICE: 1000,
};

// 은행 관련
export const BANK = {
  INTEREST_RATE: 0.05, // 기본 이자율 5%
  MIN_DEPOSIT: 1000, // 최소 예금액
  MAX_DEPOSIT: 100000000, // 최대 예금액 (1억)
  PARKING_RATE: 0.02, // 주차 계좌 이자율 2%
};

// 세금 관련
export const TAX = {
  INCOME_RATE: 0.1, // 소득세 10%
  TRANSACTION_RATE: 0.01, // 거래세 1%
  STOCK_GAIN_RATE: 0.15, // 주식 양도소득세 15%
};

// 게임 관련
export const GAME = {
  OMOK: {
    BOARD_SIZE: 15,
    WIN_COUNT: 5,
  },
  CHESS: {
    BOARD_SIZE: 8,
  },
  TYPING: {
    TIME_LIMIT: 60, // 초
    MIN_WPM: 10,
  },
};

// 페이지네이션
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
};

// 캐시 TTL (밀리초)
export const CACHE_TTL = {
  USER_DATA: 30 * 60 * 1000, // 30분
  STOCK_DATA: 5 * 60 * 1000, // 5분
  ITEM_LIST: 60 * 60 * 1000, // 1시간
  CLASS_DATA: 24 * 60 * 60 * 1000, // 24시간
};

// 사용자 역할
export const USER_ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superAdmin',
};

// 아이템 카테고리
export const ITEM_CATEGORIES = {
  FOOD: 'food',
  ACCESSORY: 'accessory',
  TICKET: 'ticket',
  SPECIAL: 'special',
};

// API 에러 메시지
export const ERROR_MESSAGES = {
  PERMISSION_DENIED: '권한이 없습니다.',
  NOT_FOUND: '데이터를 찾을 수 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RESOURCE_EXHAUSTED: '일시적인 오류입니다. 잠시 후 다시 시도해주세요.',
  INSUFFICIENT_BALANCE: '잔액이 부족합니다.',
  INVALID_INPUT: '입력값이 올바르지 않습니다.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다.',
  UNKNOWN: '오류가 발생했습니다. 관리자에게 문의하세요.',
};

// 라우트 경로
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard/tasks',
  MY_PROFILE: '/my-profile',
  MY_ASSETS: '/my-assets',
  MY_ITEMS: '/my-items',
  BANKING: '/banking',
  STOCK_TRADING: '/stock-trading',
  ITEM_SHOP: '/item-shop',
  ITEM_MARKET: '/item-market',
  AUCTION: '/auction',
  GOVERNMENT: '/government',
  COURT: '/court',
  POLICE: '/police',
  NATIONAL_ASSEMBLY: '/national-assembly',
  LEARNING_BOARD: '/learning-board',
  MUSIC_ROOM: '/music-room',
  ADMIN: {
    ITEMS: '/admin/items',
    USERS: '/admin/students',
    SETTINGS: '/admin/app-settings',
    DATABASE: '/admin/activity-log',
  },
};

// 전체 화면 필요 페이지
export const FULLSCREEN_PAGES = [
  '/learning-games/omok',
  '/learning-games/science',
  '/learning-games/typing',
  '/auction',
  '/court',
  '/national-assembly',
  '/music-room',
];
