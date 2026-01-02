// src/components/LevelBadge.js - 레벨 배지 컴포넌트 (고급 버전)
import React from "react";
import { getLevelInfo, formatAssetsShort, getAllLevels } from "../utils/levelSystem";

/**
 * 레벨 배지 컴포넌트
 * 순자산을 기반으로 레벨과 칭호를 표시합니다.
 */
export default function LevelBadge({ netAssets, showProgress = false, compact = false }) {
  const levelInfo = getLevelInfo(netAssets);

  if (compact) {
    return (
      <span
        style={{
          background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}40 100%)`,
          border: `1.5px solid ${levelInfo.color}`,
          color: levelInfo.color,
          padding: "2px 8px",
          borderRadius: "12px",
          fontWeight: "600",
          fontSize: "12px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          boxShadow: `0 0 8px ${levelInfo.color}30`,
        }}
      >
        <span>{levelInfo.badge}</span>
        <span>Lv.{levelInfo.level}</span>
      </span>
    );
  }

  return (
    <div
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        borderRadius: "16px",
        padding: "16px",
        border: `2px solid ${levelInfo.color}40`,
        boxShadow: `0 4px 20px ${levelInfo.color}20`,
      }}
    >
      {/* 레벨 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: showProgress ? "12px" : "0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* 레벨 아이콘 & 배지 */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${levelInfo.color}30 0%, ${levelInfo.color}60 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              boxShadow: `0 0 25px ${levelInfo.color}50`,
              border: `3px solid ${levelInfo.color}`,
              position: "relative",
            }}
          >
            {levelInfo.icon}
            {/* 배지 표시 */}
            <span
              style={{
                position: "absolute",
                bottom: "-4px",
                right: "-4px",
                fontSize: "18px",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            >
              {levelInfo.badge}
            </span>
          </div>

          {/* 레벨 정보 */}
          <div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                marginBottom: "2px",
                letterSpacing: "1px",
              }}
            >
              LEVEL {levelInfo.level}
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: levelInfo.color,
                textShadow: `0 0 15px ${levelInfo.color}50`,
              }}
            >
              {levelInfo.title}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#6b7280",
                marginTop: "2px",
              }}
            >
              {levelInfo.description}
            </div>
          </div>
        </div>

        {/* 레벨 배지 (큰 버전) */}
        <div
          style={{
            background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}40 100%)`,
            border: `2px solid ${levelInfo.color}`,
            color: levelInfo.color,
            padding: "8px 16px",
            borderRadius: "24px",
            fontWeight: "700",
            fontSize: "16px",
            boxShadow: `0 0 20px ${levelInfo.color}40`,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{levelInfo.badge}</span>
          <span>Lv.{levelInfo.level}</span>
        </div>
      </div>

      {/* 진행도 바 (옵션) */}
      {showProgress && levelInfo.nextLevel && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "#9ca3af",
              marginBottom: "6px",
            }}
          >
            <span>다음 레벨: {levelInfo.nextLevel.title}</span>
            <span style={{ color: levelInfo.color }}>
              {formatAssetsShort(levelInfo.assetsToNextLevel)}원 필요
            </span>
          </div>
          <div
            style={{
              height: "10px",
              backgroundColor: "#374151",
              borderRadius: "5px",
              overflow: "hidden",
              border: "1px solid #4b5563",
            }}
          >
            <div
              style={{
                width: `${levelInfo.progress}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${levelInfo.color} 0%, ${levelInfo.color}80 100%)`,
                borderRadius: "5px",
                transition: "width 0.5s ease",
                boxShadow: `0 0 15px ${levelInfo.color}`,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              color: "#6b7280",
              marginTop: "6px",
            }}
          >
            <span>{levelInfo.title}</span>
            <span style={{ color: levelInfo.nextLevel.color }}>
              {levelInfo.nextLevel.icon} {levelInfo.nextLevel.title}
            </span>
          </div>
        </div>
      )}

      {/* 최고 레벨 달성 시 */}
      {showProgress && !levelInfo.nextLevel && (
        <div
          style={{
            textAlign: "center",
            padding: "12px",
            background: `linear-gradient(135deg, ${levelInfo.color}10 0%, ${levelInfo.color}25 100%)`,
            borderRadius: "10px",
            color: levelInfo.color,
            fontSize: "14px",
            fontWeight: "700",
            border: `1px solid ${levelInfo.color}40`,
          }}
        >
          🌌 최고 레벨 달성! 알찬의 전설이 되셨습니다! 🌌
        </div>
      )}
    </div>
  );
}

/**
 * 인라인 레벨 표시 컴포넌트 (리더보드 등에서 사용)
 */
export function LevelInline({ netAssets }) {
  const levelInfo = getLevelInfo(netAssets);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "13px",
        padding: "2px 8px",
        borderRadius: "10px",
        background: `${levelInfo.color}15`,
        border: `1px solid ${levelInfo.color}40`,
      }}
    >
      <span>{levelInfo.badge}</span>
      <span style={{ color: levelInfo.color, fontWeight: "600" }}>
        Lv.{levelInfo.level}
      </span>
      <span style={{ color: "#9ca3af", fontSize: "11px" }}>
        {levelInfo.title}
      </span>
    </span>
  );
}

/**
 * 레벨 목록 표시 컴포넌트
 */
export function LevelList({ currentNetAssets }) {
  const levels = getAllLevels();
  const currentLevelInfo = getLevelInfo(currentNetAssets);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {levels.map((level) => {
        const isCurrentLevel = level.level === currentLevelInfo.level;
        const isUnlocked = currentNetAssets >= level.minAssets;

        return (
          <div
            key={level.level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 14px",
              borderRadius: "12px",
              background: isCurrentLevel
                ? `linear-gradient(135deg, ${level.color}20 0%, ${level.color}10 100%)`
                : isUnlocked
                  ? "#1f2937"
                  : "#111827",
              border: isCurrentLevel
                ? `2px solid ${level.color}`
                : "1px solid #374151",
              opacity: isUnlocked ? 1 : 0.5,
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: isUnlocked
                  ? `linear-gradient(135deg, ${level.color}30 0%, ${level.color}50 100%)`
                  : "#374151",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                filter: isUnlocked ? "none" : "grayscale(100%)",
              }}
            >
              {level.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: isUnlocked ? level.color : "#6b7280",
                }}
              >
                Lv.{level.level} {level.title}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                {formatAssetsShort(level.minAssets)}원 이상
              </div>
            </div>
            <div style={{ fontSize: "20px" }}>
              {isUnlocked ? level.badge : "🔒"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
