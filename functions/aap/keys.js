// functions/aap/keys.js
// 🔑 AAP(Alchan App Protocol) 서명키 — **RS256 고정**.
//
// 왜 RS256 자체서명 JWT 인가 (Firebase Custom Token 아님)
//   위성앱 스택이 제각각이다(Cloudflare Workers·Pages·Vercel·GitHub Pages·자체 Firebase).
//   전부에 Firebase Admin SDK 를 넣게 만들 수는 없다. 공개키만 있으면 어디서든 검증되는
//   표준 JWT + JWKS 가 유일하게 전부를 통과한다.
//
// 왜 라이브러리를 안 쓰나
//   이 저장소는 **PUBLIC** 이고 이 코드는 돈이 나가는 경로에 붙는다. RS256 서명은
//   Node 내장 crypto 로 30줄이면 되는데, 그걸 위해 의존성 트리를 늘리지 않는다.
//   (`alg` 혼동 취약점의 역사도 대부분 JWT 라이브러리 쪽에서 나왔다.)
//
// 키가 들어오는 통로
//   GitHub Secrets → deploy.yml → functions/.env → process.env.
//   PEM 은 개행을 포함하는데 .env 는 한 줄 = 한 값이라 **base64(PKCS8 PEM)** 로 넣는다.
//   ⚠️ 키가 없으면 이 모듈은 조용히 죽지 않고 **발급을 거부**한다(fail-closed).
//      "의심스러우면 지급하지 않는다"가 규약 원칙이다(계획서 §3.7).
const crypto = require("crypto");

/** JWT 는 base64url 을 쓴다. Node 18+ 는 Buffer 가 직접 지원한다. */
const b64u = (buf) => Buffer.from(buf).toString("base64url");

/**
 * base64(PEM) → KeyObject. 형식이 틀리면 null(호출부가 fail-closed 처리).
 * @param {string|null} b64 base64 로 인코딩된 PKCS8 PEM
 * @return {object|null} crypto KeyObject 또는 null
 */
function parsePrivateKey(b64) {
  if (!b64 || typeof b64 !== "string") return null;
  try {
    const pem = Buffer.from(b64.trim(), "base64").toString("utf8");
    if (!pem.includes("PRIVATE KEY")) return null;
    const key = crypto.createPrivateKey(pem);
    // RSA 만 받는다. EC 키가 들어오면 서명 알고리즘이 조용히 어긋난다.
    if (key.asymmetricKeyType !== "rsa") return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * RFC 7638 JWK 지문 = kid. **키에서 결정론적으로 파생**되므로 회전할 때
 * kid 를 사람이 붙일 필요가 없고, 두 키가 같은 kid 를 갖는 사고도 없다.
 * @param {object} jwk RSA 공개 JWK
 * @return {string} base64url(sha256(canonical JSON))
 */
function jwkThumbprint(jwk) {
  // 캐노니컬 형식 = 필수 멤버만, 사전순, 공백 없음. RSA 는 {e, kty, n}.
  const canonical = `{"e":"${jwk.e}","kty":"${jwk.kty}","n":"${jwk.n}"}`;
  return crypto.createHash("sha256").update(canonical).digest("base64url");
}

/**
 * 개인키 하나를 {키, kid, 공개JWK} 로 만든다.
 * @param {object} privateKey crypto KeyObject
 * @param {string} use 회전 상태 표시용 라벨("current"|"previous")
 * @return {object} 키 기술자
 */
function describe(privateKey, use) {
  const pub = crypto.createPublicKey(privateKey);
  const jwk = pub.export({ format: "jwk" });
  const kid = jwkThumbprint(jwk);
  return {
    use,
    kid,
    privateKey,
    publicJwk: { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: "RS256", use: "sig" },
  };
}

// 모듈 로드 시 1회만 파싱한다(호출마다 PEM 파싱은 낭비다).
// 🔁 회전: 새 키를 CURRENT 로 올리고 **옛 키를 PREVIOUS 로 내린다.** 중복기간 동안
//    JWKS 는 둘 다 게시하므로, 이미 발급된 토큰(최대 5분)과 위성앱의 JWKS 캐시가
//    끊기지 않는다. 중복기간이 지나면 PREVIOUS 를 지운다.
const CURRENT = parsePrivateKey(process.env.AAP_SIGNING_KEY_CURRENT);
const PREVIOUS = parsePrivateKey(process.env.AAP_SIGNING_KEY_PREVIOUS);

const keys = [];
if (CURRENT) keys.push(describe(CURRENT, "current"));
if (PREVIOUS) keys.push(describe(PREVIOUS, "previous"));

/** 서명에 쓸 키. 없으면 null → 호출부가 발급을 거부한다. */
function getSigningKey() {
  return keys.find((k) => k.use === "current") || null;
}

/** JWKS 본문. 공개키만 나간다. 회전 중이면 2개. */
function getPublicJwks() {
  return { keys: keys.map((k) => k.publicJwk) };
}

/** 키가 하나라도 설정돼 있는가(진단·헬스체크용). */
function hasKeys() {
  return keys.length > 0;
}

module.exports = { b64u, jwkThumbprint, getSigningKey, getPublicJwks, hasKeys };
