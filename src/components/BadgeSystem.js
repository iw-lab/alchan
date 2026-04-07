// src/components/BadgeSystem.js
// 성취 배지 시스템

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  Trophy,
  Star,
  Target,
  Coins,
  Users,
  Gamepad2,
  BookOpen,
  TrendingUp,
  Award,
} from "lucide-react";
import { logger } from "../utils/logger";

// 배지 정의
export const BADGES = {
  // 경제 활동
  firstCash: {
    id: "firstCash",
    name: "첫 수입",
    description: "처음으로 돈을 벌었어요!",
    icon: Coins,
    color: "from-amber-400 to-orange-500",
    condition: (stats) => stats.totalEarned > 0,
  },
  saver100: {
    id: "saver100",
    name: "저축왕 동",
    description: "100원 이상 저축했어요",
    icon: Coins,
    color: "from-amber-600 to-yellow-500",
    condition: (stats) => stats.totalSaved >= 100,
  },
  saver1000: {
    id: "saver1000",
    name: "저축왕 은",
    description: "1,000원 이상 저축했어요",
    icon: Coins,
    color: "from-gray-400 to-gray-500",
    condition: (stats) => stats.totalSaved >= 1000,
  },
  saver10000: {
    id: "saver10000",
    name: "저축왕 금",
    description: "10,000원 이상 저축했어요",
    icon: Trophy,
    color: "from-yellow-400 to-amber-500",
    condition: (stats) => stats.totalSaved >= 10000,
  },

  // 거래 활동
  firstTrade: {
    id: "firstTrade",
    name: "거래 시작",
    description: "첫 거래를 완료했어요!",
    icon: TrendingUp,
    color: "from-blue-400 to-cyan-500",
    condition: (stats) => stats.totalTrades > 0,
  },
  trader10: {
    id: "trader10",
    name: "활발한 거래자",
    description: "10회 이상 거래했어요",
    icon: TrendingUp,
    color: "from-blue-500 to-indigo-600",
    condition: (stats) => stats.totalTrades >= 10,
  },

  // 게임 활동
  gameWinner: {
    id: "gameWinner",
    name: "게임 승리자",
    description: "게임에서 처음 이겼어요!",
    icon: Gamepad2,
    color: "from-purple-400 to-pink-500",
    condition: (stats) => stats.gamesWon > 0,
  },
  gamemaster: {
    id: "gamemaster",
    name: "게임 마스터",
    description: "10회 이상 게임에서 승리했어요",
    icon: Gamepad2,
    color: "from-purple-500 to-violet-600",
    condition: (stats) => stats.gamesWon >= 10,
  },

  // 학습 활동
  firstTask: {
    id: "firstTask",
    name: "할일 완료",
    description: "첫 할일을 완료했어요!",
    icon: Target,
    color: "from-green-400 to-emerald-500",
    condition: (stats) => stats.tasksCompleted > 0,
  },
  taskMaster: {
    id: "taskMaster",
    name: "할일 마스터",
    description: "10개 이상 할일을 완료했어요",
    icon: Target,
    color: "from-green-500 to-teal-600",
    condition: (stats) => stats.tasksCompleted >= 10,
  },

  // 사회 활동
  helper: {
    id: "helper",
    name: "도움이",
    description: "다른 친구를 도와줬어요!",
    icon: Users,
    color: "from-pink-400 to-rose-500",
    condition: (stats) => stats.helpCount > 0,
  },
  donor: {
    id: "donor",
    name: "기부 천사",
    description: "학급 목표에 기부했어요",
    icon: Star,
    color: "from-rose-400 to-red-500",
    condition: (stats) => stats.donationCount > 0,
  },

  // 출석
  streak7: {
    id: "streak7",
    name: "일주일 연속 출석",
    description: "7일 연속으로 로그인했어요",
    icon: Award,
    color: "from-indigo-400 to-violet-500",
    condition: (stats) => stats.loginStreak >= 7,
  },
  streak30: {
    id: "streak30",
    name: "한 달 연속 출석",
    description: "30일 연속으로 로그인했어요",
    icon: Trophy,
    color: "from-violet-500 to-purple-600",
    condition: (stats) => stats.loginStreak >= 30,
  },

  // 특별
  explorer: {
    id: "explorer",
    name: "탐험가",
    description: "모든 메뉴를 방문했어요",
    icon: BookOpen,
    color: "from-cyan-400 to-blue-500",
    condition: (stats) => stats.menusVisited >= 10,
  },
};

