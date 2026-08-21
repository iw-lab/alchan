// functions/aap/reward.js
// 💸 `grantAppReward` 의 본체 — 토큰 → 세션 → 카탈로그 → 네 축 캡 → **한 트랜잭션**으로 지급.
//
// 이 파일이 지키는 불변식 셋 (하나라도 깨지면 돈이 샌다)
//   ① 지급·원장·세션소비·카운터는 **같은 트랜잭션**이다. 원장 생성 실패 = 지급 전체 실패.
//      (`utils.logActivity` 를 쓰지 않는 이유가 이것이다 — 그쪽은 트랜잭션 **밖**에서 user 를
//       다시 읽고 내부 오류를 catch 하고 계속한다 → **돈만 들어가고 기록이 없을** 수 있다.
//       게다가 `activity_logs` 는 같은 학급 사용자가 만들 수 있어 정본이 될 수 없다.)
//   ② **멱등 조회가 정책·캡보다 먼저**다. 첫 호출이 성공했는데 응답만 유실된 재시도를
//      "지금은 캡이 찼다"로 거부하면 **학생 화면은 실패인데 잔액은 이미 늘어 있다.**
//      이미 성공한 결과를 돌려주는 것은 새 지급이 아니다.
//   ③ 금액·종류·횟수·쿨다운은 **카탈로그만** 정한다. 요청에는 achievementId 밖에 없다.
//      (클라가 금액을 보내고 서버가 캡으로 막으면 **캡이 방어가 아니라 가격표**가 된다.)
//
// 세션이 왜 필요한가 (설계 1판이 성립하지 않았던 이유)
//   AAP 토큰에는 **uid 가 없다.** 아이를 앱 사이로 연결하지 못하게 앱별 pairwise `sub` 만 싣는다.
//   위성앱은 다른 origin 이라 Firebase 세션도 없다 → `onCall` 로 받을 수 없고(`onCall` 의
//   Bearer 는 Firebase ID 토큰이다), `onRequest` 로 받으면 **누구에게 줄지 알 수 없다.**
//   요청에 담긴 uid 를 믿으면 남에게 지급된다.
//   → **발급 시점에 서버가 기억한다.** `issueAppToken` 이 `aapRewardSessions/{jti}` 를 쓰고,
//     지급 때 그 문서로 uid 를 되찾는다. 이 문서가 곧 **1회용 실행권**이라 재생 방어도 겸한다.
const { db, admin, logger, LOG_TYPES, sanitizeInput } = require("../utils");
const { verifyAppToken, pairwise, SKEW_SEC } = require("./token");
// ⚠️ `readAppPolicy` 를 **일부러 안 쓴다** — 그건 트랜잭션 밖 읽기라 kill switch TOCTOU 가 열린다.
const { checkPolicyOpen, APP_ID_RE } = require("./policy");
const catalog = require("./catalog");
const R = require("./rewardRules");
const { passRewardBucket } = require("./rateBucket");

const { FieldValue, Timestamp } = admin.firestore;

/** 지급 원장은 지우지 않는다(감사 대상). 멱등 재시도 창은 TTL 이 아니라 원장 수명이 정한다. */
const SESSION_TTL_MARGIN_SEC = SKEW_SEC;

/** 실패를 사유와 함께 위로 던지는 표식. 운영 장애(UNAVAILABLE 등)와 섞이지 않게 한다. */
class RewardDenied extends Error {
  /**
   * @param {string} reason 거부 사유 코드
   */
  constructor(reason) {
    super(`aap_reward_denied:${reason}`);
    this.reason = reason;
  }
}

