// functions/aap/handlers.js
// 🚪 AAP v1 — 실행 토큰 발급(`issueAppToken`)과 공개키 게시(`aapJwks`).
//
// 이게 사주는 것 (계획서 §3.0 — SSO 자체가 목적이 아니다)
//   · 학생이 기기를 바꿔도 위성앱의 기록이 살아남는다(기기 로컬 신원 → 서버 신원)
//   · 교사가 누가 얼마나 했는지 볼 수 있게 된다
//   · "랭킹"이 그 기기의 랭킹이 아니라 학급 랭킹이 된다
//   · 학습 성과를 학급경제와 연결할 수 있게 된다(보상은 P1-2 `grantAppReward`)
//   · 앱이 늘어도 학생이 외울 것이 늘지 않는다
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { checkAuthAndGetUserData, logger, db, admin } = require("../utils");
const { getPublicJwks, hasKeys } = require("./keys");
const { signAppToken, TTL_SEC, MAX_AGE_SEC, ISSUER, AAP_VERSION, pairwise } = require("./token");
const {
  APP_ID_RE,
  readAppPolicy,
  checkPolicyOpen,
  validateLaunchUrl,
  resolveOptionalClaims,
  isAppLockedForClass,
} = require("./policy");
const { grantAppReward } = require("./reward");
const { clawbackAppReward, ClawbackDenied, clawbackError } = require("./clawback");
const { recordLearningEvent, LearningDenied } = require("./learning");
const L = require("./learningRules");
const R = require("./rewardRules");

const REGION = "asia-northeast3";

/**
 * 🧯 **비용 천장.** 레이트리밋은 한 사람이 얼마나 빨리 두드리는지를 막지, 전체 청구액을 막지
 * 못한다 — 거부되는 호출도 함수 호출 비용과 버킷 1R+1W 를 계속 만든다(2026-08-21 codex
 * WARNING). 동시 인스턴스에 천장을 씌우면 **최악의 경우 청구액이 유한**해진다.
 * 교사 1명·학급 2개(약 40명) 규모에서 20 은 정상 트래픽보다 한참 위다.
 */
const MAX_INSTANCES = 20;

/**
 * 🪣 발급 레이트리밋 — 지급용(`passRateLimit`)과 **같은 컬렉션, 다른 설정·다른 키**.
 *
 * 키는 uid 를 그대로 쓰지 않고 해시한다(`bucketKeyForUid` 주석 참고). 설정도 지급용보다
 * 느슨할 이유가 없어 따로 준다 — 앱을 여는 동작은 지급보다 훨씬 드물다.
 *
 * @param {string} uid Firebase uid
 * @return {Promise<boolean>} 통과 여부
 */