// 배지 체크 및 획득 함수
export async function checkAndAwardBadges(userId, stats) {
  if (!userId || !stats) return [];

  try {
    const badgeRef = doc(db, "users", userId, "badges", "earned");
    const badgeDoc = await getDoc(badgeRef);
    const earnedBadges = badgeDoc.exists() ? badgeDoc.data().badges || [] : [];

    const newBadges = [];

    for (const [badgeId, badge] of Object.entries(BADGES)) {
      if (!earnedBadges.includes(badgeId) && badge.condition(stats)) {
        newBadges.push(badgeId);
      }
    }

    if (newBadges.length > 0) {
      const allBadges = [...earnedBadges, ...newBadges];
      await setDoc(
        badgeRef,
        {
          badges: allBadges,
          lastUpdated: serverTimestamp(),
        },
        { merge: true },
      );
    }

    return newBadges;
  } catch (error) {
    logger.error("배지 체크 오류:", error);
    return [];
  }
}

// 배지 아이콘 컴포넌트
export function BadgeIcon({
  badge,
  size = "md",
  earned = true,
  showTooltip = true,
}) {
  const [showInfo, setShowInfo] = useState(false);
  const Icon = badge.icon;

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
    xl: "w-20 h-20",
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 32,
    xl: 40,
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => showTooltip && setShowInfo(!showInfo)}
        className={`
          ${sizeClasses[size]} rounded-full flex items-center justify-center
          transition-all duration-300 transform hover:scale-110
          ${
            earned
              ? `bg-gradient-to-br ${badge.color} shadow-lg`
              : "bg-gray-700"
          }
        `}
      >
        <Icon
          size={iconSizes[size]}
          className={earned ? "text-slate-800 dark:text-white" : "text-gray-500"}
        />
      </button>

      {/* 툴팁 */}
      {showInfo && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-gray-800 rounded-xl shadow-xl border border-gray-700 z-50">
          <h4 className="font-bold text-slate-800 dark:text-white text-sm">{badge.name}</h4>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{badge.description}</p>
          {!earned && (
            <p className="text-xs text-amber-400 mt-2 font-medium">
              아직 획득하지 못했어요
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// 배지 목록 컴포넌트
export function BadgeList({
  earnedBadges = [],
  showAll = false,
  className = "",
}) {
  const badges = showAll
    ? Object.values(BADGES)
    : Object.values(BADGES).filter((b) => earnedBadges.includes(b.id));

  if (badges.length === 0) {
    return (
      <div className={`text-center py-8 text-slate-500 dark:text-gray-400 ${className}`}>
        아직 획득한 배지가 없어요. 활동을 통해 배지를 모아보세요!
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 ${className}`}
    >
      {badges.map((badge) => (
        <div key={badge.id} className="flex flex-col items-center gap-1">
          <BadgeIcon
            badge={badge}
            size="md"
            earned={earnedBadges.includes(badge.id)}
          />
          <span className="text-xs text-slate-500 dark:text-gray-400 text-center truncate w-full">
            {badge.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// 새 배지 획득 알림 모달
export function NewBadgeModal({ badges = [], onClose }) {
  if (badges.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-3xl p-6 max-w-sm w-full animate-bounce-in">
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">새 배지 획득!</h2>
          <p className="text-slate-500 dark:text-gray-400 mb-6">
            축하해요! 새로운 배지를 획득했어요!
          </p>

          <div className="flex justify-center gap-4 mb-6">
            {badges.map((badgeId) => {
              const badge = BADGES[badgeId];
              if (!badge) return null;
              return (
                <div key={badgeId} className="flex flex-col items-center gap-2">
                  <BadgeIcon
                    badge={badge}
                    size="lg"
                    earned
                    showTooltip={false}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-white">
                    {badge.name}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// 배지 훅
export function useBadges() {
  const { user, userDoc } = useAuth();
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [newBadges, setNewBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  // 배지 로드
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const loadBadges = async () => {
      try {
        const badgeRef = doc(db, "users", user.uid, "badges", "earned");
        const badgeDoc = await getDoc(badgeRef);
        if (badgeDoc.exists()) {
          setEarnedBadges(badgeDoc.data().badges || []);
        }
      } catch (error) {
        logger.error("배지 로드 오류:", error);
      } finally {
        setLoading(false);
      }
    };

    loadBadges();
  }, [user?.uid]);

  // 배지 체크
  const checkBadges = useCallback(
    async (stats) => {
      if (!user?.uid) return;

      const awarded = await checkAndAwardBadges(user.uid, stats);
      if (awarded.length > 0) {
        setNewBadges(awarded);
        setEarnedBadges((prev) => [...prev, ...awarded]);
      }
    },
    [user?.uid],
  );

  const dismissNewBadges = useCallback(() => {
    setNewBadges([]);
  }, []);

  return {
    earnedBadges,
    newBadges,
    loading,
    checkBadges,
    dismissNewBadges,
    totalBadges: Object.keys(BADGES).length,
  };
}

export default BadgeList;
