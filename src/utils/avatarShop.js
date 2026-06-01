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
  effect: { name: "이펙트", icon: "✨", zIndex: 1 }, // 배경(0) 앞, 캐릭터(base-fill 5/base 10) 뒤 — 캐릭터를 가리지 않음
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
// 전신 베이스 (1024×1024) 좌표 v2 — 위쪽 100px 패딩 + 콘텐츠 88% 축소 후:
//   정수리 ~14%, 눈 ~30%, 입 ~35%, 어깨 ~47%, 허리 ~62%, 무릎 ~80%, 발 ~95%
// hair/hat 슬롯도 동일 비율로 축소 + y +9.77 보정해야 베이스 머리에 정렬.
export const SLOT_ANCHORS = {
  base:       { x: 50, y: 53.77, w: 88,   h: 88 },
  // hair PNG content (cy=30% 기준) → 새 베이스 머리(~30%)에 정렬
  hair:       { x: 50, y: 25.61, w: 52.8, h: 44 },
  hat:        { x: 50, y: 16.81, w: 44,   h: 26.4 },
  glasses:    { x: 50, y: 29.13, w: 35.2, h: 10.56 },
  outfit:     { x: 50, y: 50,    w: 100,  h: 100 },
  background: { x: 50, y: 50,    w: 100,  h: 100 },
  effect:     { x: 50, y: 53.77, w: 88,   h: 88 },
  preset:     { x: 50, y: 53.77, w: 88,   h: 88 },
};

// PNG 자체에서 흰 픽셀을 alpha 0으로 처리하면 normal blend로 충분.
// (multiply는 머리카락 색상까지 반투명하게 만들어 어색했음)
export const SLOT_BLEND_MODES = {
  hair: "normal",
  hat: "normal",
  glasses: "normal",
  outfit: "normal",
  effect: "normal",
  base: "normal",
  background: "normal",
  preset: "normal",
};

/**
 * 아이템별 anchor override (위치/크기 fine-tune)
 * key: itemId, value: { x, y, w, h } (캔버스 % 단위)
 * 편집기(avatar-position-editor.html)에서 사용자가 fine-tune 후 다운로드한 JSON.
 * 미지정 아이템은 SLOT_ANCHORS의 기본값 사용.
 */
