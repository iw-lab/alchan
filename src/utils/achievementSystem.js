// src/utils/achievementSystem.js - 업적/배지 시스템

/**
 * 업적 배지 시스템
 * 다양한 활동과 마일스톤에 대한 배지를 부여합니다.
 */

import { logger } from './logger';
// 화폐 단위는 학급 설정을 따르므로(기본 "알찬") 상수 객체에서도 getter로 지연 평가한다.
import { getCurrencyUnit } from './numberFormatter';
export const ACHIEVEMENTS = {
  // 자산 관련 업적
  FIRST_THOUSAND: {
    id: "first_thousand",
    get name() { return `첫 천 ${getCurrencyUnit()}`; },
    get description() { return `1,000${getCurrencyUnit()} 이상 보유하기`; },
    icon: "🪙",
    category: "wealth",
    condition: (stats) => stats.totalAssets >= 1000,
    rarity: "common",
    points: 10,
  },
  FIRST_TEN_THOUSAND: {
    id: "first_ten_thousand",
    get name() { return `만 ${getCurrencyUnit()}의 기쁨`; },
    get description() { return `10,000${getCurrencyUnit()} 이상 보유하기`; },
    icon: "💵",
    category: "wealth",
    condition: (stats) => stats.totalAssets >= 10000,
    rarity: "common",
    points: 25,
  },
  HUNDRED_THOUSAND: {
    id: "hundred_thousand",
    get name() { return `10만 ${getCurrencyUnit()} 클럽`; },
    get description() { return `100,000${getCurrencyUnit()} 이상 보유하기`; },
    icon: "💰",
    category: "wealth",
    condition: (stats) => stats.totalAssets >= 100000,
    rarity: "uncommon",
    points: 50,
  },
  MILLIONAIRE: {
    id: "millionaire",
    name: "백만장자",
    get description() { return `1,000,000${getCurrencyUnit()} 이상 보유하기`; },
    icon: "🤑",
    category: "wealth",
    condition: (stats) => stats.totalAssets >= 1000000,
    rarity: "rare",
    points: 100,
  },
  MULTI_MILLIONAIRE: {
    id: "multi_millionaire",
    name: "천만장자",
    get description() { return `10,000,000${getCurrencyUnit()} 이상 보유하기`; },
    icon: "💎",
    category: "wealth",
    condition: (stats) => stats.totalAssets >= 10000000,
    rarity: "legendary",
    points: 500,
  },

  // 쿠폰 관련 업적
  COUPON_COLLECTOR: {
    id: "coupon_collector",
    name: "쿠폰 수집가",
    description: "쿠폰 10개 이상 보유하기",
    icon: "🎟️",
    category: "coupon",
    condition: (stats) => stats.coupons >= 10,
    rarity: "common",
    points: 15,
  },
  COUPON_MASTER: {
    id: "coupon_master",
    name: "쿠폰 마스터",
    description: "쿠폰 50개 이상 보유하기",
    icon: "🎫",
    category: "coupon",
    condition: (stats) => stats.coupons >= 50,
    rarity: "uncommon",
    points: 40,
  },
  COUPON_HOARDER: {
    id: "coupon_hoarder",
    name: "쿠폰 부자",
    description: "쿠폰 100개 이상 보유하기",
    icon: "🏷️",
    category: "coupon",
    condition: (stats) => stats.coupons >= 100,
    rarity: "rare",
    points: 80,
  },

  // 거래 관련 업적
  FIRST_TRADE: {
    id: "first_trade",
    name: "첫 거래",
    description: "첫 번째 거래 완료하기",
    icon: "🤝",
    category: "trading",
    condition: (stats) => stats.totalTransactions >= 1,
    rarity: "common",
    points: 10,
  },
  ACTIVE_TRADER: {
    id: "active_trader",
    name: "활발한 거래자",
    description: "10회 이상 거래하기",
    icon: "📊",
    category: "trading",
    condition: (stats) => stats.totalTransactions >= 10,
    rarity: "common",
    points: 25,
  },
  TRADING_EXPERT: {
    id: "trading_expert",
    name: "거래 전문가",
    description: "50회 이상 거래하기",
    icon: "📈",
    category: "trading",
    condition: (stats) => stats.totalTransactions >= 50,
    rarity: "uncommon",
    points: 50,
  },

  // 기부 관련 업적
  GENEROUS_HEART: {
    id: "generous_heart",
    name: "따뜻한 마음",
    description: "학급 목표에 처음으로 기부하기",
    icon: "❤️",
    category: "donation",
    condition: (stats) => stats.totalDonations >= 1,
    rarity: "common",
    points: 20,
  },
  PHILANTHROPIST: {
    id: "philanthropist",
    name: "자선가",
    description: "총 10개 이상 기부하기",
    icon: "🎁",
    category: "donation",
    condition: (stats) => stats.totalDonations >= 10,
    rarity: "uncommon",
    points: 50,
  },
  DONATION_KING: {
    id: "donation_king",
    name: "기부왕",
    description: "총 100개 이상 기부하기",
    icon: "👑",
    category: "donation",
    condition: (stats) => stats.totalDonations >= 100,
    rarity: "rare",
    points: 150,
  },

  // 저축 관련 업적
  SAVER_BEGINNER: {
    id: "saver_beginner",
    name: "저축의 시작",
    description: "첫 예금 또는 적금 가입하기",
    icon: "🏦",
    category: "saving",
    condition: (stats) => stats.savingProducts >= 1,
    rarity: "common",
    points: 15,
  },
  SMART_SAVER: {
    id: "smart_saver",
    name: "똑똑한 저축러",
    description: "예금/적금 3개 이상 가입하기",
    icon: "💳",
    category: "saving",
    condition: (stats) => stats.savingProducts >= 3,
    rarity: "uncommon",
    points: 40,
  },

  // 부동산 관련 업적
  FIRST_PROPERTY: {
    id: "first_property",
    name: "첫 부동산",
    description: "첫 번째 부동산 구매하기",
    icon: "🏠",
    category: "realestate",
    condition: (stats) => stats.properties >= 1,
    rarity: "common",
    points: 30,
  },
  REAL_ESTATE_INVESTOR: {
    id: "real_estate_investor",
    name: "부동산 투자자",
    description: "부동산 3개 이상 보유하기",
    icon: "🏢",
    category: "realestate",
    condition: (stats) => stats.properties >= 3,
    rarity: "uncommon",
    points: 70,
  },
  PROPERTY_TYCOON: {
    id: "property_tycoon",
    name: "부동산 재벌",
    description: "부동산 5개 이상 보유하기",
    icon: "🏰",
    category: "realestate",
    condition: (stats) => stats.properties >= 5,
    rarity: "rare",
    points: 150,
  },

  // 특별 업적
  PERFECT_ATTENDANCE: {
    id: "perfect_attendance",
    name: "개근상",
    description: "7일 연속 접속하기",
    icon: "📅",
    category: "special",
    condition: (stats) => stats.loginStreak >= 7,
    rarity: "uncommon",
    points: 100,
  },
  MONTHLY_STREAK: {
    id: "monthly_streak",
    name: "한 달 출석왕",
    description: "30일 연속 접속하기",
    icon: "🗓️",
    category: "special",
    condition: (stats) => stats.loginStreak >= 30,
    rarity: "rare",
    points: 300,
  },
  EARLY_BIRD: {
    id: "early_bird",
    name: "얼리버드",
    description: "서비스 초기 사용자",
    icon: "🐦",
    category: "special",
    condition: () => false, // 수동으로 부여
    rarity: "legendary",
    points: 200,
  },
};

