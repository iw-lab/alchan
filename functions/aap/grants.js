// functions/aap/grants.js
// 🧾 지급 원장 **조회** — 교사 화면(P1-5)이 환수할 건을 지목할 수 있게 하는 유일한 길.
//
// 왜 클라이언트가 직접 못 읽나
//   `appRewardGrants` 는 rules 에서 read 까지 닫혀 있다(슈퍼관리자도 못 읽는다). 열면
//   학생 uid·금액·성취·pairwise sub 가 한 문서에 모여 있는 걸 학급 전체가 긁을 수 있다.
//   그래서 **서버가 필드를 골라서** 내보낸다 — 화이트리스트가 코드에 있어야 원장에 필드가
//   하나 늘 때 그게 자동으로 화면에 새어 나가지 않는다.
//
// 왜 지금 필요한가
//   `clawbackAppReward` 는 `grantId` 로 1건을 지목한다. 그 값을 교사가 앱 안에서 얻을 길이
//   없어서, 환수 함수는 배포돼 있는데 **부를 수가 없었다**(파일럿 게이트 ②). 운영 스크립트
//   `scripts/ops/aap-grants.mjs` 가 그 자리를 임시로 메우고 있었다.
//
// 🔑 인덱스 제약 (2026-08-22 라이브 실측)
//   이 저장소 CI 는 `firestore:indexes` 를 배포하지 않는다. 실제로 재 보니
//   **등가 필터 3개까지는 새 복합인덱스 없이 통과**하고, 거기에 `orderBy` 를 하나라도
//   붙이면 `FAILED_PRECONDITION` 이다. 그래서 정렬은 메모리에서 한다(순수 모듈 `summarize`).
const { db } = require("../utils");
const Q = require("./grantsQuery");
const { GLOBAL_CEILING } = require("./rewardRules");

/** 역원장 일괄 조회 청크. `getAll` 은 가변 인자라 한 번에 다 넣으면 요청이 비대해진다. */
const GET_ALL_CHUNK = 100;

/** 커서 페이징 1회 크기. */
const PAGE = 100;

/** 거부 사유를 코드로 던진다. HttpsError 변환은 진입점(handlers.js)이 한다. */
class GrantsDenied extends Error {
  /** @param {string} reason 사유 코드 */
  constructor(reason) {
    super(reason);
    this.name = "GrantsDenied";
    this.reason = reason;
  }
}

/**
 * 원장 문서를 화면용으로 **골라서** 옮긴다.
 *
 * 🚫 나가지 않는 것: `sub`(pairwise 가명) · `jti`(실행권 id) · `clientRunId` · `eventId`.
 *    조사에 필요하면 운영 스크립트로 본다. 화면은 "무엇을 되돌릴지" 고르는 데 필요한 것만 든다.
 *
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 문서
 * @return {object} 투영
 */
function projectGrant(d) {
  const g = d.data() || {};
  return {
    // 문서 id = requestHash = 환수가 받는 `grantId`. 비밀이 아니다(활동로그 metadata 에도 있다).
    id: d.id,
    uid: g.uid,
    classCode: g.classCode,
    appId: g.appId,
    achievementId: g.achievementId,
    label: g.label,
    rewardType: g.rewardType,
    amount: g.amount,
    trustLevel: g.trustLevel,
    revocable: g.revocable === true,
    policyVersion: g.policyVersion,
    createdAtMs: typeof g.createdAt?.toMillis === "function" ? g.createdAt.toMillis() : 0,
  };
}

