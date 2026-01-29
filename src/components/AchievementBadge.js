// src/components/AchievementBadge.js - 업적 배지 컴포넌트
import React, { useState } from "react";
import {
  getUnlockedAchievements,
  getAchievementProgress,
  getAchievementsByCategory,
  RARITY_COLORS,
  CATEGORIES,
} from "../utils/achievementSystem";

/**
 * 업적 배지 표시 컴포넌트
 */
export function AchievementBadge({ achievement, unlocked = true, size = "normal" }) {
  const rarity = RARITY_COLORS[achievement.rarity];
  const isSmall = size === "small";

  return (
    <div
      className="flex flex-col items-center rounded-xl cursor-pointer transition-all"
      style={{
        padding: isSmall ? "8px" : "12px",
        background: unlocked
          ? `linear-gradient(135deg, ${rarity.bg} 0%, ${rarity.bg}dd 100%)`
          : "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
        border: `2px solid ${unlocked ? rarity.color : "#374151"}`,
        opacity: unlocked ? 1 : 0.5,
        minWidth: isSmall ? "60px" : "80px",
      }}
      title={`${achievement.name}: ${achievement.description}`}
    >
      <div
        className="mb-1"
        style={{
          fontSize: isSmall ? "24px" : "32px",
          filter: unlocked ? "none" : "grayscale(100%)",
        }}
      >
        {achievement.icon}
      </div>
      {!isSmall && (
        <>
          <div
            className="text-center font-semibold"
            style={{
              fontSize: "11px",
              color: unlocked ? rarity.color : "#6b7280",
              lineHeight: "1.2",
            }}
          >
            {achievement.name}
          </div>
          <div
            className="mt-0.5 px-1.5 py-0.5 rounded-lg"
            style={{
              fontSize: "9px",
              color: unlocked ? rarity.color : "#4b5563",
              background: unlocked ? `${rarity.color}20` : "transparent",
            }}
          >
            +{achievement.points}pt
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 업적 진행 상황 요약 컴포넌트
 */
export function AchievementSummary({ userStats, onClick }) {
  const progress = getAchievementProgress(userStats);
  const unlockedAchievements = getUnlockedAchievements(userStats);

  // 가장 최근 달성한 3개의 업적 표시
  const recentAchievements = unlockedAchievements.slice(-3).reverse();

  return (
    <div
      onClick={onClick}
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        border: "2px solid #a78bfa40",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 4px 20px rgba(167, 139, 250, 0.1)",
      }}
    >
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="text-sm font-semibold" style={{ color: "#e8e8ff" }}>
            업적
          </span>
        </div>
        <div className="text-sm font-semibold" style={{ color: "#a78bfa" }}>
          {progress.points} pt
        </div>
      </div>

      {/* 진행 바 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "#9ca3af" }}>
          <span>달성 진행도</span>
          <span>{progress.unlocked} / {progress.total}</span>
        </div>
        <div className="h-1.5 rounded overflow-hidden" style={{ backgroundColor: "#374151" }}>
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${progress.percentage}%`,
              background: "linear-gradient(90deg, #a78bfa 0%, #c4b5fd 100%)",
            }}
          />
        </div>
      </div>

      {/* 최근 달성 업적 */}
      {recentAchievements.length > 0 && (
        <div>
          <div className="text-xs mb-2" style={{ color: "#6b7280" }}>
            최근 달성
          </div>
          <div className="flex gap-1.5 justify-start">
            {recentAchievements.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                unlocked={true}
                size="small"
              />
            ))}
          </div>
        </div>
      )}

      {onClick && (
        <div className="mt-2.5 text-xs text-center" style={{ color: "#6b7280" }}>
          탭하여 전체 업적 보기
        </div>
      )}
    </div>
  );
}

/**
 * 전체 업적 목록 모달 컴포넌트
 */
export function AchievementModal({ isOpen, onClose, userStats }) {
  const [selectedCategory, setSelectedCategory] = useState("all");

  if (!isOpen) return null;

  const achievementsByCategory = getAchievementsByCategory(userStats);
  const progress = getAchievementProgress(userStats);

  const filteredAchievements =
    selectedCategory === "all"
      ? Object.values(achievementsByCategory).flatMap((cat) => cat.achievements)
      : achievementsByCategory[selectedCategory]?.achievements || [];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000] p-5"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
          border: "2px solid #a78bfa40",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="m-0 text-xl font-bold flex items-center gap-2.5" style={{ color: "#e8e8ff" }}>
            <span className="text-3xl">🏆</span>
            업적 컬렉션
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-2xl cursor-pointer p-1"
            style={{ color: "#9ca3af" }}
          >
            ✕
          </button>
        </div>

        {/* 총 진행도 */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{
            background: "linear-gradient(135deg, #a78bfa20 0%, #c4b5fd10 100%)",
            border: "1px solid #a78bfa30",
          }}
        >
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-sm" style={{ color: "#c4b5fd" }}>
              총 {progress.unlocked}개 달성
            </span>
            <span className="text-lg font-bold" style={{ color: "#a78bfa" }}>
              {progress.points} pt
            </span>
          </div>
          <div className="h-2 rounded overflow-hidden" style={{ backgroundColor: "#374151" }}>
            <div
              className="h-full rounded"
              style={{
                width: `${progress.percentage}%`,
                background: "linear-gradient(90deg, #a78bfa 0%, #c4b5fd 100%)",
              }}
            />
          </div>
          <div className="mt-1.5 text-xs text-right" style={{ color: "#6b7280" }}>
            {progress.percentage}% 완료
          </div>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory("all")}
            className="px-3 py-1.5 rounded-2xl border-none text-xs font-medium cursor-pointer whitespace-nowrap"
            style={{
              background:
                selectedCategory === "all"
                  ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                  : "#374151",
              color: selectedCategory === "all" ? "#fff" : "#9ca3af",
            }}
          >
            전체
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className="px-3 py-1.5 rounded-2xl border-none text-xs font-medium cursor-pointer whitespace-nowrap flex items-center gap-1"
              style={{
                background:
                  selectedCategory === key
                    ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                    : "#374151",
                color: selectedCategory === key ? "#fff" : "#9ca3af",
              }}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* 업적 그리드 */}
        <div className="grid grid-cols-3 gap-2.5">
          {filteredAchievements.map((achievement) => (
            <AchievementBadge
              key={achievement.id}
              achievement={achievement}
              unlocked={achievement.unlocked}
            />
          ))}
        </div>

        {/* 희귀도 범례 */}
        <div className="mt-5 p-3 rounded-xl" style={{ background: "#11182780" }}>
          <div className="text-xs mb-2" style={{ color: "#6b7280" }}>
            희귀도
          </div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(RARITY_COLORS).map(([key, rarity]) => (
              <div key={key} className="flex items-center gap-1 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: rarity.color }}
                />
                <span style={{ color: rarity.color }}>{rarity.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AchievementBadge;
