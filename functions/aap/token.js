// functions/aap/token.js
// 🎫 AAP v1 토큰 — 발급(서명)과 검증(자기 토큰 되읽기)을 한곳에 둔다.
//
// 클레임을 **최소로** 유지하는 이유 (계획서 §3.2 C21)
//   같은 uid 를 위성앱 11개에 그대로 넘기면, 앱 운영자들끼리 대조하는 순간
//   그 uid 가 **학생을 앱 사이로 연결하는 추적 식별자**가 된다. 초등학생 데이터다.
//   그래서 `sub` 는 **앱별 pairwise 식별자**이고, 닉네임·학급은 기본으로 안 보낸다.
//   앱이 정말 필요하다고 심사에서 인정되면 정책 문서의 allowedClaims 로만 열어준다.
const crypto = require("crypto");
const { b64u, getSigningKey, getPublicJwks } = require("./keys");

const AAP_VERSION = 1;
const ISSUER = "https://inconomysu-class.web.app";
// 5분. 토큰은 "지금 앱을 연다"는 뜻이지 세션이 아니다. 짧을수록 fragment 유출의
// 창이 좁아진다(재생 방어의 1층 — 계획서 §3.2).
const TTL_SEC = 300;
// iat 허용 최대 나이. 위성앱이 검증할 때 쓰라고 규약 문서에 같이 싣는다.
const MAX_AGE_SEC = 300;
// 시계 오차 허용치. 위성앱·알찬·클라 시계가 몇 초씩 어긋나는 건 정상이다.
const SKEW_SEC = 60;

/**
 * 앱별 pairwise 식별자.
 *
 * ⚠️ 구분자가 NUL 인 이유: `appId + uid` 를 그냥 이으면 (`a`,`bc`) 와 (`ab`,`c`) 가
 *    같은 문자열이 된다 — 계획서가 학습기록 키에서 지적한 충돌(C14)과 정확히 같은 함정이다.
 *    appId·uid 둘 다 NUL 을 포함할 수 없으므로 이 구분자는 충돌이 불가능하다.
 *
 * ⚠️ salt 를 바꾸면 **모든 위성앱의 학생 신원이 통째로 갈린다**(앱 쪽 기록이 고아가 된다).
 *    서명키와 달리 이건 회전 대상이 아니다.
 *
 * @param {string} salt AAP_PAIRWISE_SALT
 * @param {string} appId 대상 앱
 * @param {string} value uid 또는 classCode
 * @return {string} 32자 hex
 */
