// src/utils/levelSystem.js - 순자산 기반 레벨/칭호 시스템 (고급 버전)

/**
 * 순자산 기반 레벨 및 칭호 시스템
 * 레벨은 순자산에 따라 자동으로 결정됩니다.
 * 1천만원부터 시작하여 1조까지 12단계로 구성
 */

export const LEVEL_THRESHOLDS = [
  {
    level: 0,
    minAssets: 0,
    title: "경제 입문자",
    icon: "🌱",
    color: "#6b7280",
    badge: "🏅",
    description: "경제 여정의 시작"
  },
  {
    level: 1,
    minAssets: 10000000, // 1천만원
    title: "천만장자",
    icon: "💰",
    color: "#22c55e",
    badge: "🥉",
    description: "첫 천만원 달성!"
  },
  {
    level: 2,
    minAssets: 50000000, // 5천만원
    title: "오천만 클럽",
    icon: "💵",
    color: "#84cc16",
    badge: "🥈",
    description: "반억 돌파!"
  },
  {
    level: 3,
    minAssets: 100000000, // 1억
    title: "억대 자산가",
    icon: "💎",
    color: "#eab308",
    badge: "🥇",
    description: "억대 자산 보유자"
  },
  {
    level: 4,
    minAssets: 200000000, // 2억
    title: "자산 관리사",
    icon: "📊",
    color: "#f97316",
    badge: "🏆",
    description: "2억 자산 달성"
  },
  {
    level: 5,
    minAssets: 300000000, // 3억
    title: "투자 전문가",
    icon: "📈",
    color: "#ef4444",
    badge: "💫",
    description: "3억 고지 점령"
  },
  {
    level: 6,
    minAssets: 500000000, // 5억
    title: "부동산 왕",
    icon: "🏢",
    color: "#ec4899",
    badge: "⭐",
    description: "5억 자산가"
  },
  {
    level: 7,
    minAssets: 1000000000, // 10억
    title: "10억 클럽",
    icon: "👑",
    color: "#a855f7",
    badge: "🌟",
    description: "10억 돌파! 진정한 부자"
  },
  {
    level: 8,
    minAssets: 5000000000, // 50억
    title: "경제 거물",
    icon: "🦁",
    color: "#8b5cf6",
    badge: "💎",
    description: "50억 자산의 거물"
  },
  {
    level: 9,
    minAssets: 10000000000, // 100억
    title: "100억 재벌",
    icon: "🐉",
    color: "#6366f1",
    badge: "👑",
    description: "100억! 재벌의 반열"
  },
  {
    level: 10,
    minAssets: 50000000000, // 500억
    title: "경제 황제",
    icon: "🏰",
    color: "#3b82f6",
    badge: "🏯",
    description: "500억 경제 황제"
  },
  {
    level: 11,
    minAssets: 100000000000, // 1000억
    title: "천억 타이쿤",
    icon: "🌍",
    color: "#0ea5e9",
    badge: "🌍",
    description: "1000억! 글로벌 타이쿤"
  },
  {
    level: 12,
    minAssets: 1000000000000, // 1조
    title: "알찬 전설",
    icon: "🌌",
    color: "var(--accent)",
    badge: "🌌",
    description: "1조 달성! 전설이 되다"
  },
];

/**
 * 순자산을 기반으로 레벨 정보를 반환합니다.
 * @param {number} netAssets - 순자산 금액
 * @returns {{ level: number, title: string, icon: string, color: string, progress: number, nextLevel: object|null }}
 */
export function getLevelInfo(netAssets) {
  const assets = Number(netAssets) || 0;

  // 현재 레벨 찾기 (역순으로 탐색)
  let currentLevelData = LEVEL_THRESHOLDS[0];
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (assets >= LEVEL_THRESHOLDS[i].minAssets) {
      currentLevelData = LEVEL_THRESHOLDS[i];
      break;
    }
  }

  // 다음 레벨 찾기
  const nextLevelIndex = LEVEL_THRESHOLDS.findIndex(l => l.level === currentLevelData.level + 1);
  const nextLevel = nextLevelIndex !== -1 ? LEVEL_THRESHOLDS[nextLevelIndex] : null;

  // 진행도 계산 (다음 레벨까지의 %)
  let progress = 100;
  if (nextLevel) {
    const currentMin = currentLevelData.minAssets;
    const nextMin = nextLevel.minAssets;
    progress = Math.min(100, Math.floor(((assets - currentMin) / (nextMin - currentMin)) * 100));
  }

  return {
    level: currentLevelData.level,
    title: currentLevelData.title,
    icon: currentLevelData.icon,
    color: currentLevelData.color,
    badge: currentLevelData.badge,
    description: currentLevelData.description,
    progress,
    nextLevel,
    currentAssets: assets,
    assetsToNextLevel: nextLevel ? nextLevel.minAssets - assets : 0,
  };
}

/**
 * 레벨 배지 컴포넌트용 스타일 생성
 * @param {string} color - 레벨 색상
 * @returns {object} CSS 스타일 객체
 */
export function getLevelBadgeStyle(color) {
  return {
    background: `linear-gradient(135deg, ${color}20 0%, ${color}40 100%)`,
    border: `2px solid ${color}`,
    color: color,
    padding: "4px 12px",
    borderRadius: "20px",
    fontWeight: "700",
    fontSize: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: `0 0 12px ${color}40`,
  };
}

/**
 * 레벨업 축하 메시지 생성
 * @param {number} newLevel - 새로운 레벨
 * @param {string} newTitle - 새로운 칭호
 * @returns {string} 축하 메시지
 */
export function getLevelUpMessage(newLevel, newTitle) {
  return `🎉 축하합니다! 레벨 ${newLevel} "${newTitle}"에 도달했습니다!`;
}

/**
 * 경험치/순자산 포맷팅 (한국식 단위)
 * @param {number} amount - 금액
 * @returns {string} 포맷된 문자열
 */
export function formatAssetsShort(amount) {
  if (amount >= 1000000000000) {
    return `${(amount / 1000000000000).toFixed(1)}조`;
  } else if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}억`;
  } else if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}만`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}천`;
  }
  return amount.toLocaleString();
}

/**
 * 전체 레벨 목록 가져오기
 */
export function getAllLevels() {
  return LEVEL_THRESHOLDS;
}
