// src/utils/achievementSystem.js - 업적/배지 시스템

/**
 * 업적 배지 시스템
 * 다양한 활동과 마일스톤에 대한 배지를 부여합니다.
 */

// 화폐 단위는 학급 설정을 따르므로(기본 "알찬") 상수 객체에서도 getter로 지연 평가한다.
import { getCurrencyUnit } from './numberFormatter';
const ACHIEVEMENTS = {
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
  // 🏦 통장·목표·투자 — 2026-11-11 실사용 집계에서 잘 안 쓰이던 기능으로 이끄는 배지
  FIRST_PARKING: {
    id: "first_parking",
    name: "통장 주인",
    description: "파킹통장에 돈 넣어 두기",
    icon: "🏦",
    category: "saving",
    condition: (stats) => stats.parkingBalance > 0,
    rarity: "common",
    points: 15,
  },
  GOAL_SETTER: {
    id: "goal_setter",
    name: "목표가 있는 사람",
    description: "저축 목표 정하기",
    icon: "🎯",
    category: "saving",
    condition: (stats) => stats.goalSet === true,
    rarity: "common",
    points: 15,
  },
  GOAL_ACHIEVER: {
    id: "goal_achiever",
    name: "목표 달성",
    description: "저축 목표만큼 통장에 모으기",
    icon: "🏆",
    category: "saving",
    condition: (stats) => stats.goalDone === true,
    rarity: "rare",
    points: 100,
  },
  FIRST_STOCK: {
    id: "first_stock",
    name: "꼬마 투자자",
    description: "주식 한 주 이상 갖기",
    icon: "📈",
    category: "trading",
    condition: (stats) => stats.stockValue > 0,
    rarity: "uncommon",
    points: 30,
  },
  // 🧠 오늘의 경제 퀴즈
  QUIZ_STARTER: {
    id: "quiz_starter",
    name: "퀴즈 첫걸음",
    description: "경제 퀴즈 1문제 맞히기",
    icon: "🧠",
    category: "special",
    condition: (stats) => stats.quizCorrect >= 1,
    rarity: "common",
    points: 10,
  },
  QUIZ_TEN: {
    id: "quiz_ten",
    name: "경제 박사",
    description: "경제 퀴즈 10문제 맞히기",
    icon: "🎓",
    category: "special",
    condition: (stats) => stats.quizCorrect >= 10,
    rarity: "rare",
    points: 80,
  },
  QUIZ_STREAK: {
    id: "quiz_streak",
    name: "꾸준한 공부",
    description: "경제 퀴즈 5일 이어서 풀기",
    icon: "🔥",
    category: "special",
    condition: (stats) => stats.quizStreak >= 5,
    rarity: "uncommon",
    points: 40,
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


const RARITY_ORDER = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

/**
 * 지금 상태(stats)로 딴 배지와 아직 못 딴 배지를 가른다. **저장하지 않는다** — 열 때마다 다시 계산한다.
 *
 * 왜 저장을 없앴나(2026-11-11 전수 점검): 예전에는 localStorage 에서 «딴 배지 목록»을 읽기만 하고
 * 그 목록을 **쓰는 코드가 어디에도 없었다**. 그래서 프로필의 «최고 업적»은 한 번도 뜬 적이 없다.
 * 조건이 전부 현재 상태(자산·쿠폰·보유 상품)로 판정되니, 저장 없이 그때그때 계산하면 기기를 바꿔도 같다.
 *
 * @param {object} stats { totalAssets, coupons, savingProducts, properties, parkingBalance, stockValue, goalSet, goalDone, … }
 *   모르는 값은 넣지 않는다(undefined 는 어떤 조건도 통과하지 못한다).
 * @return {{earned: object[], locked: object[], points: number, best: object|null}} earned 는 귀한 순
 */
export function evaluateAchievements(stats) {
  const st = stats && typeof stats === "object" ? stats : {};
  const all = Object.values(ACHIEVEMENTS);
  const pass = (a) => {
    try { return a.condition(st) === true; } catch { return false; }
  };
  const earned = all.filter(pass).sort((a, b) => (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0) || b.points - a.points);
  const earnedIds = new Set(earned.map((a) => a.id));
  // 수동 부여(조건이 늘 false)인 것은 «다음 목표»로 보여 주지 않는다.
  const locked = all.filter((a) => !earnedIds.has(a.id) && a.id !== "early_bird");
  return { earned, locked, points: earned.reduce((s, a) => s + a.points, 0), best: earned[0] || null };
}
