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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: isSmall ? "8px" : "12px",
        borderRadius: "12px",
        background: unlocked
          ? `linear-gradient(135deg, ${rarity.bg} 0%, ${rarity.bg}dd 100%)`
          : "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
        border: `2px solid ${unlocked ? rarity.color : "#374151"}`,
        opacity: unlocked ? 1 : 0.5,
        transition: "all 0.3s ease",
        cursor: "pointer",
        minWidth: isSmall ? "60px" : "80px",
      }}
      title={`${achievement.name}: ${achievement.description}`}
    >
      <div
        style={{
          fontSize: isSmall ? "24px" : "32px",
          marginBottom: "4px",
          filter: unlocked ? "none" : "grayscale(100%)",
        }}
      >
        {achievement.icon}
      </div>
      {!isSmall && (
        <>
          <div
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: unlocked ? rarity.color : "#6b7280",
              textAlign: "center",
              lineHeight: "1.2",
            }}
          >
            {achievement.name}
          </div>
          <div
            style={{
              fontSize: "9px",
              color: unlocked ? rarity.color : "#4b5563",
              marginTop: "2px",
              padding: "2px 6px",
              borderRadius: "8px",
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
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        borderRadius: "16px",
        padding: "16px",
        border: "2px solid #a78bfa40",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 4px 20px rgba(167, 139, 250, 0.1)",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "20px" }}>🏆</span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "#e8e8ff",
            }}
          >
            업적
          </span>
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "#a78bfa",
            fontWeight: "600",
          }}
        >
          {progress.points} pt
        </div>
      </div>

      {/* 진행 바 */}
      <div style={{ marginBottom: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#9ca3af",
            marginBottom: "4px",
          }}
        >
          <span>달성 진행도</span>
          <span>{progress.unlocked} / {progress.total}</span>
        </div>
        <div
          style={{
            height: "6px",
            backgroundColor: "#374151",
            borderRadius: "3px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress.percentage}%`,
              height: "100%",
              background: "linear-gradient(90deg, #a78bfa 0%, #c4b5fd 100%)",
              borderRadius: "3px",
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* 최근 달성 업적 */}
      {recentAchievements.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "10px",
              color: "#6b7280",
              marginBottom: "8px",
            }}
          >
            최근 달성
          </div>
          <div
            style={{
              display: "flex",
              gap: "6px",
              justifyContent: "flex-start",
            }}
          >
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
        <div
          style={{
            marginTop: "10px",
            fontSize: "11px",
            color: "#6b7280",
            textAlign: "center",
          }}
        >
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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
          borderRadius: "20px",
          padding: "24px",
          maxWidth: "500px",
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          border: "2px solid #a78bfa40",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: "700",
              color: "#e8e8ff",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "28px" }}>🏆</span>
            업적 컬렉션
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "24px",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* 총 진행도 */}
        <div
          style={{
            background: "linear-gradient(135deg, #a78bfa20 0%, #c4b5fd10 100%)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px",
            border: "1px solid #a78bfa30",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
            }}
          >
            <span style={{ color: "#c4b5fd", fontSize: "14px" }}>
              총 {progress.unlocked}개 달성
            </span>
            <span
              style={{
                color: "#a78bfa",
                fontSize: "18px",
                fontWeight: "700",
              }}
            >
              {progress.points} pt
            </span>
          </div>
          <div
            style={{
              height: "8px",
              backgroundColor: "#374151",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress.percentage}%`,
                height: "100%",
                background: "linear-gradient(90deg, #a78bfa 0%, #c4b5fd 100%)",
                borderRadius: "4px",
              }}
            />
          </div>
          <div
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#6b7280",
              textAlign: "right",
            }}
          >
            {progress.percentage}% 완료
          </div>
        </div>

        {/* 카테고리 필터 */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
            overflowX: "auto",
            paddingBottom: "4px",
          }}
        >
          <button
            onClick={() => setSelectedCategory("all")}
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              border: "none",
              background:
                selectedCategory === "all"
                  ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                  : "#374151",
              color: selectedCategory === "all" ? "#fff" : "#9ca3af",
              fontSize: "12px",
              fontWeight: "500",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            전체
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              style={{
                padding: "6px 12px",
                borderRadius: "16px",
                border: "none",
                background:
                  selectedCategory === key
                    ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                    : "#374151",
                color: selectedCategory === key ? "#fff" : "#9ca3af",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* 업적 그리드 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
          }}
        >
          {filteredAchievements.map((achievement) => (
            <AchievementBadge
              key={achievement.id}
              achievement={achievement}
              unlocked={achievement.unlocked}
            />
          ))}
        </div>

        {/* 희귀도 범례 */}
        <div
          style={{
            marginTop: "20px",
            padding: "12px",
            background: "#11182780",
            borderRadius: "10px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#6b7280",
              marginBottom: "8px",
            }}
          >
            희귀도
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            {Object.entries(RARITY_COLORS).map(([key, rarity]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "10px",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: rarity.color,
                  }}
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
