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
        className="inline-flex items-center gap-1 rounded-xl font-semibold text-xs"
        style={{
          background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}40 100%)`,
          border: `1.5px solid ${levelInfo.color}`,
          color: levelInfo.color,
          padding: "2px 8px",
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
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        border: `2px solid ${levelInfo.color}40`,
        boxShadow: `0 4px 20px ${levelInfo.color}20`,
      }}
    >
      {/* 레벨 헤더 */}
      <div
        className="flex items-center justify-between"
        style={{
          marginBottom: showProgress ? "12px" : "0",
        }}
      >
        <div className="flex items-center gap-3">
          {/* 레벨 아이콘 & 배지 */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-3xl relative"
            style={{
              background: `linear-gradient(135deg, ${levelInfo.color}30 0%, ${levelInfo.color}60 100%)`,
              boxShadow: `0 0 25px ${levelInfo.color}50`,
              border: `3px solid ${levelInfo.color}`,
            }}
          >
            {levelInfo.icon}
            {/* 배지 표시 */}
            <span
              className="absolute text-lg"
              style={{
                bottom: "-4px",
                right: "-4px",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            >
              {levelInfo.badge}
            </span>
          </div>

          {/* 레벨 정보 */}
          <div>
            <div
              className="text-xs mb-0.5"
              style={{
                color: "#9ca3af",
                letterSpacing: "1px",
              }}
            >
              LEVEL {levelInfo.level}
            </div>
            <div
              className="text-xl font-bold mt-0.5"
              style={{
                color: levelInfo.color,
                textShadow: `0 0 15px ${levelInfo.color}50`,
              }}
            >
              {levelInfo.title}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{
                color: "#6b7280",
              }}
            >
              {levelInfo.description}
            </div>
          </div>
        </div>

        {/* 레벨 배지 (큰 버전) */}
        <div
          className="flex items-center gap-1.5 rounded-3xl font-bold text-base"
          style={{
            background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}40 100%)`,
            border: `2px solid ${levelInfo.color}`,
            color: levelInfo.color,
            padding: "8px 16px",
            boxShadow: `0 0 20px ${levelInfo.color}40`,
          }}
        >
          <span className="text-xl">{levelInfo.badge}</span>
          <span>Lv.{levelInfo.level}</span>
        </div>
      </div>

      {/* 진행도 바 (옵션) */}
      {showProgress && levelInfo.nextLevel && (
        <div>
          <div
            className="flex justify-between text-xs mb-1.5"
            style={{
              color: "#9ca3af",
            }}
          >
            <span>다음 레벨: {levelInfo.nextLevel.title}</span>
            <span style={{ color: levelInfo.color }}>
              {formatAssetsShort(levelInfo.assetsToNextLevel)}원 필요
            </span>
          </div>
          <div
            className="h-2.5 rounded overflow-hidden"
            style={{
              backgroundColor: "#374151",
              border: "1px solid #4b5563",
            }}
          >
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${levelInfo.progress}%`,
                background: `linear-gradient(90deg, ${levelInfo.color} 0%, ${levelInfo.color}80 100%)`,
                boxShadow: `0 0 15px ${levelInfo.color}`,
              }}
            />
          </div>
          <div
            className="flex justify-between text-[10px] mt-1.5"
            style={{
              color: "#6b7280",
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
          className="text-center p-3 rounded-lg text-sm font-bold"
          style={{
            background: `linear-gradient(135deg, ${levelInfo.color}10 0%, ${levelInfo.color}25 100%)`,
            color: levelInfo.color,
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
      className="inline-flex items-center gap-1 text-sm rounded-lg"
      style={{
        padding: "2px 8px",
        background: `${levelInfo.color}15`,
        border: `1px solid ${levelInfo.color}40`,
      }}
    >
      <span>{levelInfo.badge}</span>
      <span className="font-semibold" style={{ color: levelInfo.color }}>
        Lv.{levelInfo.level}
      </span>
      <span className="text-xs" style={{ color: "#9ca3af" }}>
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
    <div className="flex flex-col gap-2">
      {levels.map((level) => {
        const isCurrentLevel = level.level === currentLevelInfo.level;
        const isUnlocked = currentNetAssets >= level.minAssets;

        return (
          <div
            key={level.level}
            className="flex items-center gap-3 rounded-xl"
            style={{
              padding: "10px 14px",
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
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
              style={{
                background: isUnlocked
                  ? `linear-gradient(135deg, ${level.color}30 0%, ${level.color}50 100%)`
                  : "#374151",
                filter: isUnlocked ? "none" : "grayscale(100%)",
              }}
            >
              {level.icon}
            </div>
            <div className="flex-1">
              <div
                className="text-sm font-semibold"
                style={{
                  color: isUnlocked ? level.color : "#6b7280",
                }}
              >
                Lv.{level.level} {level.title}
              </div>
              <div className="text-xs" style={{ color: "#9ca3af" }}>
                {formatAssetsShort(level.minAssets)}원 이상
              </div>
            </div>
            <div className="text-xl">
              {isUnlocked ? level.badge : "🔒"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