function passIssueRateLimit(uid) {
  const ref = db.collection("aapRateLimits").doc(R.bucketKeyForUid(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { allowed, next } = R.consumeBucket(
      snap.exists ? snap.data() : null,
      Date.now(),
      R.TOKEN_RATE_LIMIT,
    );
    tx.set(ref, { ...next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return allowed;
  });
}

// ───────────────────────────────────────────────────────────────
// 🎫 실행 토큰 발급
// ───────────────────────────────────────────────────────────────
exports.issueAppToken = onCall({ region: REGION, maxInstances: MAX_INSTANCES }, async (request) => {
  const appId = request.data?.appId;

  if (typeof appId !== "string" || !APP_ID_RE.test(appId)) {
    throw new HttpsError("invalid-argument", "앱 정보가 올바르지 않습니다.");
  }

  // 🪣 레이트리밋을 **사용자 문서 읽기보다 앞에** 둔다.
  //    예전엔 `checkAuthAndGetUserData` 가 첫 줄이라, 거부될 호출도 users 문서를 한 번 읽었다
  //    (2026-08-21 codex WARNING). 발급은 실행권 쓰기까지 만들므로 **돈이 아니라 비용**을
  //    막는 자리이고, 관문은 읽기 0회 지점에 있어야 관문이다.
  //    인증 자체는 게이트웨이가 이미 했다 — 여기 오는 request.auth 는 검증된 값이다.
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "인증된 사용자만 함수를 호출할 수 있습니다.");
  }
  if (!(await passIssueRateLimit(request.auth.uid))) {
    throw new HttpsError("resource-exhausted", R.denyMessage("rate_limited"));
  }

  const { uid, classCode, isAdmin, userData } = await checkAuthAndGetUserData(request);

  // 🔑 fail-closed. 키·솔트가 없으면 발급하지 않는다 — "일단 열어주고 나중에"는 없다.
  //    (계획서 §3.7: 장애 시 fail-closed, 의심스러우면 지급하지 않는다)
  const salt = process.env.AAP_PAIRWISE_SALT;
  if (!hasKeys() || !salt) {
    logger.error("[AAP] 서명키 또는 pairwise salt 미설정 — 발급 거부");
    throw new HttpsError("failed-precondition", "앱 연결이 아직 준비되지 않았어요.");
  }

  // 🔴 정책은 **캐시하지 않고 지금 읽는다.** kill switch 가 stale 캐시에 묻히면
  //    끈 앱이 계속 열린다(계획서 §3.5 C13).
  const policy = await readAppPolicy(appId);
  const open = checkPolicyOpen(policy);
  if (!open.ok) {
    logger.warn(`[AAP] 발급 거부 app=${appId} uid=${uid} 사유=${open.reason}`);
    throw new HttpsError(
      open.reason === "not_registered" ? "not-found" : "failed-precondition",
      // 문구 정본은 rewardRules.DENY_MESSAGE 하나뿐이다 — 실행과 지급이 같은 말을 하게.
      R.denyMessage(open.reason),
    );
  }

  if (!classCode) {
    throw new HttpsError("failed-precondition", "학급 정보가 없어 앱을 열 수 없어요.");
  }

  // 학급별 on/off. 교사는 면제한다 — 라우트 가드(`AlchanLayout`)와 같은 규칙이라
  //   "사이드바에선 보이는데 안 열린다"/"교사만 못 연다" 같은 어긋남이 생기지 않는다.
  if (!isAdmin && (await isAppLockedForClass(classCode, appId))) {
    throw new HttpsError("permission-denied", "선생님이 이 기능을 꺼 두셨어요.");
  }

  // 선택 클레임 — 기본은 아무것도 안 싣는다(§3.2 C21).
  const extra = {};
  for (const claim of resolveOptionalClaims(policy)) {
    if (claim === "nick") {
      // ⚠️ `userData.name` 을 그대로 쓰면 **실명이 외부 앱으로 나간다.**
      //    개별 학생 추가 화면(`src/components/StudentManager.js`)은 라벨이 "학생 이름",
      //    placeholder 가 "홍길동" 이라 교사가 실명을 넣는 경로가 실제로 있다
      //    (일괄 생성 경로는 반대로 ID 만 쓴다 — 같은 필드에 두 종류가 섞여 있다).
      //    학생이 **스스로 정한 닉네임**(hasSetNickname)일 때만 그 값이 닉네임임이 보장된다.
      //    계획서 §5.3: AAP 클레임에 실명·학번을 넣지 않는다.
      const chosen =
        userData?.hasSetNickname === true && typeof userData?.nickname === "string"
          ? userData.nickname.trim().slice(0, 20)
          : "";
      if (chosen) extra.nick = chosen;
    } else if (claim === "cls") {
      // ⚠️ 학급코드 원본이 아니라 **앱별 pairwise 값**이다. 앱은 "같은 반끼리 묶기"만
      //    할 수 있으면 되고, 그 이상(어느 학교 몇 반인지·다른 앱과 대조)은 필요 없다.
      extra.cls = pairwise(salt, appId, classCode);
    }
  }

  let issued;
  try {
    issued = signAppToken({ appId, uid, salt, extra });
  } catch (e) {
    logger.error(`[AAP] 서명 실패 app=${appId}: ${e?.message}`);
    throw new HttpsError("internal", "앱 연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 🎟️ **1회용 실행권** — 보상이 켜진 앱에만 쓴다.
  //
  //    왜 필요한가: AAP 토큰에는 uid 가 없다(앱별 pairwise sub 뿐). 위성앱은 다른 origin 이라
  //    Firebase 세션도 없다 → 지급 요청이 왔을 때 **누구에게 줄지 알 방법이 서버에 없다.**
  //    요청에 담긴 uid 를 믿으면 남에게 지급된다. 그래서 **발급 시점에 서버가 기억한다.**
  //    이 문서가 곧 1회용 실행권이라 재생 방어(같은 토큰 재사용)도 같이 해결된다.
  //
  //    ⚠️ 비용: 이 앱을 여는 실행마다 쓰기 1건. 보상이 꺼진 앱(`rewardsEnabled !== true`)은
  //       쓰지 않는다 — 지금 등록된 11개가 전부 여기 해당해서 비용 증가는 0 이다.
  //    ⚠️ fail-closed: 세션을 못 쓰면 토큰도 안 준다. 쓰지 못한 채 토큰만 나가면 학생은
  //       앱을 열어 문제를 풀고 **보상만 조용히 실패**한다 — 그게 제일 나쁜 실패다.
  // 🚫 **역할 표식이 있는 계정에는 실행권을 만들지 않는다.** 교사도 앱은 열어야 하지만,
  //    지급은 어차피 `not_student` 로 거부된다 — 쓰지 않을 문서를 실행마다 쓰고 있었다
  //    (2026-08-21 codex CRITICAL). 지급 쪽 역할 검사와 **같은 조건**을 쓴다.
  const hasRole =
    userData?.isSuperAdmin === true || userData?.isAdmin === true || userData?.isTeacher === true;
  // 📚 **학습기록(P1-3)도 같은 다리를 쓴다.** 토큰에는 uid 가 없어서, 어느 학생의 기록인지
  //    아는 유일한 길이 이 문서다. 그래서 조건이 보상 하나가 아니라 **보상 또는 통계**다.
  //    ⚠️ 이걸 안 넓히면 학습기록은 영원히 uid 를 못 찾는다 — 지금 11개 앱이 전부 보상
  //       꺼짐이라 세션이 한 건도 안 생긴다(2026-08-21 P1-3 착수 시 발견).
  //    "쓰는 만큼만 낸다"는 원칙은 그대로다 — 둘 다 꺼진 앱은 여전히 아무것도 안 쓴다.
  const needsSession = policy.rewardsEnabled === true || policy.statsEnabled === true;
  if (needsSession && !hasRole) {
    try {
      await db
        .collection("aapRewardSessions")
        .doc(issued.jti)
        .create({
          uid,
          classCode,
          appId,
          sub: issued.sub,
          exp: issued.exp,
          // 무엇 때문에 만들어졌는지 남긴다 — 나중에 "왜 이 문서가 있지"를 되짚을 때 쓴다.
          forRewards: policy.rewardsEnabled === true,
          forStats: policy.statsEnabled === true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // 토큰은 5분이면 죽는다. 문서를 오래 둘 이유는 감사뿐이라 하루면 충분하다.
          // (이 프로젝트엔 아직 TTL 정책이 0개다 — 실제 삭제는 별도 작업이다.)
          expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        });
    } catch (e) {
      logger.error(`[AAP] 실행권 기록 실패 app=${appId} uid=${uid}: ${e?.message}`);
      throw new HttpsError("internal", "앱 연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 🔎 재생 탐지의 근거. 보상이 꺼진 앱은 문서를 쓰지 않고 구조화 로그로만 남긴다 —
  //    실행마다 Firestore 쓰기 1건이면 학급이 늘수록 그게 곧 비용이다(§3.2).
  logger.info("[AAP] 토큰 발급", {
    app: appId,
    uid,
    jti: issued.jti,
    exp: issued.exp,
    reward: policy.rewardsEnabled === true,
  });

  // 🔒 실행 URL 은 **서버가 정한다.** 요청자가 지정할 수 있으면 fragment 의 토큰을
  //    공격자 사이트로 보낼 수 있다(§3.2 C6). 정책 문서는 슈퍼관리자만 쓴다.
  const url = validateLaunchUrl(policy.launchUrl);
  // 쿼리스트링이 아니라 **fragment** 로 넘긴다 — 쿼리는 서버 액세스로그·리퍼러에 남는다.
  const launchUrl = `${url.href}#aap=${issued.token}`;

  return {
    success: true,
    launchUrl,
    appId,
    expiresAt: issued.exp,
    ttlSec: TTL_SEC,
  };
});

// ───────────────────────────────────────────────────────────────
// 🔓 JWKS — 위성앱이 토큰 서명을 검증할 공개키
// ───────────────────────────────────────────────────────────────
exports.aapJwks = onRequest({ region: REGION, invoker: "public" }, (req, res) => {
  // 공개키다. 브라우저에서 직접 가져가는 앱이 있으므로 CORS 를 연다.
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  // HEAD 는 "본문 없는 GET" 이다 — 모니터·프록시·헬스체크가 표준으로 쓴다.
  // 막으면 그쪽에서 405 를 장애로 읽는다(2026-08-20 라이브에서 실제로 405 를 받았다).
  // Express 가 HEAD 응답의 본문을 알아서 떼므로 아래 json() 을 그대로 태워도 된다.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  // 캐시는 짧게. 길면 키 회전이 위성앱에 늦게 도착한다.
  res.set("Cache-Control", "public, max-age=300, must-revalidate");
  res.status(200).json(getPublicJwks());
});

// ───────────────────────────────────────────────────────────────
// 📖 규약 디스커버리 — 위성앱 제작자가 한 번에 볼 수 있는 상수 모음
//    (문서와 코드가 어긋나는 걸 막는다. 여기가 사실, 문서는 설명이다)
// ───────────────────────────────────────────────────────────────
exports.aapDiscovery = onRequest({ region: REGION, invoker: "public" }, (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).json({
    protocol: "AAP",
    version: AAP_VERSION,
    issuer: ISSUER,
    jwks_uri: `https://${REGION}-inconomysu-class.cloudfunctions.net/aapJwks`,
    id_token_signing_alg_values_supported: ["RS256"],
    token_ttl_sec: TTL_SEC,
    token_max_age_sec: MAX_AGE_SEC,
    delivery: "url_fragment",
    fragment_param: "aap",
    claims_supported: ["iss", "aud", "sub", "jti", "iat", "exp", "ver"],
    claims_optional: ["nick", "cls"],
    subject_type: "pairwise",
    docs: "https://github.com/iw-lab/alchan/blob/main/docs/AAP_V1_SPEC.md",
  });
});

// ───────────────────────────────────────────────────────────────
// 💸 보상 지급 — 위성앱이 부르는 유일한 쓰기 엔드포인트
//
//    `onCall` 이 **될 수 없다**: onCall 의 Bearer 는 Firebase ID 토큰인데, 위성앱은
//    다른 origin 이라 Firebase 세션이 없다. 그래서 평범한 HTTP + AAP 토큰이다.
//
//    CORS 를 `*` 로 여는 근거: 이 엔드포인트는 **쿠키를 쓰지 않는다**(Allow-Credentials 도
//    켜지 않는다). 인증은 요청에 실린 토큰 하나뿐이고 그 토큰은 앱 origin 안에만 있다 —
//    origin 을 좁혀도 얻는 게 없고(서버 대 서버 호출은 CORS 를 통과할 필요조차 없다),
//    좁히면 preflight 에서 appId 를 모르는 채 판정해야 해서 정책 문서를 매번 훑게 된다.
// ───────────────────────────────────────────────────────────────
exports.grantAppReward = onRequest(
  { region: REGION, invoker: "public", maxInstances: MAX_INSTANCES },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "3600");
    // 돈이 걸린 응답이다. 중간 캐시가 성공 응답을 재사용하면 "받았는데 안 받은" 상태가 생긴다.
    res.set("Cache-Control", "no-store");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "method_not_allowed" });
      return;
    }

    let out;
    try {
      // 토큰은 **헤더 우선**. 본문에 넣으면 프록시·에러리포터 로그에 남기 쉽다.
      const auth = String(req.get("authorization") || "");
      const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(auth);
      out = await grantAppReward({ body: req.body, headerToken: m ? m[1] : "" });
    } catch (e) {
      // 판정 거부가 아니라 **운영 장애**다(Firestore UNAVAILABLE·ABORTED 등).
      // 409 로 내려보내면 앱이 "오늘은 안 되는구나"로 읽고 재시도를 포기한다.
      logger.error(`[AAP] 지급 실패(운영 장애): ${e?.message}`, e);
      res.status(503).json({
        success: false,
        error: "unavailable",
        message: "잠시 뒤에 다시 시도해 주세요.",
        retryable: true,
      });
      return;
    }

    if (!out.ok) {
      res.status(R.denyStatus(out.reason)).json({
        success: false,
        error: out.reason,
        message: R.denyMessage(out.reason),
      });
      return;
    }
    res.status(200).json({ success: true, ...out.value });
  },
);