/**
 * 🪣 레이트리밋 — **지급 트랜잭션 밖**의 짧은 트랜잭션.
 *
 * 안에 두면 실패한 호출이 롤백되어 아무것도 안 남는다: 잘못된 achievementId 를 초당 100번
 * 보내는 공격이 **카운트되지 않는다**(설계 2판 CRITICAL).
 *
 * 🔑 키가 uid 가 아니라 **토큰의 `sub`** 인 이유 (2026-08-21 자체 적대 검토에서 고침)
 *   sub 는 앱별 pairwise 값이라 이미 (학생 × 앱) 단위이고, **토큰만 보면 알 수 있다.**
 *   uid 로 키를 만들려면 먼저 세션 문서를 읽어야 하는데, 그러면 레이트리밋이 그 읽기보다
 *   **뒤**에 오게 된다 → 보상이 꺼진 앱(=세션 문서가 없는 앱)의 유효 토큰 하나로
 *   `session_missing` 경로를 무한히 두드려 **읽기 비용만 태우는 길**이 열린다.
 *   sub 로 키를 잡으면 Firestore 읽기 0회로 첫 관문을 세울 수 있다.
 *   덤: 이 문서에 uid 를 담지 않아도 된다(초등학생 데이터다).
 *
 * @param {string} sub 검증된 토큰의 pairwise 식별자
 * @param {string} appId 앱 id (진단용 — 키에는 이미 반영돼 있다)
 * @param {number} nowMs 현재 시각
 * @return {Promise<boolean>} 통과하면 true
 */
// (async 를 붙이지 않는다 — 안쪽 트랜잭션 프라미스를 그대로 돌려준다)
// 구현은 `rateBucket.js` 한 곳에 있다. 여기 이름을 남겨 두는 이유는 이 파일의 호출부와
// 위 주석(왜 키가 sub 인가)이 짝이기 때문이다.
function passRateLimit(sub, appId, nowMs) {
  return passRewardBucket(sub, appId, nowMs);
}

/**
 * 요청 형식 검증. **여기서 걸러야 트랜잭션이 안 열린다.**
 *
 * @param {object} body 요청 본문
 * @param {string} headerToken Authorization 헤더에서 뽑은 토큰(없으면 "")
 * @return {{ok: boolean, reason?: string, value?: object}} 판정
 */
/**
 * 🔔 차단기 경보를 남긴다 — **커밋 후, 트랜잭션 밖**.
 *
 * 왜 밖인가: 트랜잭션 안에서 `create()` 로 "하루 한 번"을 만들면, 그날 경보가 이미 있는
 * 순간부터 **모든 지급이 ALREADY_EXISTS 로 롤백된다.** 경보를 만들려다 지급을 끄는 셈이다
 * (2026-08-21 codex CRITICAL). 그래서 보호(카운터 플래그·정책 latch)만 원자적으로 하고,
 * 통지는 최선노력으로 분리했다. 통지가 유실돼도 지급은 이미 멈춰 있다.
 *
 * 두 갈래로 남긴다:
 *   · `logger.error` — Cloud Monitoring 의 **로그 기반 알림 정책**을 이 라벨에 건다.
 *     코드가 슬랙·메일 같은 외부 채널을 알 필요가 없다.
 *     ⚠️ 정책을 실제로 걸고 수신까지 확인해야 경보다. 로그를 뱉는 것만으로는 아니다.
 *   · `platformAlerts/{day}_{appId}_{kind}` — 나중에 교사 화면이 읽을 자리.
 *     `set()` 이다(`create()` 아님 — 충돌이 곧 실패였다).
 *
 * @param {string} appId 앱
 * @param {string} classCode 학급
 * @param {string} day KST YYYYMMDD
 * @param {object} breaker checkBreaker 결과
 * @return {Promise<void>}
 */