/**
 * 🔴 하루치를 **커서로 끝까지** 훑는다. `.limit(n)` 한 방으로 끝내면 안 된다.
 *
 * `orderBy` 가 없는 Firestore 쿼리의 암묵 정렬은 **문서 id 순**이고, 이 원장의 문서 id 는
 * `requestHash`(sha256 hex) — 시간과 아무 상관이 없다. 그래서 `.limit(300)` 은 "최신 300건"이
 * 아니라 **임의의 300건**을 준다. 그걸 메모리에서 최신순으로 재배열해 봐야 나머지는
 * **영원히 도달 불가**고(커서가 없으니 다음 장도 없다), 합계는 임의 표본 위에서 계산된다.
 * 이 화면의 존재 이유가 "환수할 `grantId` 를 얻는 유일한 길"인데, 그 건들에 대해서는 깨진다
 * (2026-08-22 codex WARNING — 내가 못 본 것이다).
 *
 * `orderBy(createdAt)` 로 푸는 길은 막혀 있다 — **새 복합인덱스**를 요구하고 이 저장소 CI 는
 * 인덱스를 배포하지 않는다(라이브 실측). 대신 문서 id 순 커서(`startAfter`)로 전부 훑는다.
 * 등가 필터 + `__name__` 커서는 인덱스 없이 통과하는 것을 라이브로 확인했다.
 *
 * ⚠️ **스캔 전체가 하나의 스냅샷은 아니다.** 페이지마다 별도 `get()` 이라, 스캔 도중 같은
 *    날짜·학급에 새 지급이 커밋되고 그 문서 id 가 **이미 지나간 커서보다 사전순 앞**이면
 *    이번 호출에서는 안 보인다. 영구 누락이 아니다 — 다음 호출은 처음부터 훑으므로 보인다.
 *    돈이 걸린 판정(캡·차단기)은 전부 지급 트랜잭션 안에서 원자적으로 끝나 있고 여기는
 *    **보여 주기**라, 몇 초 뒤 새로고침이면 되는 종류의 불일치다. 트랜잭션으로 감싸는 것은
 *    읽기 전용 화면에 지나치다. 다만 **여기가 원자적이라고 착각하면 안 되므로** 적어 둔다.
 *
 * 💰 1회 최악 읽기량: 원장 `cap` + 상한 확인 1 + 역원장 `cap`(getAll) + 호출자 문서 1.
 *    기본(cap=300)이면 약 602, 최대(cap=1000)면 약 2,002. **화면은 항상 기본값을 쓴다** —
 *    1000 은 슈퍼관리자가 조사할 때만 쓰라고 열어 둔 문이다.
 *
 * @param {FirebaseFirestore.Query} baseRef 필터가 걸린 쿼리
 * @param {number} cap 최대로 읽을 문서 수(비용 천장)
 * @return {Promise<{docs: Array<object>, capped: boolean}>} 문서와 상한 도달 여부
 */
async function scanGrants(baseRef, cap) {
  const docs = [];
  let cursor = null;
  while (docs.length < cap) {
    const want = Math.min(PAGE, cap - docs.length);
    // ⚠️ `.limit(0)` 을 실서버에 보내지 않는다 — 그 동작을 재 본 적이 없다(빈 결과일 수도,
    //    INVALID_ARGUMENT 일 수도 있다). 천장은 위 `while` 조건과 여기 둘이 함께 지킨다.
    //    (그래서 「천장 제거」 변이는 살아남는다 — 방어가 두 겹이라 한 겹을 지워도 멈춘다.
    //     테스트 공백이 아니라 의도된 이중 방어다.)
    if (want <= 0) break;
    let q = baseRef.limit(want);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    // 빈 장이 왔다 = 커서 뒤에 아무것도 없다. **여기서 끝내야 한다.**
    // `break` 로 빠지면 아래 +1 확인이 **같은 빈 구간을 한 번 더** 묻는다(빈 쿼리도 1읽기 과금),
    // 게다가 그 사이에 커서 뒤로 새 지급이 커밋되면 상한에 닿지도 않았는데 `truncated=true` 가
    // 뜬다 — 상한(예: 200)의 절반만 읽고도 "읽기 상한에 닿았습니다" 라는 **거짓 경고**다
    // (2026-08-22 codex 3차 NIT · 재현 확인). 빈 장은 +1 확인보다 **더 이른 시점의 같은 답**이다.
    if (snap.empty) return { docs, capped: false };
    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    // 요청한 만큼 못 받았으면 끝이다. **`PAGE` 가 아니라 `want` 와 비교**해야 한다 —
    // 마지막 장은 `want` 가 PAGE 보다 작을 수 있다.
    if (snap.size < want) return { docs, capped: false };
  }
  // 정확히 cap 만큼 받은 경우, **한 건 더 있는지 물어본다**(+1 읽기). 이게 없으면
  // 딱 맞게 끝난 날에도 "그날 전부가 아닙니다"라는 **거짓 경고**가 뜬다
  // (2026-08-22 codex NIT). 경고가 거짓말을 하기 시작하면 아무도 안 읽는다.
  if (cursor) {
    const more = await baseRef.limit(1).startAfter(cursor).get();
    return { docs, capped: !more.empty };
  }
  return { docs, capped: false };
}

