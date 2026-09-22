// src/services/learningAppFavorites.js
// ⭐ 학습 사이트 «즐겨찾기 + 자주 쓴 것» — 학생마다 다른 목록을 **그 기기 안에서** 관리한다.
//
// 왜 필요한가 (2026-09-22 사용자)
//   학습 사이트가 37개가 됐다. 날마다 쓰는 하나를 찾으려고 아이가 목록을 훑는다.
//
// 왜 «자동 정렬»이 아니라 «별»인가
//   AlchanSidebar 의 주석이 이미 못박아 뒀다 — 「순서가 매번 바뀌면 «아까 거기 있었는데»가 된다.
//   순서는 결정적이어야 한다」. 누른 것이 통째로 맨 위로 오면 교사의 「위에서 세 번째」가 깨진다.
//   그래서 **본문 순서는 건드리지 않고**, 맨 위에 «자주 쓴 것 3개»와 «내 즐겨찾기»만 얹는다.
//
// 🔴 저장은 **학생 ID로 키를 나눈다**. 학교 태블릿은 교시마다 주인이 바뀐다 — 키를 안 나누면
//    다음 학생 화면에 남의 즐겨찾기가 뜬다(사이드바의 `lastAssetViewAt:${userId}` 와 같은 규칙).
// 🔴 localStorage 는 **없을 수도, 던질 수도 있다**(사파리 프라이빗·용량 초과·정책 차단).
//    읽기·쓰기를 전부 try 로 감싸고, 실패하면 «즐겨찾기가 없는 평소 화면»으로 조용히 돌아간다 —
//    사이드바가 통째로 죽는 것보다 낫다.

const FAV_KEY = (uid) => `alchan:favApps:${uid || "anon"}`;
const USE_KEY = (uid) => `alchan:appUse:${uid || "anon"}`;

/** 한 학생이 고정할 수 있는 개수 — 넘으면 «묶음»이 아니라 또 하나의 긴 목록이 된다 */
export const FAV_MAX = 8;
/** 자동으로 얹는 «자주 쓴 것» 개수 */
export const TOP_USED = 3;
/** 이 횟수 미만은 «자주»가 아니다 — 한 번 눌러 본 것이 맨 위에 오래 남으면 그게 더 헷갈린다 */
export const MIN_USES = 2;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // 용량 초과·프라이빗 모드 — 기능만 조용히 쉰다
  }
}

/** 이 학생이 별을 단 앱 id 배열(고른 순서 그대로) */
export function loadFavorites(userId) {
  const v = read(FAV_KEY(userId), []);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, FAV_MAX) : [];
}

/** 별을 켜고 끈다. 새 목록을 돌려준다(상태를 부르는 쪽이 들고 있게). */
export function toggleFavorite(userId, appId) {
  if (!appId) return loadFavorites(userId);
  const cur = loadFavorites(userId);
  const next = cur.includes(appId) ? cur.filter((x) => x !== appId) : [...cur, appId].slice(-FAV_MAX);
  write(FAV_KEY(userId), next);
  return next;
}

/** 앱을 열 때마다 한 번 — 「자주 쓴 것」의 근거를 쌓는다(횟수 + 마지막 시각) */
export function recordUse(userId, appId, now = Date.now()) {
  if (!appId) return;
  const uses = read(USE_KEY(userId), {});
  const prev = uses[appId] && typeof uses[appId] === "object" ? uses[appId] : { n: 0, at: 0 };
  uses[appId] = { n: (Number(prev.n) || 0) + 1, at: now };
  write(USE_KEY(userId), uses);
}

/**
 * 「자주 쓴 것」 — 많이 누른 순, 같으면 최근에 누른 순.
 * 🔴 즐겨찾기에 이미 있는 것은 **뺀다**. 같은 앱이 위아래로 두 번 보이면 목록이 길어지기만 한다.
 */
export function topUsed(userId, appIds, favorites = null, limit = TOP_USED) {
  const uses = read(USE_KEY(userId), {});
  const favs = new Set(favorites || loadFavorites(userId));
  const known = new Set(appIds || []);
  return Object.entries(uses)
    .filter(([id, v]) => known.has(id) && !favs.has(id) && (Number(v?.n) || 0) >= MIN_USES)
    .sort((a, b) => (Number(b[1].n) || 0) - (Number(a[1].n) || 0) || (Number(b[1].at) || 0) - (Number(a[1].at) || 0))
    .slice(0, limit)
    .map(([id]) => id);
}

/** 화면이 그릴 «위쪽 묶음» 두 개 — 비면 그 머리글 자체를 그리지 않는다(빈 제목은 자리만 먹는다) */
export function pinnedSections(userId, apps) {
  const ids = (apps || []).map((a) => a.id);
  const favs = loadFavorites(userId).filter((id) => ids.includes(id));
  const used = topUsed(userId, ids, favs);
  const byId = new Map((apps || []).map((a) => [a.id, a]));
  return {
    favorites: favs.map((id) => byId.get(id)).filter(Boolean),
    frequent: used.map((id) => byId.get(id)).filter(Boolean),
  };
}
