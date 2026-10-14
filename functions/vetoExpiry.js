// functions/vetoExpiry.js
// 🏛️ 거부권 재의결 기한(거부 시각 + 7일)이 지난 법안을 «폐기»(status: veto_expired)로 확정한다.
//   hourlySchedulerV2 가 매일 KST 0시에 부른다. 화면(src/utils/vetoDeadline.js)은 확정 전에도 기한이
//   지나면 폐기로 보이고, rules(naVetoOpen)는 기한 뒤 학생 표·재의결을 거부한다 — 셋이 같은 기준이다.
//
// 이 모듈은 firebase-admin 을 직접 부르지 않는다(db 를 받는다) — 단위 테스트와 e2e(에뮬레이터)에서
//   같은 함수를 그대로 돌리려고. 날짜는 Date 로 쓴다(Firestore 가 Timestamp 로 저장).

const VETO_OVERRIDE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function vetoDeadlineOf(data) {
  const v = data && data.vetoDate;
  const d = v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  return d ? new Date(d.getTime() + VETO_OVERRIDE_DAYS * DAY_MS) : null;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Date} [now]
 * @returns {Promise<{scanned:number, expired:number, skipped:number, errors:string[]}>}
 *   skipped = 읽은 뒤 누가 바꿔 건너뜀(정상), errors = 그 밖의 실패(스케줄러가 job 실패로 올린다)
 */
async function expireVetoedLaws(db, now = new Date()) {
  // ⚠️ status 등호 필터를 걸지 않는다 — collectionGroup 의 필터는 «컬렉션 그룹 범위» 단일 필드 색인이
  //   있어야 하는데 운영엔 없다(에뮬레이터는 색인을 안 따져 통과하고, 운영에서만 FAILED_PRECONDITION).
  //   법안은 학급당 수십 건이라 하루 한 번 두 필드만 훑는 게 싸다.
  const snap = await db.collectionGroup("nationalAssemblyLaws").select("status", "vetoDate").get();
  let expired = 0;
  let skipped = 0;
  const errors = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status !== "vetoed") continue;
    const deadline = vetoDeadlineOf(data);
    // 경계는 보수적으로: Date 는 밀리초 아래를 버려 실제 기한보다 최대 1ms 이르다 — 같은 밀리초면 아직 열린 것으로
    if (!deadline || now.getTime() <= deadline.getTime()) continue;
    try {
      // 읽은 뒤 누가 바꿨으면(교사 초기화 등) 건드리지 않는다
      await doc.ref.update(
        { status: "veto_expired", vetoExpiredAt: now, updatedAt: now },
        { lastUpdateTime: doc.updateTime },
      );
      expired++;
    } catch (e) {
      // FAILED_PRECONDITION(9) = lastUpdateTime 불일치 — 그 사이 바뀐 문서라 다음 날 다시 본다
      if (e && (e.code === 9 || e.code === "failed-precondition")) skipped++;
      else errors.push(`${doc.ref.path}: ${(e && e.message) || e}`);
    }
  }
  return { scanned: snap.size, expired, skipped, errors };
}

module.exports = { VETO_OVERRIDE_DAYS, vetoDeadlineOf, expireVetoedLaws };
