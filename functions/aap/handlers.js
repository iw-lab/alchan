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
const { checkAuthAndGetUserData, logger } = require("../utils");
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

const REGION = "asia-northeast3";

/** 거부 사유 → 학생에게 보여줄 문구. 원인은 로그에, 문구는 아이 눈높이로. */
const DENY_MESSAGE = {
  not_registered: "아직 알찬과 연결되지 않은 앱이에요.",
  disabled: "이 앱은 지금 잠시 사용할 수 없어요.",
  not_migrated: "이 앱은 아직 준비 중이에요.",
  bad_launch_url: "앱 주소 설정에 문제가 있어요. 선생님께 알려 주세요.",
};

// ───────────────────────────────────────────────────────────────
// 🎫 실행 토큰 발급
// ───────────────────────────────────────────────────────────────
exports.issueAppToken = onCall({ region: REGION }, async (request) => {
  const { uid, classCode, isAdmin, userData } = await checkAuthAndGetUserData(request);
  const appId = request.data?.appId;

  if (typeof appId !== "string" || !APP_ID_RE.test(appId)) {
    throw new HttpsError("invalid-argument", "앱 정보가 올바르지 않습니다.");
  }

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
      DENY_MESSAGE[open.reason] || "지금은 이 앱을 열 수 없어요.",
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

  // 🔎 재생 탐지의 근거. 문서를 쓰지 않고 구조화 로그로 남긴다 —
  //    실행마다 Firestore 쓰기 1건이면 학급이 늘수록 그게 곧 비용이다(§3.2).
  //    **보상을 동반하는 실행**의 1회용 세션은 P1-2 에서 이 위에 얹는다.
  logger.info("[AAP] 토큰 발급", { app: appId, uid, jti: issued.jti, exp: issued.exp });

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
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
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