export const RARITY_COLORS = {
  common: { color: "#9ca3af", bg: "#374151", label: "일반" },
  uncommon: { color: "#22c55e", bg: "#14532d", label: "희귀" },
  rare: { color: "#3b82f6", bg: "#1e3a8a", label: "레어" },
  epic: { color: "#a855f7", bg: "#581c87", label: "에픽" },
  legendary: { color: "#f59e0b", bg: "#78350f", label: "전설" },
};

export const CATEGORIES = {
  wealth: { name: "자산", icon: "💰" },
  coupon: { name: "쿠폰", icon: "🎟️" },
  trading: { name: "거래", icon: "📊" },
  donation: { name: "기부", icon: "❤️" },
  saving: { name: "저축", icon: "🏦" },
  realestate: { name: "부동산", icon: "🏠" },
  special: { name: "특별", icon: "⭐" },
};

/**
 * 사용자 통계를 기반으로 달성한 업적 목록을 반환합니다.
 * @param {object} userStats - 사용자 통계
 * @returns {Array} 달성한 업적 목록
 */
export function getUnlockedAchievements(userStats) {
  const stats = {
    totalAssets: userStats.totalAssets || 0,
    coupons: userStats.coupons || 0,
    totalTransactions: userStats.totalTransactions || 0,
    totalDonations: userStats.totalDonations || 0,
    savingProducts: userStats.savingProducts || 0,
    properties: userStats.properties || 0,
    loginStreak: userStats.loginStreak || 0,
    ...userStats,
  };

  return Object.values(ACHIEVEMENTS).filter(
    (achievement) => achievement.condition(stats)
  );
}

