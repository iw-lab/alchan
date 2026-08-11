// ===================================================================================
// 🔒 주기 작업 락 — Firestore 바인딩 (판정은 periodLock.js 순수 함수)
// ===================================================================================
// 종전 패턴은 `.get()` 으로 락을 확인하고 **별개 쓰기**로 락을 걸었다. 두 실행이 동시에
// "이번 주 락 없음"을 읽으면 둘 다 지급을 진행하고, 지급이 increment() 라 두 번 다 누적된다.
// (Cloud Scheduler 는 at-least-once 이고, 같은 일을 하는 public HTTP 경로가 따로 있다.
//  저장소에 `reverseLastWeeklySalary` — "2026-04-13 중복지급 롤백" — 가 남아 있는 이유다.)
//
// 더 나쁜 짝: 락이 **작업 시작 전**에 완료 표시로 걸려 있었다. 도중에 죽으면 그 주기는
// 영구 누락되는데 onSchedule 이 에러를 삼켜서 아무도 몰랐다. 그래서 셋을 함께 고친다.
//   ① 점유(claim)를 트랜잭션 안으로   ② 완료 표시는 작업이 **끝난 뒤**
//   ③ 실패하면 락을 풀어 다음 실행이 재시도할 수 있게
//
// ⚠️ 이 파일이 scheduler-http.js 안의 지역 함수가 아니라 **공유 모듈**인 이유:
//    2026-08-11 교차검증에서 두 계열이 각각 "한 곳을 빠뜨렸다"를 잡아냈다
//    (수동 weeklyRent/weeklyPropertyTax 엔드포인트, 그리고 배당). 락이 한 파일 안에만 있으면
//    다른 파일의 진입점은 구조적으로 이 규약 밖에 남는다. 여기 두면 어디서든 require 할 수 있다.

const { db, admin, logger } = require("./utils");
const { decideClaim } = require("./periodLock");

/**
 * 이번 주기를 점유한다. 성공하면 true, 이미 완료됐거나 다른 실행이 진행 중이면 false.
 * @param {FirebaseFirestore.DocumentReference} lockRef 락 문서
 * @param {string} periodKey 주차/일자/월 키 ("2026-W33" · "2026-08-11" · "2026-08")
 * @param {{forceRun?: boolean, label?: string}} [opts]
 * @returns {Promise<boolean>}
 */
async function claimPeriodLock(lockRef, periodKey, opts = {}) {
  const { forceRun = false, label = "작업" } = opts;
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const { claim, reason } = decideClaim(
      snap.exists ? snap.data() : null,
      periodKey,
      { forceRun },
    );
    if (!claim) {
      logger.info(`[${label}] ${periodKey} 점유 안 함 (${reason})`);
      return false;
    }
    if (reason === "in-progress-stale") {
      logger.warn(`[${label}] ${periodKey} 진행중 락이 방치됨 — 회수 후 재시도`);
    }

    tx.set(
      lockRef,
      {
        weekKey: periodKey,
        status: "in-progress",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
}

/** 성공 확정. 이 시점 이후에만 다음 실행이 "이미 했다"고 건너뛴다. */
async function completePeriodLock(lockRef, periodKey, extra = {}) {
  await lockRef.set(
    {
      weekKey: periodKey,
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extra,
    },
    { merge: true },
  );
}

/** 실패 표시. 다음 실행이 곧바로 재시도할 수 있게 한다(스로틀 없음). */
async function releasePeriodLock(lockRef, periodKey, error) {
  try {
    await lockRef.set(
      {
        weekKey: periodKey,
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: String(error?.message || error).slice(0, 500),
      },
      { merge: true },
    );
  } catch (releaseError) {
    // 락 해제까지 실패하면 stale 회수(periodLock.DEFAULT_STALE_MS)가 최후의 안전망이다.
    logger.error(`[락 해제 실패] ${periodKey}:`, releaseError);
  }
}

module.exports = { claimPeriodLock, completePeriodLock, releasePeriodLock };
