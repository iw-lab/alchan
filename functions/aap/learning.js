// functions/aap/learning.js
// 📚 학습기록(`recordLearningEvent`, P1-3) — 계획서 §3.4.
//
// 무엇을 위한 것인가
//   "누가 얼마나 했는지"를 교사가 볼 수 있게 하는 것(P1-5 대시보드의 데이터원)이고,
//   보상이 옳게 나갔는지 나중에 되짚을 수 있게 하는 것이다. 집계만 남기면 부정 지급 조사·
//   정책 변경 후 재계산·통계 복구가 전부 불가능해진다(계획서 C17) → **원시 이벤트를 같이 남긴다.**
//
// 돈과의 관계 — **없다.**
//   이 엔드포인트는 잔액을 건드리지 않는다. 그래서 지급(`grantAppReward`)의 무거운 방어선
//   (세션 1회용 소비·멱등 원장·네 축 캡)을 그대로 지고 오지 않는다. 대신 **쓰기 비용**을
//   막는 방어선을 둔다: 레이트리밋 + 하루 이벤트 상한 + 하루 누적 초 상한.
//
//   ⚠️ 세션(`aapRewardSessions`)을 읽되 **소비하지 않는다.** 소비는 지급의 규약이고,
//      학습기록은 한 실행에서 여러 번 일어나는 게 정상이다. 이미 지급으로 소비된 세션도
//      기록에는 계속 쓸 수 있다 — 문제를 다 풀고 나서도 계속 노는 게 정상이니까.
const { logger, db, admin } = require("../utils");
const { verifyAppToken, pairwise } = require("./token");
const { readAppPolicy, checkPolicyOpen } = require("./policy");
const L = require("./learningRules");
// 지급과 **같은 버킷**을 쓴다. 사본을 만들지 않는다 — 이 저장소는 복붙 다섯 줄이
// 주급 과다지급으로 돌아온 전례가 있다(functions/jobUtils.js clampMaxJobs).
const { passRateLimit } = require("./reward");

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

/** 원시 이벤트 보존기간. 감사·재계산용이라 한 학기면 충분하다. */
const RAW_RETENTION_MS = 120 * 24 * 60 * 60 * 1000;

/** 거부를 사유 코드로 던진다. HTTP 변환은 진입점(handlers.js)이 한다. */
class LearningDenied extends Error {
  /** @param {string} reason 사유 코드 */
  constructor(reason) {
    super(reason);
    this.name = "LearningDenied";
    this.reason = reason;
  }
}

/**
 * 📚 학습 이벤트 1건을 기록한다.
 *
 * @param {object} p 파라미터
 * @param {*} p.body 요청 본문
 * @param {string} p.headerToken Authorization 헤더의 AAP 토큰
 * @param {number} [p.nowMs] 현재 시각
 * @return {Promise<object>} `{ok:true, value}` 또는 `{ok:false, reason}`
 */