/**
 * 전체 업적 진행도 계산
 * @param {object} userStats - 사용자 통계
 * @returns {{ unlocked: number, total: number, percentage: number, points: number }}
 */
export function getAchievementProgress(userStats) {
  const unlockedAchievements = getUnlockedAchievements(userStats);
  const totalAchievements = Object.keys(ACHIEVEMENTS).length;
  const totalPoints = unlockedAchievements.reduce((sum, a) => sum + a.points, 0);

  return {
    unlocked: unlockedAchievements.length,
    total: totalAchievements,
    percentage: Math.round((unlockedAchievements.length / totalAchievements) * 100),
    points: totalPoints,
  };
}

/**
 * 카테고리별 업적 그룹화
 * @param {object} userStats - 사용자 통계
 * @returns {object} 카테고리별 업적 그룹
 */
export function getAchievementsByCategory(userStats) {
  const unlockedIds = new Set(
    getUnlockedAchievements(userStats).map((a) => a.id)
  );

  const grouped = {};
  for (const [category, info] of Object.entries(CATEGORIES)) {
    grouped[category] = {
      ...info,
      achievements: Object.values(ACHIEVEMENTS)
        .filter((a) => a.category === category)
        .map((a) => ({
          ...a,
          unlocked: unlockedIds.has(a.id),
        })),
    };
  }

  return grouped;
}

/**
 * ID로 업적 정보를 찾습니다.
 * @param {string} achievementId - 업적 ID
 * @returns {object|null} 업적 정보 또는 null
 */
export function getAchievementById(achievementId) {
  return Object.values(ACHIEVEMENTS).find((a) => a.id === achievementId) || null;
}

/**
 * 사용자의 획득한 업적 목록을 로컬 스토리지에서 가져옵니다.
 * @param {string} userId - 사용자 ID
 * @returns {Array} 획득한 업적 목록 [{id, unlockedAt}, ...]
 */
export function getUserAchievements(userId) {
  if (!userId) return [];
  try {
    const key = `alchan_achievements_${userId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    logger.error("업적 데이터 로드 실패:", error);
    return [];
  }
}

/**
 * 사용자에게 업적을 부여합니다.
 * @param {string} userId - 사용자 ID
 * @param {string} achievementId - 업적 ID
 * @returns {boolean} 새로 부여된 경우 true
 */
export function grantAchievement(userId, achievementId) {
  if (!userId || !achievementId) return false;

  try {
    const key = `alchan_achievements_${userId}`;
    const achievements = getUserAchievements(userId);

    // 이미 획득한 경우 false 반환
    if (achievements.some((a) => a.id === achievementId)) {
      return false;
    }

    // 새 업적 추가
    achievements.push({
      id: achievementId,
      unlockedAt: new Date().toISOString(),
    });

    localStorage.setItem(key, JSON.stringify(achievements));
    return true;
  } catch (error) {
    logger.error("업적 부여 실패:", error);
    return false;
  }
}

/**
 * 사용자 통계를 기반으로 업적을 자동으로 체크하고 부여합니다.
 * @param {string} userId - 사용자 ID
 * @param {object} userStats - 사용자 통계
 * @returns {Array} 새로 획득한 업적 목록
 */
export function checkAndGrantAchievements(userId, userStats) {
  if (!userId) return [];

  const newAchievements = [];
  const unlockedAchievements = getUnlockedAchievements(userStats);

  for (const achievement of unlockedAchievements) {
    if (grantAchievement(userId, achievement.id)) {
      newAchievements.push(achievement);
    }
  }

  return newAchievements;
}
