// src/utils/fetchCache.js
// 🔥 [읽기 절감 1단계] 세션 스코프 쿼리 캐시 — 페이지 재방문 시 중복 Firestore 읽기 차단.
//
// 설계 원칙 (readloop 버그클래스 방지):
// - React 상태를 일절 쓰지 않는 모듈 레벨 Map → 캐시 갱신이 재렌더/effect 재실행을 유발할 수 없음.
// - 메모리 전용(sessionStorage 미사용) — Firestore Timestamp 등 비직렬화 객체를 그대로 보존,
//   직렬화 버그 원천 차단. 새로고침 시 캐시는 비워지지만 SPA 내 페이지 이동에는 충분.
// - inflight dedupe: 같은 키의 동시 요청은 한 번만 Firestore에 나감(초기 로드 큐 경합 대비).
//
// 신선도 계약:
// - TTL은 호출부의 폴링 주기 이하로 잡는다 → staleness 상한이 기존 폴링과 동일(악화 없음).
// - 쓰기 직후에는 반드시 refetch()(=force) 또는 invalidateCache(prefix)를 호출할 것.

import { logger } from './logger';

const cache = new Map(); // key -> { data, ts }
const inflight = new Map(); // key -> Promise

// 계측(무료): window.__fetchCacheStats 로 hit/miss 실측 가능
const stats = { hits: 0, misses: 0, forced: 0 };
if (typeof window !== 'undefined') {
  window.__fetchCacheStats = stats;
}

// sessionStorage 네임스페이스 — invalidate 시 우리 키만 스캔하기 위함
const SS_PREFIX = 'fc:';

const ssRead = (key) => {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw); // { data, ts }
  } catch {
    return null;
  }
};
const ssWrite = (key, entry) => {
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* 쿼터 초과·직렬화 실패는 무시 — 메모리 캐시만으로 동작 */
  }
};

/**
 * TTL 캐시를 앞단에 둔 fetch.
 * @param {string} key - 캐시 키. 반드시 classCode/userId 등 격리 경계를 포함할 것.
 * @param {number} ttlMs - 이 시간 내 재요청은 캐시로 응답(Firestore 읽기 0).
 * @param {Function} fn - 실제 조회 함수(async).
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false] - true면 캐시 무시하고 조회 후 캐시 갱신(refetch/쓰기 후 경로).
 * @param {boolean} [opts.persist=false] - true면 sessionStorage에도 저장 — 새로고침(콜드 로드)
 *   후에도 TTL 내면 재사용. ⚠️ 순수 JSON 데이터에만 사용(Firestore Timestamp 등
 *   비직렬화 객체가 섞인 결과엔 금지 — CF httpsCallable 응답처럼 이미 JSON인 것만).
 */
export const cachedFetch = async (key, ttlMs, fn, { force = false, persist = false } = {}) => {
  if (!force && ttlMs > 0) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) {
      stats.hits += 1;
      return hit.data;
    }
    // 메모리 miss여도 새로고침 직후라면 sessionStorage에 살아있을 수 있음(persist 키만)
    if (persist) {
      const ss = ssRead(key);
      if (ss && Date.now() - ss.ts < ttlMs) {
        cache.set(key, ss); // 메모리로 승격
        stats.hits += 1;
        return ss.data;
      }
    }
    // 같은 키가 이미 조회 중이면 그 결과를 공유(중복 읽기 차단)
    const pending = inflight.get(key);
    if (pending) {
      stats.hits += 1;
      return pending;
    }
  }
  if (force) stats.forced += 1;
  else stats.misses += 1;

  // 🔥 세대 가드(교차검증 C6 반영): force 요청이 나간 뒤 앞선 non-force 응답이 늦게
  // 도착해도 최신 요청의 결과를 구데이터로 역덮어쓰지 못하게 한다.
  const promise = (async () => {
    try {
      const data = await fn();
      // 내가 여전히 이 키의 현재 요청일 때만 캐시 기록(뒤에 force가 나갔으면 스킵)
      if (inflight.get(key) === promise) {
        const entry = { data, ts: Date.now() };
        cache.set(key, entry);
        if (persist) ssWrite(key, entry);
      }
      return data;
    } finally {
      if (inflight.get(key) === promise) inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
};

/**
 * 접두사로 캐시 무효화. 쓰기 후 관련 키 일괄 제거용.
 * 예) invalidateCache(`laws:${classCode}`) / invalidateCache('') = 전체 비움(로그아웃·학급전환).
 */
export const invalidateCache = (prefix = '') => {
  let n = 0;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) {
      cache.delete(k);
      n += 1;
    }
  }
  // sessionStorage(persist 키)도 동일 prefix로 정리
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX) && k.slice(SS_PREFIX.length).startsWith(prefix)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
    n += toRemove.length;
  } catch {
    /* sessionStorage 접근 불가 환경 무시 */
  }
  if (n > 0) logger.debug(`[fetchCache] invalidate '${prefix}' → ${n}건`);
  return n;
};
