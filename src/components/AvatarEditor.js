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
        style={{
          padding: "12px",
          borderRadius: "12px",
          border: isSelected ? "3px solid #a78bfa" : "2px solid #374151",
          background: isSelected
            ? "linear-gradient(135deg, #a78bfa20 0%, #8b5cf620 100%)"
            : "#1f2937",
          cursor: isIncompatible ? "not-allowed" : "pointer",
          opacity: isIncompatible ? 0.4 : 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          minWidth: "70px",
          transition: "all 0.2s",
        }}
      >
        {/* 색상 표시 */}
        {option.color && (
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              backgroundColor: option.color,
              border: "2px solid rgba(255,255,255,0.3)",
              boxShadow: isSelected ? `0 0 10px ${option.color}` : "none",
            }}
          />
        )}
        {/* 그라디언트 색상 */}
        {option.gradient && (
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${option.gradient.join(", ")})`,
              border: "2px solid rgba(255,255,255,0.3)",
            }}
          />
        )}
        {/* 얼굴형 - SVG 미리보기 */}
        {selectedCategory === "faceShape" && option.path && (
          <div style={{ width: "36px", height: "36px" }}>
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
          <div
            style={{
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            {option.icon}
          </div>
        )}
        {/* 아이콘 (악세서리 등) - 색상, 그라디언트, path, icon이 모두 없는 경우 */}
        {!option.color && !option.gradient && !option.path && !option.icon && (
          <div
            style={{
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              color: "#e8e8ff",
            }}
          >
            {option.id === "none" ? "❌" : "✓"}
          </div>
        )}
        <span
          style={{
            fontSize: "11px",
            color: isSelected ? "#a78bfa" : "#9ca3af",
            fontWeight: isSelected ? "600" : "400",
            textAlign: "center",
          }}
        >
          {option.name}
        </span>
        {isIncompatible && (
          <span style={{ fontSize: "9px", color: "#ef4444" }}>
            비호환
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "10px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
          borderRadius: "20px",
          padding: "20px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
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
            marginBottom: "16px",
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
            <span style={{ fontSize: "24px" }}>👤</span>
            아바타 꾸미기
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* 미리보기 */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "16px",
            padding: "16px",
            background: "linear-gradient(135deg, #11182750 0%, #1f293750 100%)",
            borderRadius: "16px",
            border: "1px solid #374151",
          }}
        >
          <div style={{ position: "relative" }}>
            <Avatar key={JSON.stringify(config)} config={config} size={150} />
            {/* 랜덤 버튼 */}
            <button
              onClick={handleRandomize}
              style={{
                position: "absolute",
                bottom: "-10px",
                right: "-10px",
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)",
              }}
              title="랜덤 생성"
            >
              🎲
            </button>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            overflowY: "hidden",
            paddingBottom: "12px",
            marginBottom: "12px",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            msOverflowStyle: "auto",
          }}
        >
          {AVATAR_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: selectedCategory === cat.id ? "2px solid #a78bfa" : "2px solid transparent",
                background:
                  selectedCategory === cat.id
                    ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                    : "#374151",
                color: selectedCategory === cat.id ? "#fff" : "#9ca3af",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s",
                minWidth: "fit-content",
              }}
            >
              {/* 색상 원 아이콘 */}
              <span
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  backgroundColor: cat.icon,
                  border: "2px solid rgba(255,255,255,0.3)",
                  flexShrink: 0,
                }}
              />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* 옵션 그리드 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
            gap: "8px",
            maxHeight: "200px",
            overflowY: "auto",
            padding: "8px",
            background: "#11182750",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          {currentOptions.map(renderOptionItem)}
        </div>

        {/* 액션 버튼 */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid #374151",
              background: "transparent",
              color: "#9ca3af",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: "10px 24px",
              borderRadius: "10px",
              border: "none",
              background: hasChanges
                ? "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)"
                : "#374151",
              color: hasChanges ? "#fff" : "#6b7280",
              fontSize: "14px",
              fontWeight: "600",
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
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        borderRadius: "20px",
        padding: "20px",
        border: "2px solid #a78bfa40",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      {/* 아바타 */}
      <div style={{ position: "relative" }}>
        <Avatar config={config} size={100} />
        <button
          onClick={onEditClick}
          style={{
            position: "absolute",
            bottom: "-5px",
            right: "-5px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
            border: "2px solid #1a1a2e",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="아바타 수정"
        >
          ✏️
        </button>
      </div>

      {/* 정보 */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: "#e8e8ff",
            marginBottom: "8px",
          }}
        >
          {userName}
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "#9ca3af",
          }}
        >
          순자산: {Number(netAssets || 0).toLocaleString()}원
        </div>
      </div>
    </div>
  );
}
