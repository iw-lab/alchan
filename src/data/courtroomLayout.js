// src/data/courtroomLayout.js
// 재판방 씬의 좌표 레이아웃.
//  - PROPS : 가구/소품 PNG 배치 (public/courtroom/*.png)
//  - SEATS : 학생 아바타가 앉는/서는 자리
// 좌표 단위는 stage(법정 무대) 기준 % (x,y = 중심 / w,h = 폭·높이).
// public/courtroom-layout-editor.html 에서 드래그로 편집 후 JSON 내보내 여기에 반영한다.

// 에셋 PNG 캐시버스터 (재생성 시 올린다)
export const COURTROOM_ASSET_VERSION = "20260604a";

// 캐릭터보다 "앞"에 렌더되는 가구 (책상 뒤에 앉은 것처럼 하반신 가림).
// 나머지(벽/바닥/휘장/태극기)는 캐릭터 뒤(배경).
export const COURTROOM_FRONT_IDS = [
  "bench_judge",
  "desk_prosecutor",
  "desk_lawyer",
  "stand_witness",
  "box_jury",
  "bench_gallery",
  "gavel",
];

// ── 가구/소품 배치 (사용자 편집기 저장값 기준) ───────────────────────
export const COURTROOM_PROPS = [
  { id: "panel_wall", x: 50, y: 22.7, w: 100, h: 56, z: 0 },
  { id: "floor_wood", x: 50, y: 79, w: 100, h: 46, z: 1 },
  // 정면 중앙 휘장(무궁화·저울) — 법정 정면의 핵심. 크게.
  { id: "emblem_scale", x: 50, y: 8, w: 16, h: 24, z: 2 },
  // 태극기는 판사석 뒤 정면(휘장 오른쪽)에 게양
  { id: "flag_korea", x: 65, y: 13, w: 9, h: 22, z: 2 },
  // 판사석(법대): 정면 3인 합의부 폭으로 넓힘
  { id: "bench_judge", x: 50, y: 40, w: 42, h: 42, z: 3 },
  { id: "gavel", x: 64, y: 30, w: 7, h: 8, z: 4 },
  { id: "stand_witness", x: 68, y: 47, w: 13, h: 20, z: 4 },
  { id: "desk_prosecutor", x: 22, y: 62, w: 24, h: 28.5, z: 5 },
  { id: "desk_lawyer", x: 78, y: 60.1, w: 18, h: 28, z: 5 },
  // 배심원석: 에셋 비율(≈1.5:1)에 맞춘 큰 박스 (작게 안 보이게)
  { id: "box_jury", x: 50, y: 83, w: 66, h: 60, z: 5 },
];

// ── 좌석(아바타 자리) ────────────────────────────────────────────────
// jury 는 15석 = 3줄(뒤→앞) × 5. 뒤줄은 작게(원근), 앞줄은 크게.
// 배열 순서 = 렌더 순서(뒤줄 먼저 → 앞줄이 위에 겹침).
// face: 아바타 좌우반전 방향감 ('left' = 왼쪽(=무대 중앙/판사) 응시, 'right' = 오른쪽 응시).
//   학생 아바타는 정면 1장이라 측면뷰는 없고, 좌우반전으로 향하는 방향만 암시한다.
export const COURTROOM_SEATS = {
  // 판사 3석(합의부): [0] 가운데=재판장(judgeId), [1] 좌배석, [2] 우배석(associateJudgeIds)
  judge: [
    { x: 50, y: 20.5, w: 11 },
    { x: 39, y: 22, w: 9 },
    { x: 61, y: 22, w: 9 },
  ],
  // 검사(좌)↔변호사(우) 서로 안쪽을 향해 마주봄
  prosecutor: { x: 20, y: 54, w: 10, face: "right" },
  complainant: { x: 10, y: 56, w: 9, face: "right" },
  lawyer: { x: 80, y: 44.7, w: 10, face: "left" },
  defendant: { x: 90, y: 56, w: 9, face: "left" },
  // 증인석(우측 위) → 판사(중앙) 쪽을 향함
  witness: { x: 68, y: 41, w: 9, face: "left" },
  jury: [
    // 뒤줄 (가장 위, 작게)
    { x: 31, y: 70, w: 6 },
    { x: 40.5, y: 70, w: 6 },
    { x: 50, y: 70, w: 6 },
    { x: 59.5, y: 70, w: 6 },
    { x: 69, y: 70, w: 6 },
    // 가운데줄
    { x: 28, y: 80, w: 6.5 },
    { x: 39, y: 80, w: 6.5 },
    { x: 50, y: 80, w: 6.5 },
    { x: 61, y: 80, w: 6.5 },
    { x: 72, y: 80, w: 6.5 },
    // 앞줄 (가장 아래, 크게)
    { x: 25, y: 90, w: 7 },
    { x: 37.5, y: 90, w: 7 },
    { x: 50, y: 90, w: 7 },
    { x: 62.5, y: 90, w: 7 },
    { x: 75, y: 90, w: 7 },
  ],
};

export const JURY_SEAT_COUNT = COURTROOM_SEATS.jury.length; // 15

// 방청객 줄 배치 기준 (참가자 중 역할 없는 사람) — 좌우 가장자리 세로줄
export const COURTROOM_GALLERY = {
  startX: 6,
  gapX: 8,
  y: 48,
  perRow: 10,
  rowGapY: 6,
  w: 5,
};

// 역할별 뱃지 (머리 위)
export const ROLE_BADGES = {
  judge: { icon: "⚖️", label: "판사", color: "#6f42c1" },
  prosecutor: { icon: "📋", label: "검사", color: "#dc3545" },
  lawyer: { icon: "💼", label: "변호사", color: "#0d6efd" },
  complainant: { icon: "📝", label: "원고", color: "#198754" },
  defendant: { icon: "🛡️", label: "피고", color: "#fd7e14" },
  witness: { icon: "🙋", label: "증인", color: "#20c997" },
  jury: { icon: "👥", label: "배심원", color: "#0dcaf0" },
  spectator: { icon: "👀", label: "방청객", color: "#6c757d" },
};

export default { COURTROOM_PROPS, COURTROOM_SEATS, COURTROOM_GALLERY, ROLE_BADGES };
