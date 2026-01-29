// src/components/AvatarEditor.js - 아바타 커스터마이징 에디터
import React, { useState, useEffect } from "react";
import Avatar from "./Avatar";
import {
  getAvatarConfig,
  saveAvatarConfig,
  getAvatarOptions,
  isHairstyleCompatible,
  AVATAR_CATEGORIES,
  DEFAULT_AVATAR,
} from "../utils/avatarSystem";

/**
 * 아바타 에디터 모달 컴포넌트
 */
export default function AvatarEditor({ isOpen, onClose, userId, onSave }) {
  const [config, setConfig] = useState(DEFAULT_AVATAR);
  const [selectedCategory, setSelectedCategory] = useState("skinTone");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      const savedConfig = getAvatarConfig(userId);
      setConfig(savedConfig);
      setHasChanges(false);
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const currentOptions = getAvatarOptions(selectedCategory);

  const handleOptionSelect = (optionId) => {
    const newConfig = { ...config, [selectedCategory]: optionId };

    // 헤어스타일 호환성 체크
    if (selectedCategory === "faceShape") {
      if (!isHairstyleCompatible(config.hairstyle, optionId)) {
        // 호환되지 않으면 기본 헤어스타일로 변경
        newConfig.hairstyle = "short";
      }
    }

    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveAvatarConfig(userId, config);
    setHasChanges(false);
    if (onSave) onSave(config);
    onClose();
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_AVATAR });
    setHasChanges(true);
  };

  const handleRandomize = () => {
    const randomConfig = {};
    AVATAR_CATEGORIES.forEach(cat => {
      const options = getAvatarOptions(cat.id);
      if (options.length > 0) {
        const randomIndex = Math.floor(Math.random() * options.length);
        randomConfig[cat.id] = options[randomIndex].id;
      }
    });
    setConfig(randomConfig);
    setHasChanges(true);
  };

  // 현재 카테고리에서 선택된 값
  const getCurrentValue = () => config[selectedCategory];

  // 옵션 렌더링
  const renderOptionItem = (option) => {
    const isSelected = getCurrentValue() === option.id;

    // 헤어스타일 호환성 확인
    const isIncompatible = selectedCategory === "hairstyle" &&
      !isHairstyleCompatible(option.id, config.faceShape);

    return (
      <button
        key={option.id}
        onClick={() => !isIncompatible && handleOptionSelect(option.id)}
        disabled={isIncompatible}
        className="p-3 rounded-xl flex flex-col items-center gap-1.5 min-w-[70px] transition-all"
        style={{
          border: isSelected ? "3px solid #a78bfa" : "2px solid #374151",
          background: isSelected
            ? "linear-gradient(135deg, #a78bfa20 0%, #8b5cf620 100%)"
            : "#1f2937",
          cursor: isIncompatible ? "not-allowed" : "pointer",
          opacity: isIncompatible ? 0.4 : 1,
        }}
      >
        {/* 색상 표시 */}
        {option.color && (
          <div
            className="w-7 h-7 rounded-full"
            style={{
              backgroundColor: option.color,
              border: "2px solid rgba(255,255,255,0.3)",
              boxShadow: isSelected ? `0 0 10px ${option.color}` : "none",
            }}
          />
        )}
        {/* 그라디언트 색상 */}
        {option.gradient && (
          <div
            className="w-7 h-7 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${option.gradient.join(", ")})`,
              border: "2px solid rgba(255,255,255,0.3)",
            }}
          />
        )}
        {/* 얼굴형 - SVG 미리보기 */}
        {selectedCategory === "faceShape" && option.path && (
          <div className="w-9 h-9">
            <svg viewBox="0 0 100 100" width="36" height="36">
              <path
                d={option.path}
                fill="#F5DEB3"
                stroke={isSelected ? "#a78bfa" : "#666"}
                strokeWidth="2"
              />
            </svg>
          </div>
        )}
        {/* 아이콘이 있는 경우 */}
        {option.icon && selectedCategory !== "faceShape" && (
          <div className="w-7 h-7 flex items-center justify-center text-2xl">
            {option.icon}
          </div>
        )}
        {/* 아이콘 (악세서리 등) - 색상, 그라디언트, path, icon이 모두 없는 경우 */}
        {!option.color && !option.gradient && !option.path && !option.icon && (
          <div className="w-7 h-7 flex items-center justify-center text-xl" style={{ color: "#e8e8ff" }}>
            {option.id === "none" ? "❌" : "✓"}
          </div>
        )}
        <span
          className="text-xs text-center"
          style={{
            color: isSelected ? "#a78bfa" : "#9ca3af",
            fontWeight: isSelected ? "600" : "400",
          }}
        >
          {option.name}
        </span>
        {isIncompatible && (
          <span className="text-[9px]" style={{ color: "#ef4444" }}>
            비호환
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[2000] p-2.5"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
          border: "2px solid #a78bfa40",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="m-0 text-xl font-bold flex items-center gap-2.5" style={{ color: "#e8e8ff" }}>
            <span className="text-2xl">👤</span>
            아바타 꾸미기
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-2xl cursor-pointer"
            style={{ color: "#9ca3af" }}
          >
            ✕
          </button>
        </div>

        {/* 미리보기 */}
        <div
          className="flex justify-center mb-4 p-4 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #11182750 0%, #1f293750 100%)",
            border: "1px solid #374151",
          }}
        >
          <div className="relative">
            <Avatar key={JSON.stringify(config)} config={config} size={150} />
            {/* 랜덤 버튼 */}
            <button
              onClick={handleRandomize}
              className="absolute -bottom-2.5 -right-2.5 w-10 h-10 rounded-full border-none text-xl cursor-pointer flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)",
              }}
              title="랜덤 생성"
            >
              🎲
            </button>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-3 mb-3" style={{
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            msOverflowStyle: "auto",
          }}>
          {AVATAR_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5 transition-all min-w-fit"
              style={{
                border: selectedCategory === cat.id ? "2px solid #a78bfa" : "2px solid transparent",
                background:
                  selectedCategory === cat.id
                    ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                    : "#374151",
                color: selectedCategory === cat.id ? "#fff" : "#9ca3af",
              }}
            >
              {/* 색상 원 아이콘 */}
              <span
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: cat.icon,
                  border: "2px solid rgba(255,255,255,0.3)",
                }}
              />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* 옵션 그리드 */}
        <div
          className="grid gap-2 max-h-[200px] overflow-y-auto p-2 rounded-xl mb-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
            background: "#11182750",
          }}
        >
          {currentOptions.map(renderOptionItem)}
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2.5 justify-end">
          <button
            onClick={handleReset}
            className="px-5 py-2.5 rounded-xl bg-transparent text-sm cursor-pointer"
            style={{
              border: "1px solid #374151",
              color: "#9ca3af",
            }}
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="px-6 py-2.5 rounded-xl border-none text-sm font-semibold"
            style={{
              background: hasChanges
                ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                : "#374151",
              color: hasChanges ? "#fff" : "#6b7280",
              cursor: hasChanges ? "pointer" : "not-allowed",
              boxShadow: hasChanges ? "0 4px 15px rgba(139, 92, 246, 0.4)" : "none",
            }}
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 아바타 프로필 카드 컴포넌트
 */
export function AvatarProfileCard({ userId, userName, netAssets, onEditClick }) {
  const [config, setConfig] = useState(DEFAULT_AVATAR);

  useEffect(() => {
    if (userId) {
      setConfig(getAvatarConfig(userId));
    }
  }, [userId]);

  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        border: "2px solid #a78bfa40",
      }}
    >
      {/* 아바타 */}
      <div className="relative">
        <Avatar config={config} size={100} />
        <button
          onClick={onEditClick}
          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full text-sm cursor-pointer flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
            border: "2px solid #1a1a2e",
          }}
          title="아바타 수정"
        >
          ✏️
        </button>
      </div>

      {/* 정보 */}
      <div className="flex-1">
        <div className="text-lg font-bold mb-2" style={{ color: "#e8e8ff" }}>
          {userName}
        </div>
        <div className="text-sm" style={{ color: "#9ca3af" }}>
          순자산: {Number(netAssets || 0).toLocaleString()}원
        </div>
      </div>
    </div>
  );
}