async function announceBreaker(appId, classCode, day, breaker) {
  const kind = `${breaker.rewardType}_${breaker.newlyTripped ? "trip" : "alert"}`;
  logger.error("[AAP] 보상 차단기", {
    event: "aap_reward_alert",
    kind,
    app: appId,
    classCode,
    day,
    rewardType: breaker.rewardType,
    observed: breaker.observed,
    threshold: breaker.newlyTripped ? breaker.tripAt : breaker.alertAt,
    cap: breaker.cap,
    // 끊겼으면 breaker-reset 전까지 안 풀린다 — 로그만 보고도 조치 여부를 알 수 있어야 한다.
    tripped: breaker.tripped,
  });
  await db
    .collection("platformAlerts")
    .doc(`${day}_${appId}_${kind}`)
    .set(
      {
        kind,
        appId,
        classCode,
        day,
        rewardType: breaker.rewardType,
        observed: breaker.observed,
        threshold: breaker.newlyTripped ? breaker.tripAt : breaker.alertAt,
        cap: breaker.cap,
        tripped: breaker.tripped,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

function parseRequest(body, headerToken) {
  const src = body && typeof body === "object" ? body : {};
  // 헤더가 우선이다 — 본문에 토큰이 있으면 프록시·에러리포터 로그에 남기 쉽다.
  const token = headerToken || (typeof src.token === "string" ? src.token : "");
  if (!token) return { ok: false, reason: "token_invalid" };

  const achievementId = src.achievementId;
  if (typeof achievementId !== "string" || !catalog.ACHIEVEMENT_ID_RE.test(achievementId)) {
    return { ok: false, reason: "malformed" };
  }
  const clientRunId = src.clientRunId;
  if (typeof clientRunId !== "string" || !R.CLIENT_RUN_ID_RE.test(clientRunId)) {
    return { ok: false, reason: "malformed" };
  }
  // eventId 는 P1-3(서버 발급 nonce)의 자리다. P1-2 에서는 없어도 된다 —
  // 세션이 1회용이라 재생은 그쪽에서 막힌다.
  const eventIdRaw = src.eventId === undefined ? "" : src.eventId;
  if (typeof eventIdRaw !== "string") return { ok: false, reason: "malformed" };
  if (eventIdRaw && !R.EVENT_ID_RE.test(eventIdRaw)) return { ok: false, reason: "malformed" };

  return { ok: true, value: { token, achievementId, clientRunId, eventId: eventIdRaw } };
}

/**
 * 지급 본체.
 *
 * @param {object} p 파라미터
 * @param {object} p.body 요청 본문
 * @param {string} [p.headerToken] Authorization: Bearer 에서 뽑은 토큰
 * @param {number} [p.nowMs] 테스트용 시각 고정
 * @return {Promise<{ok: boolean, reason?: string, value?: object}>} 결과
 */
async function grantAppReward({ body, headerToken = "", nowMs = Date.now() }) {
  const parsed = parseRequest(body, headerToken);
  if (!parsed.ok) return parsed;
  const { token, achievementId, clientRunId, eventId } = parsed.value;

  // 1️⃣ 토큰 — 서명·alg·iss·ver·exp·iat. 여기서 막히면 Firestore 를 한 번도 안 읽는다.
  const verified = verifyAppToken(token, { nowMs });
  if (!verified.ok) {
    logger.warn(`[AAP] 지급 거부 — 토큰 ${verified.reason}`);
    return { ok: false, reason: "token_invalid" };
  }
  const { aud: appId, sub, jti } = verified.payload;
  if (!APP_ID_RE.test(appId)) return { ok: false, reason: "token_invalid" };

  const salt = process.env.AAP_PAIRWISE_SALT;
  if (!salt) {
    // fail-closed. salt 가 없으면 sub 를 재계산할 수 없고, 재계산 못 하는 신원으로는 지급하지 않는다.
    logger.error("[AAP] pairwise salt 미설정 — 지급 거부");
    return { ok: false, reason: "token_invalid" };
  }

  // 2️⃣ 레이트리밋 — **Firestore 를 읽기 전에**, 그리고 지급 트랜잭션 **밖에서**.
  //    · 읽기 전이어야: 유효 토큰 하나로 읽기만 태우는 길이 막힌다(위 passRateLimit 주석).
  //    · 트랜잭션 밖이어야: 거부된 호출도 카운트에 남는다.
  if (!(await passRateLimit(sub, appId, nowMs))) {
    logger.warn(`[AAP] 레이트리밋 app=${appId}`);
    return { ok: false, reason: "rate_limited" };
  }

  // 3️⃣ 멱등 해시 = 원장 문서 id. 트랜잭션을 열기 **전에** 확정돼야 한다.
  //    주체를 토큰의 `sub` 로 잡았기 때문에 **세션 문서를 미리 읽지 않아도 된다**
  //    (uid 로 잡던 판은 여기서 1R 을 더 썼다 — Claude 리뷰 W2).
  const sessionRef = db.collection("aapRewardSessions").doc(jti);
  const hash = R.requestHash({ sub, appId, achievementId, clientRunId, eventId });
  const day = R.kstDayKey(nowMs);

  try {
    const value = await db.runTransaction(async (tx) => {
      // ─── 읽기 구간 (Firestore 는 모든 read 가 write 보다 앞서야 한다) ───

      // ② 멱등이 **가장 먼저**다. 원장 문서 id 가 곧 멱등키라 두 물건이 하나다 —
      //    "같은 키에 다른 payload" 충돌은 구조적으로 발생할 수 없다(해시가 payload 에서 나온다).
      const grantRef = db.collection("appRewardGrants").doc(hash);
      const grantSnap = await tx.get(grantRef);
      if (grantSnap.exists) {
        const g = grantSnap.data();
        return {
          duplicate: true,
          achievementId: g.achievementId,
          rewardType: g.rewardType,
          amount: g.amount,
          label: g.label || "",
          grantId: hash,
        };
      }

      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new RewardDenied("session_missing");
      const session = sessionSnap.data();

      // 세션이 이 토큰의 것인지 **전부** 대조한다. 하나라도 어긋나면 남의 실행권이다.
      if (session.appId !== appId || session.sub !== sub) {
        throw new RewardDenied("session_mismatch");
      }
      const uid = session.uid;
      if (typeof uid !== "string" || !R.UID_RE.test(uid)) {
        throw new RewardDenied("session_mismatch");
      }
      // sub 를 **재계산**해서 맞춘다. 세션 문서가 잘못 쓰였어도 여기서 죽는다.
      if (pairwise(salt, appId, uid) !== sub) throw new RewardDenied("session_mismatch");
      if (
        !Number.isFinite(session.exp) ||
        Math.floor(nowMs / 1000) >= session.exp + SESSION_TTL_MARGIN_SEC
      ) {
        throw new RewardDenied("session_expired");
      }
      // 🔁 재생 방어: 같은 토큰 + 다른 clientRunId = 무한 지급이었다(설계 2판 CRITICAL).
      //    세션은 **한 번만** 소비된다. 한 실행에서 여러 보상이 필요해지면 P1-3 의
      //    서버 발급 event nonce 를 쓴다 — 그때까지는 실행 1회 = 보상 1회다.
      if (session.consumedGrantId) throw new RewardDenied("session_consumed");

      const userRef = db.collection("users").doc(uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new RewardDenied("user_missing");
      const userData = userSnap.data();

      // 🔒 "서명 검증 ≠ 인가" — 토큰이 유효해도 계정 상태는 매 요청 확인한다.
      //    교사·관리자 계정은 지급 대상이 아니다(국고와 학생 지갑이 같은 필드다).
      //
      //    ⚠️ `hasAdminPower` 만으로는 부족하다: 그건 **승인된** 관리자만 참이라
      //    미승인 교사(자가가입 직후 `isAdmin:true·isApproved:false`)가 빠져나간다.
      //    지금은 그런 계정의 classCode 가 "미지정" 이라 아래 CLASS_CODE_RE 에서
      //    걸리지만, 그건 **우연한 fail-closed** 지 설계가 아니다(P1-7 의 등급 폴백이
      //    같은 모양이었다). 역할 표식이 하나라도 있으면 학생이 아니다 — 그렇게 읽는다.
      //    (정상 학생 문서에는 이 셋이 아예 없다. rules 가 자가 부여를 막는다.)
      //    ⚠️ 그래서 저장소의 표준 헬퍼 `hasAdminPower` 를 **쓰지 않는다.** 그건 승인 여부까지
      //    보는 좁은 판정이고, 여기 조건은 그걸 완전히 포함하는 넓은 판정이다. 둘을 `||` 로
      //    같이 두면 헬퍼 쪽이 **영원히 도달 불가한 죽은 분기**가 된다(변이시험이 그걸 잡아냈다).
      if (
        userData.isSuperAdmin === true ||
        userData.isAdmin === true ||
        userData.isTeacher === true
      ) {
        throw new RewardDenied("not_student");
      }
      const classCode = userData.classCode;
      if (typeof classCode !== "string" || !R.CLASS_CODE_RE.test(classCode)) {
        throw new RewardDenied("class_changed");
      }
      // 발급 때의 학급과 지금의 학급이 다르면 멈춘다. 학급 축 카운터가 어느 반 것인지
      // 모호해지고, 학급 이동은 슈퍼관리자만 하는 드문 일이라 다시 열게 하는 편이 안전하다.
      if (session.classCode !== classCode) throw new RewardDenied("class_changed");

      // 🔴 정책은 **트랜잭션 안에서** 읽는다. 밖에서 읽으면 읽은 뒤 운영자가 꺼도 커밋된다
      //    (kill switch TOCTOU — 설계 2판 CRITICAL). 안에서 읽으면 변경이 충돌을 일으켜
      //    재시도되고, 재시도에서 disabled 를 보고 멈춘다.
      const policyRef = db.collection("platformAppPolicies").doc(appId);
      const policySnap = await tx.get(policyRef);
      const policy = policySnap.exists ? { id: appId, ...policySnap.data() } : null;
      const open = checkPolicyOpen(policy);
      if (!open.ok) throw new RewardDenied(open.reason);
      // 실행이 열려 있다고 지급이 열린 건 아니다. 보상은 **별도 스위치**로 켠다 —
      // 그래야 "앱은 쓰되 돈은 아직" 상태가 만들어지고, 그게 이관의 기본 단계다.
      // 🚨 **왜 사유를 정책에서 읽나**: 처음엔 날짜 카운터의 tripped 플래그로 거부했는데,
      //    그러면 운영자가 보상을 다시 켜도 그 플래그가 남아 **자정까지 계속 거부**됐다.
      //    상태를 한 문서에 모으면 스위치 하나로 복구되고 사유도 정확해진다.
      //    "다 받았어요"(소진)와 "안전을 위해 멈췄어요"(사고)는 다른 사건이다.
      if (policy.rewardsEnabled !== true) {
        throw new RewardDenied(
          typeof policy.rewardsDisabledReason === "string" &&
            policy.rewardsDisabledReason.startsWith("auto_breaker_")
            ? "app_tripped"
            : "rewards_off",
        );
      }

      const achievementRef = db
        .collection("appAchievements")
        .doc(appId)
        .collection("items")
        .doc(achievementId);
      const achievementSnap = await tx.get(achievementRef);
      const normalized = catalog.normalizeAchievement(
        achievementSnap.exists ? achievementSnap.data() : null,
        policy.trustLevel,
      );
      if (!normalized.ok) {
        // 사유 이름이 정책 쪽과 겹친다("not_registered" = 앱이 미등록 vs **성취**가 미등록).
        // 겹친 채로 올리면 학생에게 엉뚱한 문구가 간다 — 성취 쪽만 접두를 붙인다.
        throw new RewardDenied(
          normalized.reason === "not_registered" ? "achievement_not_registered" : normalized.reason,
        );
      }
      const achievement = normalized.value;
      const { rewardType, amount } = achievement;

      const subjectRef = db.collection("appRewardSubjects").doc(R.subjectKey(uid, appId));
      const subjectSnap = await tx.get(subjectRef);
      const subject = subjectSnap.exists ? subjectSnap.data() : {};

      const classCounterRef = db.collection("appRewardCounters").doc(`${day}_class_${classCode}`);
      const appCounterRef = db.collection("appRewardCounters").doc(`${day}_app_${appId}`);
      const [classSnap, appSnap] = await Promise.all([
        tx.get(classCounterRef),
        tx.get(appCounterRef),
      ]);

      // ─── 판정 구간 (아직 아무것도 안 썼다) ───

      const stateCheck = R.checkAchievementState({
        achievement,
        achievements: subject.achievements,
        achievementId,
        day,
        nowMs,
      });
      if (!stateCheck.ok) throw new RewardDenied(stateCheck.reason);

      const caps = R.resolveCaps({
        policy,
        trustLimits: catalog.trustLimitsFor(policy.trustLevel),
        rewardType,
      });
      const used = {
        subject: R.dayTotals(subject, day),
        student: R.dayTotals(userData.appRewardDaily, day),
        classroom: R.dayTotals(classSnap.exists ? classSnap.data() : null, day),
        app: R.dayTotals(appSnap.exists ? appSnap.data() : null, day),
      };
      // 🔒 "이미 얼마 받았는지"를 모르면 **지급하지 않는다.** 손상된 카운터를 0 으로 읽으면
      //    소진된 캡이 통째로 다시 열린다(codex WARNING, 2026-08-21).
      const corrupt = Object.keys(used).filter((axis) => used[axis] === null);
      if (corrupt.length > 0) {
        logger.error(`[AAP] 카운터 손상 app=${appId} 축=${corrupt.join(",")}`);
        throw new RewardDenied("counter_corrupt");
      }
      const capCheck = R.checkCaps({ amount, rewardType, caps, used });
      if (!capCheck.ok) throw new RewardDenied(capCheck.reason);

      // ─── 쓰기 구간 (여기부터는 전부 성공하거나 전부 취소된다) ───

      const cash = rewardType === "cash";
      const addCash = cash ? amount : 0;
      const addCoupon = cash ? 0 : amount;

      // 💰 잔액은 **절대값 덮어쓰기가 아니라 increment**. 같은 순간의 다른 거래(송금·상점)를
      //    무효화하지 않는다. 이 저장소의 오래된 규약이다.
      tx.update(userRef, {
        ...(cash ? { cash: FieldValue.increment(amount) } : { coupons: FieldValue.increment(amount) }),
        // 학생×전체×일 축. 이 필드는 **학생이 못 쓴다**(firestore.rules 블록리스트) —
        // 쓸 수 있으면 스스로 0 으로 되돌려 캡을 무한 우회한다(이 저장소가 겪은 실패모드다).
        appRewardDaily: {
          day,
          cash: used.student.cash + addCash,
          coupon: used.student.coupon + addCoupon,
        },
      });

      // 학생×앱×일 + 성취별 상태. merge 라 다른 성취의 상태는 보존된다.
      tx.set(
        subjectRef,
        {
          uid,
          appId,
          classCode,
          day,
          cash: used.subject.cash + addCash,
          coupon: used.subject.coupon + addCoupon,
          achievements: {
            [achievementId]: {
              day,
              dayCount: stateCheck.state.dayCount + 1,
              lifetimeCount: stateCheck.state.lifetimeCount + 1,
              lastGrantedAt: nowMs,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const counterPatch = (prev, extra) => ({
        ...extra,
        day,
        cash: prev.cash + addCash,
        coupon: prev.coupon + addCoupon,
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(classCounterRef, counterPatch(used.classroom, { classCode }), { merge: true });

      // 🚨 차단기 — **지급 후 합계**로 판정한다(임계선을 넘긴 그 건이 표시돼야 추적이 된다).
      //    같은 앱의 지급은 전부 이 카운터 문서를 읽고 쓰므로 Firestore 가 직렬화한다 →
      //    여러 건이 차단선 뒤로 빠져나가는 창이 없다.
      const breaker = R.checkBreaker({
        used: rewardType === "cash" ? used.app.cash : used.app.coupon,
        amount,
        rewardType,
        appPerDay: caps.appPerDay,
        prev: appSnap.exists ? appSnap.data() : null,
        day,
        // 🔓 운영자가 오늘은 통과시키기로 한 앱. 날짜가 박혀 있어 자정에 저절로 만료된다.
        overridden: policy.breakerOverrideDay === day,
      });
      tx.set(
        appCounterRef,
        {
          ...counterPatch(used.app, { appId }),
          [`${breaker.rewardType}Alerted`]: breaker.alerted,
          [`${breaker.rewardType}Tripped`]: breaker.tripped,
        },
        { merge: true },
      );

      // 🔴 **여기가 진짜 kill switch 다.** 플래그를 날짜 카운터에만 두면 자정에 저절로 풀려
      //    "자정 직전 80% + 직후 80%" 가 가능하다 — 그건 차단기가 아니라 하루 소프트캡이다
      //    (2026-08-21 codex WARNING). 날짜가 없는 정책 문서를 끈다.
      //    ⚠️ **`rewards-on` 만으로는 안 풀린다** — 위 조건이 상태라서 다음 지급에 다시 끊긴다.
      //       푸는 길은 `aap-switch.mjs breaker-reset <appId>` 하나뿐이고, 그건
      //       `breakerOverrideDay` 에 오늘 날짜를 박아 **자정에 저절로 만료**된다.
      //    정책 문서는 위에서 이미 읽었으므로 추가 읽기가 없다.
      // ⚠️ 조건이 `newlyTripped` 가 아니라 **`tripped`** 인 이유: 전이로 걸면, 운영자가
      //    보상을 다시 켠 뒤에는 이미 플래그가 서 있어 전이가 안 일어나고 **방어가 조용히
      //    사라진다.** 상태로 걸면 재활성 후 첫 지급에서 곧바로 다시 끊긴다 = fail-safe.
      //    (진짜로 통과시키려면 `breaker-reset` 으로 override 를 박아야 한다.)
      if (breaker.tripped) {
        tx.update(policyRef, {
          rewardsEnabled: false,
          rewardsDisabledReason: `auto_breaker_${breaker.rewardType}`,
          rewardsDisabledAt: FieldValue.serverTimestamp(),
        });
      }

      // 🧾 서버 전용 append-only 원장. **이게 정본이다.**
      //    create 라서 같은 해시가 이미 있으면 트랜잭션이 죽는다 — 위의 멱등 조회가
      //    무력화되는 경로(경합)가 있어도 이중지급이 아니라 실패가 된다.
      tx.create(grantRef, {
        requestHash: hash,
        uid,
        classCode,
        appId,
        achievementId,
        label: achievement.label,
        rewardType,
        amount,
        policyVersion: achievement.policyVersion,
        trustLevel: policy.trustLevel || "L0",
        revocable: achievement.revocable,
        jti,
        sub,
        clientRunId,
        eventId,
        kstDay: day,
        createdAt: FieldValue.serverTimestamp(),
      });

      // 🔁 세션 소비 — 같은 트랜잭션. 지급이 취소되면 소비도 취소된다.
      tx.update(sessionRef, {
        consumedGrantId: hash,
        consumedAt: FieldValue.serverTimestamp(),
      });

      // 👀 학생 화면(내 자산 → 거래 내역)용 **projection**. 정본이 아니다.
      //    MyAssets 는 `amount !== 0 || couponAmount !== 0` 인 문서만 거래로 센다.
      const logRef = db.collection("activity_logs").doc();
      tx.set(logRef, {
        userId: uid,
        userName: userData.name || "학생",
        classCode,
        type: cash ? LOG_TYPES.CASH_INCOME : LOG_TYPES.COUPON_EARN,
        // label 은 슈퍼관리자가 쓰는 값이지만, 저장소의 다른 로그와 **같은 처리**를 거치게 둔다.
        // 로그 하나만 예외로 두면 "여긴 왜 안 하지"가 다음 사람의 판단 부담이 된다.
        description: sanitizeInput(`학습앱 보상 · ${achievement.label || achievementId}`),
        amount: addCash,
        couponAmount: addCoupon,
        metadata: { source: "aap", appId, achievementId, grantId: hash },
        timestamp: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(nowMs + 90 * 24 * 60 * 60 * 1000),
      });

      return {
        duplicate: false,
        achievementId,
        rewardType,
        amount,
        label: achievement.label,
        grantId: hash,
        classCode,
        // 🔔 통지는 **커밋 후**에 한다. 트랜잭션 콜백은 재실행될 수 있어서 여기서 로그를 찍으면
        //    커밋되지 않은 경보가 남는다. 전이 여부만 실어 보낸다.
        breaker,
      };
    });

    // 🔔 경보 — **보호는 이미 원자적으로 걸렸고**(카운터 플래그 + 정책 latch), 여기는 통지다.
    //    이 순서가 설계 1판의 결함을 고치는 핵심이다: 통지를 트랜잭션 안에 넣으면
    //    경보 문서 충돌 한 번이 **지급 전체를 롤백**시킨다(2026-08-21 codex CRITICAL).
    //    통지가 유실돼도 지급은 이미 멈춰 있다 — 반대는 성립하지 않는다.
    if (!value.duplicate && value.breaker && (value.breaker.newlyTripped || value.breaker.newlyAlerted)) {
      await announceBreaker(appId, value.classCode, day, value.breaker).catch((e) => {
        logger.error(`[AAP] 경보 기록 실패 app=${appId}: ${e?.message}`);
      });
    }

    if (!value.duplicate) {
      logger.info("[AAP] 지급", {
        app: appId,
        achievement: value.achievementId,
        type: value.rewardType,
        amount: value.amount,
        grant: value.grantId,
      });
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof RewardDenied) {
      logger.warn(`[AAP] 지급 거부 app=${appId} 사유=${e.reason}`);
      return { ok: false, reason: e.reason };
    }
    // 🔴 판정 사유와 **운영 장애**를 한 코드로 뭉개지 않는다. Firestore 의 UNAVAILABLE·
    //    ABORTED 를 "규칙상 안 되는 일"로 읽으면 앱이 재시도를 포기하고, 로그엔 원인이 안 남는다.
    throw e;
  }
}

module.exports = { grantAppReward, parseRequest, passRateLimit, announceBreaker, RewardDenied };