// v11 — 사용자 fine-tune (avatar-anchors v22.json, 2026-05-21 16:05)
// hair_rainbow_curl 추가 미세 조정 (PNG 재생성 후)
// 🔧 아바타 위치 편집기 튜닝값 — avatar-anchors (34).json (2026-05-29) · 편집기와 동일
export const ITEM_ANCHORS = {
  // hair
  hair_braid_blonde:             { x: 49.63, y: 34.5, w: 327, h: 49.5 },
  hair_bun_black:                { x: 49.77, y: 16.23, w: 201.5, h: 32.5 },
  hair_fire:                     { x: 50, y: 14.3, w: 62, h: 37 },
  hair_galaxy:                   { x: 49.8, y: 28.55, w: 197, h: 42.5 },
  hair_long_wavy_brown:          { x: 49.47, y: 34.33, w: 232, h: 49.5 },
  hair_messy_male:               { x: 49.5, y: 18.13, w: 100, h: 31 },
  hair_mint:                     { x: 50.2, y: 21.4, w: 299, h: 36 },
  hair_pink_twin:                { x: 49.83, y: 25.5, w: 329, h: 44 },
  hair_ponytail_brown:           { x: 51.5, y: 18.9, w: 228, h: 39 },
  hair_ponytail_no_bangs_brown:  { x: 51.87, y: 24.07, w: 100, h: 39 },
  hair_rainbow_curl:             { x: 49.6, y: 20.2, w: 145.5, h: 32 },
  hair_short_brown:              { x: 50.1, y: 21.8, w: 220.5, h: 38 },
  hair_silver_long:              { x: 49.8, y: 28, w: 260, h: 41.5 },
  hair_slick_back_male:          { x: 49.6, y: 20.3, w: 76, h: 27.5 },
  hair_undercut_male:            { x: 49.75, y: 18.4, w: 92, h: 29.5 },
  // hat
  hat_angel_halo:                { x: 49.5, y: 6.4, w: 58, h: 34.5 },
  hat_baseball_red:              { x: 49.83, y: 16.13, w: 77, h: 25.5 },
  hat_beanie_yellow:             { x: 49.63, y: 10.53, w: 100, h: 29.5 },
  hat_chef:                      { x: 49.67, y: 9.83, w: 47, h: 33.5 },
  hat_crown_gold:                { x: 49.83, y: 13.33, w: 100, h: 25.5 },
  hat_devil_horns:               { x: 49.8, y: 19.7, w: 100, h: 28 },
  hat_graduation:                { x: 50, y: 16, w: 100, h: 32.5 },
  hat_witch:                     { x: 49.87, y: 10.03, w: 100, h: 36 },
  // glasses
  glasses_3d:                    { x: 49.88, y: 26.83, w: 30, h: 20 },
  glasses_aviator:               { x: 49.63, y: 27.13, w: 100, h: 16.5 },
  glasses_eyepatch:              { x: 53.4, y: 26, w: 50.5, h: 11 },
  glasses_heart_pink:            { x: 49.67, y: 26.73, w: 100, h: 18 },
  glasses_mask_medic:            { x: 49.67, y: 31.8, w: 36, h: 16.5 },
  glasses_monocle:               { x: 53.63, y: 29.33, w: 100, h: 49.5 },
  glasses_round_black:           { x: 49.5, y: 26.8, w: 100, h: 16.5 },
  glasses_star:                  { x: 49.8, y: 27, w: 19, h: 180 },
  // outfit
  luxury_athletic_set:           { x: 49.5, y: 54.83, w: 100, h: 100 },
  luxury_designer_coat:          { x: 49.67, y: 55, w: 100, h: 100 },
  luxury_dress_diamond:          { x: 49.5, y: 55.33, w: 100, h: 100 },
  luxury_fur_coat:               { x: 49.83, y: 53.83, w: 100, h: 100 },
  luxury_hanbok_gold:            { x: 49.67, y: 54.17, w: 100, h: 100 },
  luxury_kpop_stage:             { x: 49.67, y: 54.33, w: 100, h: 100 },
  luxury_royal_robe:             { x: 49.5, y: 54.17, w: 100, h: 100 },
  luxury_suit_gold:              { x: 49.5, y: 51.2, w: 218.5, h: 80.5 },
  outfit_astronaut:              { x: 49.33, y: 54.67, w: 100, h: 100 },
  outfit_chef:                   { x: 49.5, y: 53.83, w: 100, h: 100 },
  outfit_doctor:                 { x: 49.67, y: 54, w: 100, h: 100 },
  outfit_hanbok_blue:            { x: 49.33, y: 52.83, w: 100, h: 100 },
  outfit_kpop_idol:              { x: 48.67, y: 54.33, w: 100, h: 100 },
  outfit_police:                 { x: 49.67, y: 54.83, w: 100, h: 100 },
  outfit_robe_wizard:            { x: 49.5, y: 54, w: 100, h: 100 },
  outfit_school:                 { x: 49.5, y: 52.5, w: 100, h: 100 },
  // effect — 가운데 빈 테두리 디자인: W가 100 크게 넘으면 입자가 화면 밖으로 밀려 안 보임
  effect_butterflies:            { x: 51.23, y: 52, w: 536, h: 210.5 },
  effect_hearts:                 { x: 50.03, y: 51.03, w: 100, h: 144.5 },
  effect_lightning:              { x: 50.03, y: 50.4, w: 309.5, h: 105.5 },
  effect_petals:                 { x: 50.53, y: 50.67, w: 100, h: 122.5 },
  effect_rainbow_ring:           { x: 50, y: 50, w: 154, h: 102.5 },
  effect_snow:                   { x: 49.6, y: 49.7, w: 146.5, h: 99.5 },
  effect_sparkle:                { x: 49, y: 50.13, w: 481.5, h: 98.5 },
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
    else {
      const anchor = ITEM_ANCHORS[itemId];
      slots[slot] = anchor
        ? { url: item.imageUrl, anchorOverride: { x: anchor.x, y: anchor.y }, scale: 1, anchor }
        : { url: item.imageUrl };
    }
  });

  return { baseUrl, bgUrl, slots, presetUrl };
}