function pairwise(salt, appId, value) {
  return crypto
    .createHmac("sha256", salt)
    .update(`${appId}\u0000${value}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * AAP v1 토큰을 서명한다.
 *
 * @param {object} p 파라미터
 * @param {string} p.appId 대상 앱(= aud)
 * @param {string} p.uid 학생 uid
 * @param {string} p.salt pairwise salt
 * @param {object} [p.extra] 정책이 허용한 선택 클레임(nick/cls)
 * @param {number} [p.nowMs] 테스트용 시각 고정
 * @return {{token: string, jti: string, exp: number, sub: string}} 발급 결과
 */
function signAppToken({ appId, uid, salt, extra = {}, nowMs = Date.now() }) {
  const key = getSigningKey();
  // fail-closed. 키가 없으면 "서명 없이 보낸다" 같은 폴백은 존재하지 않는다.
  if (!key) throw new Error("AAP_NO_SIGNING_KEY");
  if (!salt) throw new Error("AAP_NO_PAIRWISE_SALT");

  const iat = Math.floor(nowMs / 1000);
  const jti = crypto.randomBytes(16).toString("base64url");

  const header = { alg: "RS256", typ: "JWT", kid: key.kid };
  const payload = {
    // ⚠️ `...extra` 가 **먼저** 온다. 반대로 두면 정책 문서(Firestore)에 적힌 이름 하나로
    //    예약 클레임을 덮어쓸 길이 열린다 — 특히 `aud` 는 보상 API 가 appId 로 신뢰하는
    //    유일한 값이라, 그게 정책 문서에서 조작 가능해지는 순간 규약이 무너진다.
    //    지금은 화이트리스트가 nick·cls 뿐이라 무해하지만, 순서를 이렇게 두면
    //    나중에 누가 화이트리스트에 무엇을 추가해도 예약 클레임이 **항상 이긴다**.
    ...extra,
    iss: ISSUER,
    // 🔒 aud 가 appId 의 **유일한 정본**이다. 보상 API 는 요청 본문의 appId 를 절대
    //    믿지 않고 검증된 이 클레임에서 읽는다(계획서 §3.3 C7). 같은 값을 다른 이름으로
    //    한 번 더 싣지 않는 이유 = 두 값이 언젠가 어긋나면 그게 곧 취약점이다.
    aud: appId,
    sub: pairwise(salt, appId, uid),
    jti,
    iat,
    exp: iat + TTL_SEC,
    ver: AAP_VERSION,
  };

  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(key.privateKey);
  return { token: `${signingInput}.${b64u(sig)}`, jti, exp: payload.exp, sub: payload.sub };
}

/**
 * 알찬이 **자기가 발급한** 토큰을 되읽는다(보상 API 용).
 *
 * 위성앱이 하는 검증과 같은 규칙을 쓴다. `alg` 는 헤더를 믿지 않고 **RS256 으로 고정**하고,
 * 서명 검증은 **`kid` 가 가리키는 그 키로만** 한다 — 아무 키나 돌려 맞추면 회전이 무의미해진다.
 * `none`/HS 다운그레이드가 이 지점에서 죽는다.
 *
 * @param {string} token JWT
 * @param {object} [opts] 옵션
 * @param {number} [opts.nowMs] 테스트용 시각 고정
 * @return {{ok: boolean, reason?: string, payload?: object, kid?: string}} 검증 결과
 */
function verifyAppToken(token, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  // 🔒 **엄격한 base64url 만 받는다.** Node 의 `Buffer.from(x, "base64url")` 은 관대해서
  //    표준 base64 알파벳(`+`/`/`)·`=` 패딩·개행·심지어 `!` 같은 쓰레기 문자가 섞여도
  //    같은 바이트로 디코딩한다. 그 결과 **같은 토큰의 문자열 형태가 여러 개**가 되고
  //    전부 서명 검증을 통과한다(2026-08-20 codex 지적, 재현으로 확인 — 변형 5종 통과).
  //    서명이 뚫리는 건 아니지만 "토큰 문자열 = 하나의 실행"이라는 전제가 깨진다.
  //    토큰 문자열로 중복을 거르는 코드(우리 것이든 위성앱 것이든)가 그 자리에서 무력해진다.
  //    RFC 7515 는 애초에 패딩 없는 base64url 만 허용한다 — 규격대로 좁힌다.
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
    return { ok: false, reason: "malformed" };
  }

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!header || typeof header !== "object" || !payload || typeof payload !== "object") {
    return { ok: false, reason: "malformed" };
  }

  // 🔒 alg 고정. 헤더가 뭐라고 주장하든 RS256 이 아니면 여기서 끝난다.
  if (header.alg !== "RS256" || header.typ !== "JWT") return { ok: false, reason: "alg" };

  const pubJwk = getPublicJwks().keys.find((k) => k.kid === header.kid);
  if (!pubJwk) return { ok: false, reason: "kid" };

  let pubKey;
  try {
    pubKey = crypto.createPublicKey({ key: pubJwk, format: "jwk" });
  } catch {
    return { ok: false, reason: "kid" };
  }
  const verified = crypto
    .createVerify("RSA-SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify(pubKey, Buffer.from(parts[2], "base64url"));
  if (!verified) return { ok: false, reason: "signature" };

  if (payload.iss !== ISSUER) return { ok: false, reason: "iss" };
  if (payload.ver !== AAP_VERSION) return { ok: false, reason: "ver" };

  const now = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== "number" || now >= payload.exp + SKEW_SEC) {
    return { ok: false, reason: "exp" };
  }
  // iat 최대 나이 — exp 만 보면 시계가 앞선 발급자가 만든 장수 토큰을 못 잡는다.
  if (typeof payload.iat !== "number" || now - payload.iat > MAX_AGE_SEC + SKEW_SEC) {
    return { ok: false, reason: "iat" };
  }
  if (typeof payload.aud !== "string" || !payload.aud) return { ok: false, reason: "aud" };
  if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, reason: "sub" };
  if (typeof payload.jti !== "string" || !payload.jti) return { ok: false, reason: "jti" };

  return { ok: true, payload, kid: header.kid };
}

module.exports = {
  AAP_VERSION,
  ISSUER,
  TTL_SEC,
  MAX_AGE_SEC,
  SKEW_SEC,
  pairwise,
  signAppToken,
  verifyAppToken,
};