async function recordLearningEvent({ body, headerToken, nowMs = Date.now() }) {
  // 1️⃣ 형식 — 트랜잭션을 열기 전에 거른다.
  const parsed = L.normalizeEvent(body);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const { kind, sec, score, hasScore, meta } = parsed.value;

  // 2️⃣ 토큰. 서명·수명·발급자를 여기서 다 본다.
  // ⚠️ `verifyAppToken` 은 **던지지 않고** `{ok, reason}` 을 돌려준다. try/catch 로 감싸면
  //    실패가 조용히 통과하고 `payload` 가 undefined 인 채로 흘러간다(2026-08-21 실측:
  //    appId 가 undefined 가 되어 "등록 안 된 앱"으로 오인됐다). 지급과 **같은 모양**으로 쓴다.
  const verified = verifyAppToken(headerToken, { nowMs });
  if (!verified.ok) {
    logger.warn(`[AAP] 학습기록 거부 — 토큰 ${verified.reason}`);
    return { ok: false, reason: "token_invalid" };
  }
  const { aud: appId, sub, jti } = verified.payload;
  if (!L.APP_ID_RE.test(appId)) return { ok: false, reason: "token_invalid" };

  const salt = process.env.AAP_PAIRWISE_SALT;
  if (!salt) {
    // fail-closed — salt 가 없으면 sub 를 재계산할 수 없고, 재계산 못 하는 신원은 안 믿는다.
    logger.error("[AAP] pairwise salt 미설정 — 학습기록 거부");
    return { ok: false, reason: "token_invalid" };
  }

  // 3️⃣ 레이트리밋 — **읽기보다 앞**이다. 지급과 같은 버킷(sub 키)을 공유한다:
  //    한 학생이 한 앱에서 만드는 부하는 지급이든 기록이든 같은 지갑에서 나가야 한다.
  //    따로 두면 두 배로 두드릴 수 있다.
  if (!(await passRateLimit(sub, appId, nowMs))) {
    return { ok: false, reason: "rate_limited" };
  }

  // 4️⃣ 정책. 학습기록은 돈이 아니라 **트랜잭션 밖에서** 읽어도 된다 —
  //    캐시하지 않고 지금 읽으므로 kill switch 는 즉시 듣고, TOCTOU 로 잃는 것도 없다
  //    (지급은 잔액이 걸려 있어 트랜잭션 안에서 읽는다).
  const policy = await readAppPolicy(appId);
  const open = checkPolicyOpen(policy);
  if (!open.ok) return { ok: false, reason: open.reason };
  if (policy.statsEnabled !== true) return { ok: false, reason: "stats_off" };

  const day = L.kstDayKey(nowMs);
  const sessionRef = db.collection("aapRewardSessions").doc(jti);

  const value = await db.runTransaction(async (tx) => {
    // ─── 읽기 구간 ───
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new LearningDenied("session_missing");
    const session = sessionSnap.data();

    // 세션이 이 토큰의 것인지 전부 대조한다. 하나라도 어긋나면 남의 실행권이다.
    if (session.appId !== appId || session.sub !== sub) throw new LearningDenied("session_mismatch");
    const uid = session.uid;
    const classCode = session.classCode;
    if (typeof uid !== "string" || !L.UID_RE.test(uid)) throw new LearningDenied("session_mismatch");
    if (typeof classCode !== "string" || !L.CLASS_CODE_RE.test(classCode)) {
      throw new LearningDenied("session_mismatch");
    }
    // sub 를 **재계산**해서 맞춘다 — 세션 문서가 잘못 쓰였어도 여기서 죽는다.
    if (pairwise(salt, appId, uid) !== sub) throw new LearningDenied("session_mismatch");
    // ⚠️ `consumedGrantId` 는 **보지 않는다.** 지급으로 소비된 세션도 기록은 계속 받는다.
    if (!Number.isFinite(session.exp) || nowMs >= session.exp * 1000) {
      throw new LearningDenied("session_expired");
    }

    const statsRef = db.doc(L.statsPath(classCode, uid, day, appId));
    const statsSnap = await tx.get(statsRef);
    const used = L.dayStats(statsSnap.exists ? statsSnap.data() : null, day);
    if (used === null) {
      logger.error(`[AAP] 학습집계 손상 class=${classCode} app=${appId} day=${day}`);
      throw new LearningDenied("stats_corrupt");
    }

    // ─── 판정 ───
    const limit = L.checkLimits({ used, sec });
    if (!limit.ok) throw new LearningDenied(limit.reason);

    // ─── 쓰기 ───
    const next = L.nextStats({ used, nowMs, sec, score, hasScore });
    // 계획서 §3.4: **식별값을 경로에만 두지 않는다** — 경로 안의 값은 쿼리할 수 없다(C15).
    tx.set(
      statsRef,
      {
        classCode,
        uid,
        date: day,
        appId,
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 🧾 원시 이벤트. 집계만 남기면 되짚을 수가 없다(C17). 보존기간은 둔다.
    //    문서 id 는 Firestore 가 만든다 — 앱이 정하게 하면 덮어쓰기·추측이 가능해진다.
    const rawRef = db.collection("appLearningEvents").doc();
    tx.set(rawRef, {
      classCode,
      uid,
      appId,
      date: day,
      kind,
      sec,
      ...(hasScore ? { score } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
      jti,
      at: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(nowMs + RAW_RETENTION_MS),
    });

    return { eventId: rawRef.id, date: day, appId, kind, stats: next };
  });

  return { ok: true, value };
}

module.exports = { recordLearningEvent, LearningDenied, RAW_RETENTION_MS };