/**
 * 역원장을 **지목한 건만** 읽는다.
 *
 * ⚠️ `where(classCode)` + 상한으로 긁지 않는다. 역원장에는 날짜 필드가 없어서 학급 단위로
 *    긁으면 학기 내내 쌓인 걸 다 받아야 하고, 상한에 걸려 잘리면 **이미 환수된 건이
 *    "환수 안 됨"으로 보인다.** 돈 화면에서 그건 거짓말이라, 정확한 쪽(문서 id 직접 조회)을 쓴다.
 *
 * @param {Array<string>} ids grantId 목록
 * @return {Promise<Map<string, object>>} grantId → 역원장 요약
 */
async function readClawbacks(ids) {
  const out = new Map();
  const col = db.collection("appRewardClawbacks");
  // 빈 목록이면 루프가 아예 안 돈다 = `getAll()` 호출 0. 앞에 조기 반환을 하나 더 뒀었는데,
  // 변이 시험에서 **그 줄을 지워도 아무 테스트가 안 깨졌다** — 막는 게 없는 줄이었다.
  // 방어하는 척하는 줄은 다음 사람이 진짜 방어로 읽는다.
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((id) => col.doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (!s.exists) continue;
      const c = s.data() || {};
      out.set(s.id, {
        requestedAmount: c.requestedAmount,
        recoveredAmount: c.recoveredAmount,
        shortfall: c.shortfall,
        reason: c.reason || "",
        byName: c.byName || "관리자",
        bySuperAdmin: c.bySuperAdmin === true,
        createdAtMs: typeof c.createdAt?.toMillis === "function" ? c.createdAt.toMillis() : 0,
      });
    }
  }
  return out;
}

/**
 * 🧾 하루치 지급 원장을 학급 스코프로 조회한다.
 *
 * @param {object} p 파라미터
 * @param {*} p.callerClass 호출자의 학급
 * @param {boolean} p.isSuperAdmin 슈퍼관리자 여부
 * @param {*} p.data 요청 데이터(day·appId·classCode·limit)
 * @param {number} [p.nowMs] 현재 시각
 * @return {Promise<object>} 조회 결과
 */
async function listAppRewards({ callerClass, isSuperAdmin, data, nowMs = Date.now() }) {
  const norm = Q.normalizeQuery(data, { callerClass, isSuperAdmin, nowMs });
  if (!norm.ok) throw new GrantsDenied(norm.reason);
  const { classCode, day, appId, limit, scope } = norm.value;

  let ref = db.collection("appRewardGrants").where("kstDay", "==", day);
  if (classCode) ref = ref.where("classCode", "==", classCode);
  if (appId) ref = ref.where("appId", "==", appId);

  const { docs, capped } = await scanGrants(ref, limit);
  const grants = docs.map(projectGrant);
  const clawbacks = await readClawbacks(grants.map((g) => g.id));
  const { rows, students, totals } = Q.summarize({ grants, clawbacks });

  return {
    day,
    classCode,
    appId,
    scope,
    limit,
    scanned: grants.length,
    // 🔴 잘렸으면 잘렸다고 말한다. 합계가 "그날 전부"가 아니게 되는 순간이라,
    //    화면이 이 값을 무시하면 교사는 부분 합계를 전체로 읽는다.
    truncated: capped,
    rows,
    students,
    totals,
    // 화면이 상한 상수를 따로 들고 있으면 서버와 어긋난다 — 판정 기준을 같이 내려보낸다.
    caps: {
      studentCashPerDay: GLOBAL_CEILING.STUDENT_CASH_PER_DAY,
      studentCouponPerDay: GLOBAL_CEILING.STUDENT_COUPON_PER_DAY,
      warnRatio: Q.ANOMALY.WARN_RATIO,
      dangerRatio: Q.ANOMALY.DANGER_RATIO,
    },
  };
}

// 내보내는 것은 **실제로 쓰이는 것만**. `projectGrant`·`readClawbacks` 는 이 파일 안에서만
// 쓰이므로 표면에 두지 않는다 — 넓은 export 는 "누가 쓰나"를 다음 사람이 다시 조사하게 만든다.
module.exports = { listAppRewards, GrantsDenied };
