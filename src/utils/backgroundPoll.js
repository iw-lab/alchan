// src/utils/backgroundPoll.js
// 🔥 [비용 최적화] 방치된 탭이 백그라운드에서 Firestore를 계속 읽는 것을 막는 폴링 헬퍼.
//
// 문제(2026-07-26 실측): 새벽 내내 아무도 안 쓰는데 2시간마다 ~88읽기 버스트가 반복됐다.
//   원인은 setInterval tick에 아무 가드가 없는 폴러들(대시보드 jobs/commonTasks 등).
//   탭만 열어두면 학생 1명당 하루 수백~수천 읽기가 조용히 쌓인다.
//
// 해결: usePolling이 이미 쓰는 것과 동일한 규약을 재사용한다.
//   - tick은 탭이 보이고(visible) 사용자가 조작 중(not idle)일 때만 실행
//   - 탭 복귀/조작 재개 시, 마지막 조회가 resumeGapMs보다 오래됐으면 1회 즉시 조회
//   → 화면을 실제로 보는 순간의 신선도는 기존과 같거나 더 좋고, 안 보는 동안의 읽기만 0이 된다.
import { subscribeIdle, getIsIdle } from "./idleManager";

/**
 * @param {Function} fn 폴링할 조회 함수 (호출부가 초기 1회는 직접 실행한 뒤 이 헬퍼를 붙인다)
 * @param {number} intervalMs 폴링 주기
 * @param {{resumeGapMs?: number}} [opts] resumeGapMs: 복귀 시 재조회 최소 간격(기본 = intervalMs)
 * @returns {Function} 정리(cleanup) 함수
 */
export function startBackgroundPoll(fn, intervalMs, opts = {}) {
  const resumeGapMs = opts.resumeGapMs ?? intervalMs;
  let lastRun = Date.now();

  const isAwake = () =>
    typeof document === "undefined" ||
    (document.visibilityState === "visible" && !getIsIdle());

  const run = () => {
    lastRun = Date.now();
    fn();
  };

  const intervalId = setInterval(() => {
    if (isAwake()) run();
  }, intervalMs);

  // 탭 복귀 / 무조작 해제 시: 충분히 오래됐을 때만 1회 조회(잦은 탭 전환 증폭 차단)
  const resume = () => {
    if (!isAwake()) return;
    if (Date.now() - lastRun >= resumeGapMs) run();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", resume);
  }
  const unsubIdle = subscribeIdle({ onActive: resume });

  return () => {
    clearInterval(intervalId);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", resume);
    }
    unsubIdle();
  };
}
