// src/services/learningAppRegistry.js
// 🧩 학습앱 레지스트리 로더 — `platformApps/_registry` 문서 1개를 읽어 사이드바 목록을 만든다.
//
// 읽기 비용
//   이 앱은 학생 1명당 하루 약 1,775 읽기가 나온다. 여기에 페이지 이동마다 1읽기를 더하면
//   그게 곧 확산 비용이 된다. 그래서 **브라우저 세션당 최대 1회**만 읽는다
//   (sessionStorage + 모듈 캐시 + in-flight 중복 제거). 새로고침해도 세션이 살아 있으면 0읽기.
//
// 실패 정책 = fail-open **표시**, fail-closed 아님
//   레지스트리를 못 읽으면 기본 목록(코드 내 폴백)으로 뜬다. 여긴 권한 경계가 아니라
//   '바로가기 목록'이라 못 읽었다고 메뉴를 통째로 숨기는 게 더 나쁘다.
//   교사별 on/off 는 이 목록이 아니라 settings/menuLocks_{classCode} 가 담당한다.

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normalizeLearningApps, defaultLearningAppItems } from "../config/learningApps";
import logger from "../utils/logger";

const CACHE_KEY = "alchan_learning_apps_v1";
const TTL_MS = 12 * 60 * 60 * 1000; // 12시간 — 앱 목록은 거의 안 바뀐다
export const LEARNING_APPS_CHANGED = "learningApps:changed";

let cachedItems = null;   // 메뉴 아이템(아이콘 컴포넌트 포함) — 직렬화 불가라 메모리에만
let inFlight = null;

function readSession() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, apps } = JSON.parse(raw);
    if (!at || Date.now() - at > TTL_MS) return null;
    return apps;
  } catch { return null; }
}

function writeSession(apps) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), apps })); } catch { /* 용량 초과 등 무시 */ }
}

/** 동기 조회 — 항상 무언가를 돌려준다(캐시 → 세션 → 기본값). 첫 페인트에 쓴다. */
export function getLearningAppItems() {
  if (cachedItems) return cachedItems;
  const fromSession = readSession();
  if (fromSession) {
    const items = normalizeLearningApps(fromSession);
    if (items.length > 0) { cachedItems = items; return items; }
  }
  return defaultLearningAppItems();
}

/** 비동기 갱신 — 세션당 1회 읽는다. 목록이 바뀌면 LEARNING_APPS_CHANGED 이벤트를 쏜다. */
export function loadLearningAppItems() {
  if (cachedItems) return Promise.resolve(cachedItems);
  if (readSession()) return Promise.resolve(getLearningAppItems());
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const snap = await getDoc(doc(db, "platformApps", "_registry"));
      const apps = snap.exists() ? snap.data().apps : null;
      const items = normalizeLearningApps(apps);
      if (items.length === 0) {
        // 문서가 없거나 비었으면 기본값으로 간다. 세션 캐시에도 남겨 재조회를 막는다.
        writeSession(Array.isArray(apps) ? apps : []);
        cachedItems = defaultLearningAppItems();
      } else {
        writeSession(apps);
        cachedItems = items;
      }
    } catch (e) {
      logger.warn("[learningApps] 레지스트리 조회 실패 — 기본 목록으로 표시:", e?.message);
      cachedItems = defaultLearningAppItems();
    }
    try { window.dispatchEvent(new Event(LEARNING_APPS_CHANGED)); } catch { /* SSR 등 */ }
    inFlight = null;
    return cachedItems;
  })();
  return inFlight;
}

/** 레지스트리를 고친 직후 강제 재조회(관리 화면용). */
export function invalidateLearningApps() {
  cachedItems = null;
  inFlight = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
