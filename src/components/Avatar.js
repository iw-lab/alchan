// src/components/Avatar.js - PNG 베이스 + 슬롯 오버레이 합성
import React from "react";
import { AVATAR_SHOP_SLOTS, SLOT_ANCHORS, SLOT_BLEND_MODES } from "../utils/avatarShop";

// 폴백 베이스 이미지 (베이스 미선택 시) - 남자 기본
const DEFAULT_BASE_URL = "/avatar-shop/base_male.webp";

// 캐시버스터 — firestore에 저장된 옛 imageUrl(query string 없음)도 강제 갱신
// ⚠️ avatarShopCatalog.js 의 ASSET_VERSION 과 반드시 동시에 올릴 것
//    (어긋나면 avatarAssets.test.js 가 빨간불이 된다).
export const ASSET_VERSION = "20260812a";
const withCacheBust = (url) => {
  if (!url) return url;
  return url.includes("?") ? url : `${url}?v=${ASSET_VERSION}`;
};

/**
 * 옷을 입었을 때 쓰는 base 변종(`_outfit`) URL.
 *
 * ⚠️ 이 함수가 **확장자를 가려서는 안 된다.** 예전엔 `.png` 만 치환했고, 그래서 base 5종만
 *    WebP 이관에서 제외돼 700 KB PNG 로 남아 있었다(모든 학생이 매 화면에서 받는 파일이다).
 *    확장자를 못 찾으면 `replace` 가 원본을 **그대로 돌려주므로** 호출부는
 *    "변종이 있다"고 오판한다 — 그래서 매치 여부를 먼저 확인하고 없으면 null 을 준다.
 *
 * @returns {string|null} 변종 URL, 또는 확장자를 못 알아본 경우 null
 */
export function outfitVariantUrl(baseUrl) {
  if (!baseUrl) return null;
  // ⚠️ **경로 부분만** 본다. `\.(png|webp)(\?.*)?$` 로 URL 전체를 훑으면 두 방향으로 틀린다:
  //    - `/a.jpg?next=.webp` 처럼 쿼리·해시에 확장자 문자열이 섞이면 매치돼 non-null 을 준다
  //      → 호출부가 "변종이 있다"고 오판해 clipPath 가 틀어진다.
  //    - `/a.png#frag` 처럼 해시가 붙으면 매치가 안 돼 null 을 준다 → 멀쩡한 URL 을 버린다.
  //    지금 이 앱의 URL 은 `?v=` 만 붙지만, 이 함수의 존재 이유가 "확장자를 잘못 읽지 않는 것"이라
  //    실제로 그렇게 읽는다. 대소문자는 원본을 보존한다(서버 파일명 casing 을 우리가 정하지 않는다).
  const m = /^([^?#]*)\.(png|webp)([?#].*)?$/i.exec(baseUrl);
  if (!m) return null;
  return `${m[1]}_outfit.${m[2]}${m[3] || ""}`;
}

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
export default function Avatar({ size = 100, showBorder = true, onClick, shopOverlays, defaultBackground = false }) {
  const rawBaseUrl = shopOverlays?.baseUrl || DEFAULT_BASE_URL;
  const slots = shopOverlays?.slots || {};
  // outfit 입을 때 자동으로 _outfit 변종 시도 (없으면 onError로 원본 fallback)
  const outfitBaseUrl = slots.outfit?.url ? outfitVariantUrl(rawBaseUrl) : null;
  const baseUrl = withCacheBust(outfitBaseUrl || rawBaseUrl);
  const fallbackBaseUrl = withCacheBust(rawBaseUrl);
  const bgUrl = withCacheBust(shopOverlays?.bgUrl);
  const presetUrl = withCacheBust(shopOverlays?.presetUrl);

  // 배경 아이템·프리셋이 없을 때 보여줄 기본(단색이 아닌) 그라데이션 배경.
  // defaultBackground=true 인 경우에만 적용 (사이드바 위젯 등). 상점 미리보기엔 영향 없음.
  const useDefaultBg = defaultBackground && !bgUrl && !presetUrl;
  const DEFAULT_BG =
    "radial-gradient(circle at 50% 28%, #eef2ff 0%, #e0e7ff 55%, #c7d2fe 100%)";

  // 컨테이너 스타일
  const containerStyle = {
    width: size,
    height: size,
    position: "relative",
    cursor: onClick ? "pointer" : "default",
    borderRadius: showBorder ? size * 0.1 : 0,
    overflow: "hidden",
    background: useDefaultBg ? DEFAULT_BG : "#f1f5f9",
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
      {/* outfit 착용 시: 옷이 안 덮는 목·어깨 갭(특히 칼라가 넓게 열린 옷)으로
          배경이 비치지 않도록 전신 base를 한 겹 깔아 캐릭터 몸으로 갭을 메움.
          위에 머리 base(z=10)와 outfit(z=20)이 덮으므로 갭만 채워진다. */}
      {slots.outfit?.url && outfitBaseUrl && (
        <img
          src={fallbackBaseUrl}
          alt="base-fill"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 5,
            pointerEvents: "none",
            // 갭은 목·어깨(상체)에만 생기므로 하단(다리·발)은 잘라 base 발이 옷 밖으로 삐져나오지 않게.
            clipPath: "inset(0 0 45% 0)",
          }}
        />
      )}
      {/* 베이스 PNG — outfit 착용 시 머리만 표시 (NECK 27% 이하 잘림),
          outfit이 몸 전체를 자연스럽게 덮음. */}
      <img
        src={baseUrl}
        alt="base"
        onError={(e) => {
          // _outfit 변종 없으면 원본 base로 fallback
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
          // outfit 입었을 때: _outfit 변종 있으면 그대로 (이미 alpha), 없으면 머리+목+어깨만 표시
          clipPath: (slots.outfit?.url && !outfitBaseUrl) ? "inset(0 0 62% 0)" : "none",
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
