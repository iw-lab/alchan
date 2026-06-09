// src/utils/idleManager.js
// 🔥 [비용 최적화] 전역 사용자 활동(idle) 추적기.
// 문제: 모든 폴러가 "탭 숨김(visibilitychange)"만 감지하고, 크롬북 화면을 켠 채
//       아무 조작도 안 하는 "foreground 방치" 상태는 감지하지 못해 밤새도록 폴링 → Firestore 읽기 폭주.
// 해결: mousemove/keydown/touch/scroll 등으로 마지막 활동 시각을 추적하고,
//       IDLE_THRESHOLD(기본 5분) 무조작이면 idle 상태로 전환해 구독자(폴러)들이 폴링을 멈추게 한다.
//       어떤 조작이든 들어오면 즉시 active로 복귀하고 구독자가 1회 즉시 fetch + 폴링 재개한다.
// 비용: 전역 setInterval 1개(30초, Firestore 읽기 없음) + passive 이벤트 리스너뿐.

const IDLE_THRESHOLD = 5 * 60 * 1000; // 5분 무조작 → idle
const CHECK_INTERVAL = 30 * 1000; // 30초마다 idle 진입 판정

let lastActivity = Date.now();
let idle = false;
const listeners = new Set(); // { onIdle?, onActive? }

function notify(active) {
  listeners.forEach((l) => {
    try {
      if (active) l.onActive && l.onActive();
      else l.onIdle && l.onIdle();
    } catch {
      /* 구독자 콜백 오류는 무시 */
    }
  });
}

function markActivity() {
  lastActivity = Date.now();
  if (idle) {
    idle = false;
    notify(true); // active 복귀 → 구독자 즉시 fetch + 재개
  }
}

if (typeof window !== "undefined") {
  const opts = { passive: true, capture: true };
  ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel", "click"].forEach(
    (ev) => window.addEventListener(ev, markActivity, opts),
  );
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") markActivity();
    });
  }
  // 주기적 idle 진입 판정 (Firestore 읽기 없음)
  setInterval(() => {
    if (!idle && Date.now() - lastActivity > IDLE_THRESHOLD) {
      idle = true;
      notify(false); // idle 진입 → 구독자 폴링 정지
    }
  }, CHECK_INTERVAL);
}

/** 현재 사용자가 무조작(idle) 상태인지 */
export function getIsIdle() {
  return idle;
}

/**
 * idle/active 전이 구독. 폴러는 onIdle에서 폴링 정지, onActive에서 즉시 1회 fetch + 재개.
 * @returns {Function} 구독 해제 함수
 */
export function subscribeIdle({ onIdle, onActive }) {
  const l = { onIdle, onActive };
  listeners.add(l);
  return () => listeners.delete(l);
}

export { IDLE_THRESHOLD };
