// src/utils/avatarShop.js - 아바타 상점 데이터 모델

/**
 * 아바타 상점 아이템 카테고리 (오버레이 슬롯)
 * - 한 슬롯에는 한 번에 하나만 장착 가능
 * - 기본 SVG 아바타 위에 PNG 오버레이로 합성
 */
export const AVATAR_SHOP_SLOTS = {
  base: { name: "기본 얼굴", icon: "🙂", zIndex: 10 },
  hair: { name: "헤어", icon: "💇", zIndex: 30 },
  hat: { name: "모자/관", icon: "👒", zIndex: 50 },
  glasses: { name: "안경/마스크", icon: "🕶️", zIndex: 40 },
  outfit: { name: "의상", icon: "👔", zIndex: 20 },
  background: { name: "배경", icon: "🌄", zIndex: 0 },
  effect: { name: "이펙트", icon: "✨", zIndex: 60 },
  preset: { name: "프리셋 캐릭터", icon: "🎭", zIndex: 99 }, // 통째로 교체
};

/**
 * 등급별 가격 가이드 + 색상
 */
export const AVATAR_RARITIES = {
  common: { name: "일반", color: "#94a3b8", glow: "rgba(148,163,184,0.4)", priceRange: [3000, 10000] },
  rare: { name: "희귀", color: "#3b82f6", glow: "rgba(59,130,246,0.6)", priceRange: [15000, 50000] },
  epic: { name: "에픽", color: "#a855f7", glow: "rgba(168,85,247,0.7)", priceRange: [80000, 200000] },
  legendary: { name: "전설", color: "#f59e0b", glow: "rgba(245,158,11,0.8)", priceRange: [300000, 1000000] },
};

/**
 * 아바타 상점 아이템 스키마 (Firestore avatarShopItems/{itemId})
 *
 * {
 *   id: "hair_unicorn_horn",
 *   slot: "hair" | "hat" | "glasses" | "outfit" | "background" | "effect" | "preset",
 *   name: "유니콘 뿔",
 *   description: "신비로운 무지개 뿔",
 *   imageUrl: "https://.../hair_unicorn_horn.png",  // 투명 PNG
 *   rarity: "epic",
 *   price: 100000,
 *   active: true,                                    // 판매 활성화
 *   limited: false,                                  // 한정판 여부
 *   anchorOverride?: { top: -10, left: 0 },          // 슬롯 기본 위치 미세조정
 *   scale?: 1.0,                                     // 슬롯 기본 크기 미세조정
 *   createdAt: serverTimestamp,
 *   sortOrder: number,                               // 진열 순서
 * }
 *
 * 사용자 측 (users/{uid}):
 *   ownedAvatarItems: { [itemId]: { purchasedAt, rarity, slot, ... } }  // map (배열 X)
 *   equippedAvatarItems: { hair: itemId, hat: itemId, ... }             // 슬롯별 장착
 *   activePreset?: itemId                                                // 프리셋 활성화 시
 */

/**
 * 슬롯 z-index 가져오기
 */
export function getSlotZIndex(slot) {
  return AVATAR_SHOP_SLOTS[slot]?.zIndex ?? 10;
}

/**
 * 등급 정보 가져오기
 */
export function getRarity(key) {
  return AVATAR_RARITIES[key] || AVATAR_RARITIES.common;
}

/**
 * 슬롯 정보 가져오기
 */
export function getSlot(slot) {
  return AVATAR_SHOP_SLOTS[slot] || { name: slot, icon: "🎨", zIndex: 10 };
}

/**
 * 사용자가 아이템을 소유했는지
 */
export function isOwned(userDoc, itemId) {
  if (!userDoc?.ownedAvatarItems) return false;
  return Boolean(userDoc.ownedAvatarItems[itemId]);
}

/**
 * 사용자가 해당 슬롯에 장착한 아이템 id
 */
export function getEquippedItem(userDoc, slot) {
  return userDoc?.equippedAvatarItems?.[slot] || null;
}

/**
 * 프리셋 활성화 여부 (프리셋 장착 시 다른 슬롯/SVG 숨김)
 */
export function getActivePreset(userDoc) {
  return userDoc?.activePreset || null;
}

/**
 * 슬롯별 기본 위치 (PNG 오버레이 좌표) - SVG viewBox(100x100 기준)
 * scale: SVG viewBox 단위
 */
// 베이스 PNG (1024×1024) 기준 좌표 시스템 (0-100 백분율)
// 베이스 대머리 인물: 정수리 ~22%, 눈 ~44%, 입 ~56%, 어깨 ~85%
// 헤어/모자는 정수리를 중심으로 머리 전체 영역 덮음.
// 헤어 PNG는 빈 padding을 포함하므로 베이스보다 더 크게 합성하는 게 정상.
export const SLOT_ANCHORS = {
  base: { x: 50, y: 50, w: 100, h: 100 },     // 전체
  hair: { x: 50, y: 32, w: 110, h: 85 },      // 머리 영역 완전 덮도록 크게 (PNG padding 포함)
  hat: { x: 50, y: 18, w: 90, h: 45 },        // 정수리 최상단 + 살짝 옆까지
  glasses: { x: 50, y: 44, w: 62, h: 20 },    // 눈 부분
  outfit: { x: 50, y: 88, w: 100, h: 32 },    // 어깨~상체
  background: { x: 50, y: 50, w: 100, h: 100 }, // 전체
  effect: { x: 50, y: 50, w: 100, h: 100 },   // 전체 오버레이
  preset: { x: 50, y: 50, w: 100, h: 100 },   // 전체 교체
};

// 슬롯별 합성 mix-blend-mode (흰 배경 자동 제거용)
// multiply: 흰 영역 → 투명 효과 (어두운 색은 어두워질 수 있음)
// normal: 알파 채널 그대로 (배경/프리셋 등)
export const SLOT_BLEND_MODES = {
  hair: "multiply",
  hat: "multiply",
  glasses: "multiply",
  outfit: "multiply",
  effect: "multiply",
  base: "normal",
  background: "normal",
  preset: "normal",
};

/**
 * userDoc에서 Avatar 컴포넌트가 쓸 overlays 객체 생성
 * @param {object} userDoc - users/{uid} 문서 데이터
 * @returns {object} { baseUrl, bgUrl, slots, presetUrl }
 */
export function buildAvatarOverlays(userDoc) {
  const owned = userDoc?.ownedAvatarItems || {};
  const eq = userDoc?.equippedAvatarItems || {};
  const slots = {};
  let baseUrl = null;
  let bgUrl = null;
  let presetUrl = null;

  Object.entries(eq).forEach(([slot, itemId]) => {
    if (!itemId) return;
    const item = owned[itemId];
    if (!item?.imageUrl) return;
    if (slot === "background") bgUrl = item.imageUrl;
    else if (slot === "preset") presetUrl = item.imageUrl;
    else if (slot === "base") baseUrl = item.imageUrl;
    else slots[slot] = { url: item.imageUrl };
  });

  return { baseUrl, bgUrl, slots, presetUrl };
}
