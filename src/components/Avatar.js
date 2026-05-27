// src/components/Avatar.js - PNG 베이스 + 슬롯 오버레이 합성
import React from "react";
import { AVATAR_SHOP_SLOTS, SLOT_ANCHORS, SLOT_BLEND_MODES } from "../utils/avatarShop";

// 폴백 베이스 이미지 (베이스 미선택 시) - 남자 기본
const DEFAULT_BASE_URL = "/avatar-shop/base_male.png";

// PNG cache-buster — firestore에 저장된 옛 imageUrl(query string 없음)도 강제 갱신
const ASSET_VERSION = "20260523d";
const withCacheBust = (url) => {
  if (!url) return url;
  return url.includes("?") ? url : `${url}?v=${ASSET_VERSION}`;
};

/**
 * Avatar 컴포넌트 - PNG 베이스 + 슬롯 합성
 *
 * @param {object} config - 레거시 SVG config (이제 사용 안 함, 무시됨)
 * @param {number} size - 픽셀 크기
 * @param {boolean} showBorder - 둥근 모서리 여부
 * @param {function} onClick
 * @param {object} shopOverlays - { baseUrl?, bgUrl?, slots: {hair, hat, glasses, outfit, effect}, presetUrl? }
 *                                각 slot 값은 { url, anchorOverride?, scale? }
 */
export default function Avatar({ size = 100, showBorder = true, onClick, shopOverlays }) {
  const rawBaseUrl = shopOverlays?.baseUrl || DEFAULT_BASE_URL;
  const slots = shopOverlays?.slots || {};
  // outfit 입을 때 자동으로 _outfit.png 변종 시도 (없으면 onError로 원본 fallback)
  const outfitBaseUrl = slots.outfit?.url
    ? rawBaseUrl.replace(/\.png(\?.*)?$/, "_outfit.png$1")
    : null;
  const baseUrl = withCacheBust(outfitBaseUrl || rawBaseUrl);
  const fallbackBaseUrl = withCacheBust(rawBaseUrl);
  const bgUrl = withCacheBust(shopOverlays?.bgUrl);
  const presetUrl = withCacheBust(shopOverlays?.presetUrl);

  // 컨테이너 스타일
  const containerStyle = {
    width: size,
    height: size,
    position: "relative",
    cursor: onClick ? "pointer" : "default",
    borderRadius: showBorder ? size * 0.1 : 0,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
  };

  // 프리셋 활성화 시 다른 모든 레이어 무시 (단일 PNG 표시)
  if (presetUrl) {
    return (
      <div
        onClick={onClick}
        style={{
          ...containerStyle,
          backgroundImage: `url("${presetUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }

  // 슬롯 PNG 위치 계산 (백분율 → 픽셀)
  const renderSlotImage = (slotKey, slotData) => {
    if (!slotData?.url) return null;
    const defaultAnchor = SLOT_ANCHORS[slotKey] || { x: 50, y: 50, w: 100, h: 100 };
    // slotData.anchor가 있으면 그것을 우선 사용 (ITEM_ANCHORS에서 온 fine-tune)
    const anchor = slotData.anchor || defaultAnchor;
    const scale = slotData.scale || 1;
    const cx = slotData.anchorOverride?.x ?? anchor.x;
    const cy = slotData.anchorOverride?.y ?? anchor.y;
    const w = anchor.w * scale;
    const h = anchor.h * scale;
    const left = cx - w / 2;
    const top = cy - h / 2;
    const zIndex = AVATAR_SHOP_SLOTS[slotKey]?.zIndex ?? 10;

    const blendMode = SLOT_BLEND_MODES[slotKey] || "normal";

    return (
      <img
        key={slotKey}
        src={withCacheBust(slotData.url)}
        alt={slotKey}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: `${w}%`,
          height: `${h}%`,
          maxWidth: "none",
          maxHeight: "none",
          objectFit: "contain",
          pointerEvents: "none",
          zIndex,
          mixBlendMode: blendMode,
        }}
      />
    );
  };

  return (
    <div onClick={onClick} style={containerStyle}>
      {/* 배경 PNG (가장 뒤) */}
      {bgUrl && (
        <img
          src={bgUrl}
          alt="background"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      )}
      {/* 베이스 PNG — outfit 착용 시 머리만 표시 (NECK 27% 이하 잘림),
          outfit이 몸 전체를 자연스럽게 덮음. */}
      <img
        src={baseUrl}
        alt="base"
        onError={(e) => {
          // _outfit.png 변종 없으면 원본 base로 fallback
          if (e.currentTarget.src !== fallbackBaseUrl) {
            e.currentTarget.src = fallbackBaseUrl;
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 10,
          pointerEvents: "none",
          // _outfit 변종 사용 시 clip-path 불필요 (이미 alpha 처리됨)
          clipPath: (slots.outfit?.url && !outfitBaseUrl) ? "inset(0 0 67% 0)" : "none",
        }}
      />
      {/* 의상/헤어/안경/모자 (z-index 순서대로 자동 정렬) */}
      {renderSlotImage("outfit", slots.outfit)}
      {renderSlotImage("hair", slots.hair)}
      {renderSlotImage("glasses", slots.glasses)}
      {renderSlotImage("hat", slots.hat)}
      {renderSlotImage("effect", slots.effect)}
    </div>
  );
}

/**
 * 헤더용 미니 아바타
 */
export function MiniAvatar({ size = 40, onClick, shopOverlays }) {
  return (
    <div
      onClick={onClick}
      className="rounded-full overflow-hidden relative"
      style={{
        width: size,
        height: size,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        border: "2px solid white",
      }}
    >
      <Avatar size={size} showBorder={false} shopOverlays={shopOverlays} />
    </div>
  );
}
