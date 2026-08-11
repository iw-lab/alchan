/**
 * 주기 작업 락 판정 — `functions/periodLock.js` decideClaim.
 *
 * 이 락이 지키는 것은 "주급을 두 번 주지 않는다"와 "주급을 한 주 통째로 빼먹지 않는다"
 * 둘 **다**이다. 둘은 서로 반대 방향이라 한쪽만 보면 반드시 다른 쪽이 깨진다.
 *
 *   중복지급 → 저장소에 `reverseLastWeeklySalary`("2026-04-13 중복지급 롤백")가 남아 있다.
 *   영구누락 → 락이 지급 **전에** 완료 표시로 걸려 있어서, 지급 도중 죽으면 그 주가 사라졌다.
 *              게다가 onSchedule 이 에러를 삼켜서 아무도 몰랐다.
 *
 * 그래서 여기서 지키는 불변식은 셋이다.
 *   ① 완료된 주기는 절대 다시 점유하지 않는다 (중복지급 차단)
 *   ② 실패한 주기는 즉시 다시 점유한다 (영구누락 차단)
 *   ③ 구버전이 남긴 status 없는 문서는 '완료'로 읽는다 (배포 직후 재지급 차단)
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { decideClaim, toMillis, DEFAULT_STALE_MS } = require_(
  "../../../functions/periodLock.js",
);

const WEEK = "2026-W33";
const NOW = Date.UTC(2026, 7, 17, 0, 0, 0); // 2026-08-17 (월)

describe("① 완료된 주기는 다시 점유하지 않는다 — 중복지급 차단", () => {
  it("completed 면 건너뛴다", () => {
    const r = decideClaim({ weekKey: WEEK, status: "completed" }, WEEK, {
      nowMs: NOW,
    });
    expect(r.claim).toBe(false);
    expect(r.reason).toBe("completed");
  });

  it("다른 실행이 방금 점유했으면 건너뛴다", () => {
    const r = decideClaim(
      { weekKey: WEEK, status: "in-progress", startedAt: NOW - 60_000 },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
    expect(r.reason).toBe("in-progress-fresh");
  });

  it("startedAt 을 못 읽으면 진행중으로 보고 건너뛴다 — 누락이 중복지급보다 낫다", () => {
    const r = decideClaim(
      { weekKey: WEEK, status: "in-progress", startedAt: { 이상한: "모양" } },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
    expect(r.reason).toBe("in-progress-unknown-start");
  });
});

describe("② 실패한 주기는 즉시 다시 점유한다 — 영구누락 차단", () => {
  it("failed 면 스로틀 없이 바로 재점유", () => {
    const r = decideClaim(
      { weekKey: WEEK, status: "failed", startedAt: NOW - 1000 },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("failed-retry");
  });

  it("진행중 락이 임계를 넘겨 방치되면 회수한다 (프로세스가 통째로 죽은 경우)", () => {
    const r = decideClaim(
      {
        weekKey: WEEK,
        status: "in-progress",
        startedAt: NOW - DEFAULT_STALE_MS - 1,
      },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("in-progress-stale");
  });

  it("임계 직전 1ms 는 아직 회수하지 않는다 (경계)", () => {
    const r = decideClaim(
      {
        weekKey: WEEK,
        status: "in-progress",
        startedAt: NOW - DEFAULT_STALE_MS + 1,
      },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
  });
});

describe("③ 구버전 문서 호환 — 배포 직후 재지급 차단", () => {
  it("status 없는 같은 주 문서는 '이미 완료'로 읽는다", () => {
    // 라이브 실측(2026-08-11): {weekKey:"2026-W32", startedAt, lastPayDate} — status 없음.
    // 여기서 claim 을 내주면 배포 직후 그 주 주급이 한 번 더 나간다.
    const r = decideClaim(
      { weekKey: "2026-W32", startedAt: NOW - 999, lastPayDate: "2026-08-10" },
      "2026-W32",
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
    expect(r.reason).toBe("legacy-completed");
  });

  it("구버전 문서라도 주차가 바뀌면 점유한다", () => {
    const r = decideClaim(
      { weekKey: "2026-W32", startedAt: NOW - 999 },
      "2026-W33",
      { nowMs: NOW },
    );
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("new-period");
  });
});

describe("부분 실패 재시도 — 학급 하나가 터져도 그 주가 사라지지 않는다", () => {
  // payWeeklySalariesLogic 은 학급 하나가 실패하면 락을 'failed' 로 둔다.
  // 종전엔 완료로 박혀서 그 학급 학생들은 그 주 주급을 영영 못 받았다(재시도 경로 없음).
  // 학급 단위 멱등 마커(salaryLastPaidWeekKey)가 생겨 재실행이 안전해졌기에 가능해진 동작이다.
  it("일부 학급 실패로 남긴 failed 락은 같은 주에도 재점유된다", () => {
    const r = decideClaim(
      {
        weekKey: WEEK,
        status: "failed",
        startedAt: NOW - 5 * 60_000,
        lastError: "1개 학급 지급 실패",
      },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("failed-retry");
  });

  it("성공으로 끝난 주는 재점유되지 않는다 (같은 주 두 번 지급 금지)", () => {
    const r = decideClaim(
      { weekKey: WEEK, status: "completed", failedClassCount: 0 },
      WEEK,
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
  });
});

describe("문서 모양 · 강제 실행", () => {
  it("락 문서가 아예 없으면 점유한다", () => {
    expect(decideClaim(null, WEEK, { nowMs: NOW }).claim).toBe(true);
  });

  it("일간 작업은 date 필드로 같은 주기를 판정한다", () => {
    const r = decideClaim(
      { date: "2026-08-17", status: "completed" },
      "2026-08-17",
      { nowMs: NOW },
    );
    expect(r.claim).toBe(false);
  });

  it("forceRun 은 완료된 주기도 관통한다 (관리자 의도적 재지급)", () => {
    const r = decideClaim({ weekKey: WEEK, status: "completed" }, WEEK, {
      forceRun: true,
      nowMs: NOW,
    });
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("force-run");
  });

  it("알 수 없는 status 는 재점유한다 (묶여서 영영 못 도는 것보다 낫다)", () => {
    const r = decideClaim({ weekKey: WEEK, status: "뭔가이상함" }, WEEK, {
      nowMs: NOW,
    });
    expect(r.claim).toBe(true);
    expect(r.reason).toBe("unknown-status");
  });
});

describe("toMillis — Firestore Timestamp 여러 모양", () => {
  it("Timestamp(toMillis) · admin 원시형(_seconds) · seconds · Date · number 를 모두 읽는다", () => {
    expect(toMillis({ toMillis: () => 1234 })).toBe(1234);
    expect(toMillis({ _seconds: 10 })).toBe(10_000);
    expect(toMillis({ seconds: 10 })).toBe(10_000);
    expect(toMillis(new Date(5000))).toBe(5000);
    expect(toMillis(7777)).toBe(7777);
  });

  it("읽을 수 없는 값은 null 을 준다 (0 으로 떨어뜨리면 stale 로 오판한다)", () => {
    expect(toMillis(null)).toBe(null);
    expect(toMillis(undefined)).toBe(null);
    expect(toMillis({})).toBe(null);
  });
});