// ↩️ 환수 진입점. 로직은 clawback.js(순수), 여기서는 **인가와 사유→HttpsError 변환**만 한다.
//
//    ⚠️ `checkAuthAndGetUserData(request, true)` 는 **승인된 교사인지만** 본다 —
//       대상 학급 대조는 clawback.js 안에서 한다(원장·학생 문서를 읽어야 알 수 있다).

exports.clawbackAppReward = onCall({ region: REGION, maxInstances: MAX_INSTANCES }, async (request) => {
  const { uid, classCode, isSuperAdmin, userData } = await checkAuthAndGetUserData(request, true);
  try {
    return await clawbackAppReward({
      callerUid: uid,
      callerName: userData?.name,
      callerClass: classCode,
      isSuperAdmin,
      grantId: request.data?.grantId,
      reason: request.data?.reason,
    });
  } catch (e) {
    if (e instanceof ClawbackDenied) {
      logger.warn(`[AAP] 환수 거부 by=${uid} 사유=${e.reason}`);
      const hit = clawbackError(e.reason);
      throw new HttpsError(hit[0], hit[1]);
    }
    throw e;
  }
});

// ───────────────────────────────────────────────────────────────
// 📚 학습기록 (P1-3) — 위성앱이 직접 부른다. `grantAppReward` 와 같은 모양의 HTTP 진입점.
//
//    돈이 아니라서 CORS·인증 형태만 같고 방어선은 다르다(상세는 learning.js 머리말).
// ───────────────────────────────────────────────────────────────
exports.recordLearningEvent = onRequest(
  { region: REGION, invoker: "public", maxInstances: MAX_INSTANCES },
  async (req, res) => {
    // 쿠키를 안 쓰므로 와일드카드 origin 이고, **Allow-Credentials 는 켜지 않는다**
    // (둘을 같이 켜는 것이 전형적인 사고다).
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "3600");
    res.set("Cache-Control", "no-store");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "method_not_allowed" });
      return;
    }

    let out;
    try {
      const auth = String(req.get("authorization") || "");
      const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(auth);
      out = await recordLearningEvent({ body: req.body, headerToken: m ? m[1] : "" });
    } catch (e) {
      if (e instanceof LearningDenied) {
        logger.warn(`[AAP] 학습기록 거부 사유=${e.reason}`);
        res
          .status(L.denyStatus(e.reason))
          .json({ success: false, error: e.reason, message: L.denyMessage(e.reason) });
        return;
      }
      // 판정 거부가 아니라 **운영 장애**다. 앱이 재시도할 수 있게 503 으로 알린다 —
      // 기록은 돈이 아니라 잃어도 되지만, 잃었다는 사실은 앱이 알아야 한다.
      logger.error(`[AAP] 학습기록 장애: ${e?.message}`);
      res.status(503).json({ success: false, error: "unavailable", retryable: true });
      return;
    }

    if (!out.ok) {
      res
        .status(L.denyStatus(out.reason))
        .json({ success: false, error: out.reason, message: L.denyMessage(out.reason) });
      return;
    }
    res.status(200).json({ success: true, ...out.value });
  },
);
