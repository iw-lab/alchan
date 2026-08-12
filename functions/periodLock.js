/**
 * 주기 작업 락 판정 — 단일 진실원.
 *
 * 배경(2026-08-11 전수 교차검증 C4):
 *   주급 지급이 `.get()` 으로 락을 보고 **별개 쓰기**로 락을 걸었다. 두 실행이 동시에
 *   "이번 주 락 없음"을 읽으면 둘 다 지급하고, 지급이 increment() 라 두 번 다 누적된다.
 *   저장소에 `reverseLastWeeklySalary`("2026-04-13 중복지급 롤백")가 남아 있는 이유다.
 *
 *   더 나쁜 짝: 락이 **지급 시작 전에 완료 표시로** 걸려 있었다. 지급 도중 죽으면 그 주가
 *   영구 누락되는데, onSchedule 이 에러를 삼켜서(H6) 아무도 몰랐다.
 *
 * 그래서 규약을 셋으로 나눈다.
 *   in-progress : 점유했다. 아직 안 끝났다.
 *   completed   : 끝났다. 이 상태에서만 다음 실행이 건너뛴다.
 *   failed      : 실패했다. 다음 실행이 **즉시** 재점유한다.
 *
 * 판정만 순수 함수로 떼어 낸 이유: Firestore 트랜잭션 안에 있으면 테스트할 수 없기 때문이다.
 * 이 파일은 firebase-admin 을 import 하지 않는다(vitest 에서 그대로 require 가능).
 */

/** 진행중 락이 이만큼 방치되면 죽은 프로세스로 보고 회수한다. */
const DEFAULT_STALE_MS = 20 * 60 * 1000;

/**
 * 락 문서를 보고 이번 주기를 점유해도 되는지 판정한다.
 *
 * @param {object|null} lockData 락 문서 데이터(없으면 null)
 * @param {string} periodKey 주차/일자 키 ("2026-W33" · "2026-08-11")
 * @param {object} [opts]
 * @param {boolean} [opts.forceRun=false] 의도적 재실행(관리자 강제)
 * @param {number} [opts.nowMs=Date.now()] 현재 시각
 * @param {number} [opts.staleMs] 진행중 락 회수 임계
 * @returns {{claim: boolean, reason: string}}
 */
function decideClaim(lockData, periodKey, opts = {}) {
  const {
    forceRun = false,
    nowMs = Date.now(),
    staleMs: rawStaleMs = DEFAULT_STALE_MS,
  } = opts;
  // 0 이하가 들어오면 방금 시작한 락도 즉시 stale 로 회수돼 중복지급이 된다.
  // 지금은 오버라이드 호출자가 없지만, 이 값은 "돈이 두 번 나가느냐"를 가르므로 바닥을 둔다.
  const staleMs =
    Number.isFinite(rawStaleMs) && rawStaleMs > 0 ? rawStaleMs : DEFAULT_STALE_MS;

  // forceRun 은 "이미 완료된 주기를 **의도적으로** 다시 돈다"는 뜻이지
  // "다른 실행과 나란히 돈다"는 뜻이 아니다.
  // 종전엔 무조건 통과시켜서, 교사가 수동 징수 버튼을 연달아 두 번 누르면 두 실행이
  // 같은 스냅샷을 보고 **둘 다 걷었다**(2026-08-12 codex CRITICAL).
  // 그래서 force 도 "진행 중인 실행"은 존중한다 — 완료·실패만 관통한다.
  if (forceRun) {
    if (lockData?.status === "in-progress") {
      const startedMs = toMillis(lockData.startedAt);
      if (startedMs !== null && nowMs - startedMs < staleMs) {
        return { claim: false, reason: "force-blocked-by-in-progress" };
      }
      if (startedMs === null) {
        return { claim: false, reason: "force-blocked-unknown-start" };
      }
    }
    return { claim: true, reason: "force-run" };
  }
  if (!lockData) return { claim: true, reason: "no-lock" };

  // 락 문서는 두 모양을 쓴다: 주간 작업은 weekKey, 일간 작업은 date.
  const sameKey =
    lockData.weekKey === periodKey || lockData.date === periodKey;
  if (!sameKey) return { claim: true, reason: "new-period" };

  // status 가 없는 문서 = 이 규약 이전(구버전)이 **완료 후** 남긴 것.
  // 구버전은 애초에 시작 시점에 락을 박았으니, 같은 키가 남아 있다는 건 그 주를 이미 돌았다는 뜻이다.
  // 여기서 claim 을 내주면 배포 직후 그 주 주급이 한 번 더 나간다 — 반드시 건너뛴다.
  if (lockData.status === undefined) return { claim: false, reason: "legacy-completed" };

  if (lockData.status === "completed") return { claim: false, reason: "completed" };

  if (lockData.status === "in-progress") {
    const startedMs = toMillis(lockData.startedAt);
    if (startedMs === null) {
      // 시작 시각을 못 읽으면 진행 중으로 간주한다(중복지급보다 1회 누락이 덜 나쁘다 —
      // 누락은 관리자가 force 로 되돌릴 수 있지만 중복지급은 회수해야 한다).
      return { claim: false, reason: "in-progress-unknown-start" };
    }
    if (nowMs - startedMs < staleMs) {
      return { claim: false, reason: "in-progress-fresh" };
    }
    return { claim: true, reason: "in-progress-stale" };
  }

  // "failed" 및 알 수 없는 status → 재점유
  return { claim: true, reason: lockData.status === "failed" ? "failed-retry" : "unknown-status" };
}

/** Firestore Timestamp · admin SDK 원시형 · Date · number 를 ms 로. 못 읽으면 null. */
function toMillis(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

module.exports = { decideClaim, toMillis, DEFAULT_STALE_MS };
