# AAP v1 — 알찬 학습앱 규약

> 위성 학습앱을 알찬에 꽂는 규약. **앱은 각자 호스팅에 남는다.** 알찬 번들로 흡수하지 않는다.
> 설계 근거는 `AI_PLATFORM_PLAN_2026-08-17.md` §3. 이 문서는 **앱 제작자용 사용설명서**다.
>
> 구현 정본은 코드다(`functions/aap/`). 상수는 문서를 믿지 말고
> `https://asia-northeast3-inconomysu-class.cloudfunctions.net/aapDiscovery` 를 읽을 것.

## 0. 이 규약이 실제로 사주는 것

SSO 가 목적이 아니다. 지금 위성앱들이 겪는 다섯 가지를 없애는 게 목적이다.

| 지금 | AAP 이후 |
|---|---|
| 기기(교실 PC ↔ 태블릿)를 바꾸면 기록이 사라진다 | 서버 신원이라 기록이 따라온다 |
| 교사가 누가 얼마나 했는지 모른다 | 알찬 교사 화면에서 본다 |
| "랭킹"이 학급 랭킹이 아니라 **그 기기의 랭킹**이다 | 같은 반끼리 묶인다 |
| 학습 성과가 학급경제와 무관하다 | 알찬 화폐로 들어온다 |
| 앱이 늘수록 학생이 외울 것이 는다 | 알찬 로그인 하나 |

## 1. 실행 흐름

```
학생이 알찬 사이드바에서 앱을 누른다
  → 알찬 클라가 issueAppToken({ appId }) 호출
  → 알찬 서버가 정책을 확인하고(캐시 없음) RS256 JWT 를 서명
  → 서버가 정한 실행 URL 로 이동:  https://your-app.example/#aap=<JWT>
  → 앱이 fragment 에서 토큰을 꺼내 JWKS 로 검증하고 학생을 식별
```

**실행 URL 은 앱이 아니라 서버가 정한다.** 요청자가 URL 을 지정할 수 있으면 fragment 의
토큰을 공격자 사이트로 보낼 수 있다. URL 을 바꾸려면 알찬 쪽 정책 문서를 고쳐야 한다.

토큰은 **쿼리스트링이 아니라 fragment** 로 온다. 쿼리는 서버 액세스로그·리퍼러 헤더에
그대로 남는다(이 프로젝트는 쿼리로 흘린 토큰 3종을 한 번에 폐기한 전례가 있다).

## 2. 토큰

```jsonc
// header
{ "alg": "RS256", "typ": "JWT", "kid": "<RFC7638 지문>" }
// payload
{
  "iss": "https://inconomysu-class.web.app",
  "aud": "siteGuguGuardians",          // 이 토큰이 향하는 앱. 반드시 자기 appId 인지 확인할 것
  "sub": "a1b2…",                       // 앱별 pairwise 식별자(32자 hex)
  "jti": "…", "iat": 1755000000, "exp": 1755000300,
  "ver": 1
}
```

- **`sub` 는 앱마다 다르다.** 같은 학생이라도 앱 A 와 앱 B 가 받는 값이 다르다.
  알찬 uid 를 그대로 주면 앱 운영자들끼리 대조해 학생을 앱 사이로 추적할 수 있다 — 초등학생 데이터다.
  같은 앱 안에서는 **항상 같은 값**이므로 기록을 이어 붙이는 데는 문제가 없다.
- **닉네임·학급·역할은 기본으로 안 온다.** 정말 필요하면 심사 후 `nick`(닉네임)·`cls`(앱별 학급 식별자)를
  열어준다. `cls` 도 학급코드 원문이 아니라 pairwise 값이다 — "같은 반끼리 묶기"에는 충분하다.
- **유효기간 5분.** 세션이 아니라 "지금 이 앱을 연다"는 뜻이다.
  앱의 로그인 상태는 앱이 알아서 유지하고, 토큰을 저장해 재사용하지 말 것.

## 3. 검증 (앱 쪽)

```js
const DISCOVERY = "https://asia-northeast3-inconomysu-class.cloudfunctions.net/aapDiscovery";
const MY_APP_ID = "siteGuguGuardians";

const b64u = (s) => Uint8Array.from(
  atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// JWKS 캐시 — 5분. force 를 주면 캐시를 버리고 다시 받는다(키 회전 대응).
let jwksCache = { at: 0, keys: null };
async function getJwks(uri, { force = false } = {}) {
  if (!force && jwksCache.keys && Date.now() - jwksCache.at < 300_000) return jwksCache.keys;
  const { keys } = await (await fetch(uri, { cache: "no-store" })).json();
  jwksCache = { at: Date.now(), keys };
  return keys;
}

async function verifyAap(jwt) {
  const parts = jwt.split(".");
  // 🔒 엄격한 base64url 만. 브라우저 atob 은 관대해서 `=`·개행·표준 base64 를 다 받아준다
  //    → 같은 토큰의 문자열 형태가 여러 개가 되고, 토큰 문자열로 중복을 거르는 코드가 뚫린다.
  if (parts.length !== 3 || !parts.every((x) => /^[A-Za-z0-9_-]+$/.test(x))) throw new Error("malformed");
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64u(h)));
  // 🔒 alg 는 헤더를 믿지 말고 **고정**한다. none/HS 다운그레이드가 여기서 죽는다.
  if (header.alg !== "RS256") throw new Error("alg");

  const { jwks_uri, issuer } = await (await fetch(DISCOVERY)).json();
  // ⚠️ **kid 를 못 찾으면 캐시를 버리고 한 번 다시 받는다.** 이 재조회가 없으면
  //    키 회전 순간에 이 앱만 최대 5분간 전부 실패한다(캐시된 옛 키 ↔ 새 kid 토큰).
  //    "다시 받아오세요"라고 설명만 하고 코드에 안 넣으면 아무도 안 넣는다.
  let jwk = (await getJwks(jwks_uri)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getJwks(jwks_uri, { force: true })).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("kid");

  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("signature");

  const c = JSON.parse(new TextDecoder().decode(b64u(p)));
  const now = Math.floor(Date.now() / 1000);
  if (c.iss !== issuer) throw new Error("iss");
  if (c.aud !== MY_APP_ID) throw new Error("aud");   // ← 다른 앱용 토큰 재사용 차단
  if (c.ver !== 1) throw new Error("ver");
  if (now >= c.exp + 60) throw new Error("exp");
  if (now - c.iat > 360) throw new Error("iat");
  return c;                                          // c.sub 이 학생 식별자
}

// 실행 직후 fragment 를 **즉시 지운다** — 히스토리·공유 링크에 토큰이 남지 않게.
const m = location.hash.match(/[#&]aap=([^&]+)/);
if (m) {
  history.replaceState(null, "", location.pathname + location.search);
  const claims = await verifyAap(m[1]);
}
```

키 회전은 **중복기간**을 둔다(JWKS 에 키 2개가 동시에 실린다). `kid` 를 못 찾으면
JWKS 를 다시 받아 한 번 더 시도할 것. 캐시를 무한정 붙들지 말 것.

> ⚠️ **키를 한 번에 바꾸면 무중단이 아니다.** 새 키로 바로 서명하면, JWKS 를 5분 캐시한 앱은
> 아직 옛 키만 들고 있는데 새 `kid` 토큰을 받는다 → 그 앱만 최대 5분 전부 실패한다.
> 그래서 회전은 **2단계**다. 절차는 §7 을 볼 것.

## 4. ⚠️ 앱 쪽 검증은 **보안 경계가 아니다**

이걸 오해하면 규약 전체를 잘못 쓴다.

- **진위 경계 = 앱.** "이 학생이 정말 100점을 받았는가"는 **알찬이 독립적으로 검증할 수 없다.**
- **지급 경계 = 알찬 서버.** 보상은 알찬이 토큰을 검증한 뒤에만 나간다.
  앱의 로컬 검증은 화면을 그리기 위한 판단일 뿐, 돈이 나가는 근거가 아니다.

그래서 신뢰등급은 "서버가 있느냐"가 아니라 **"서버가 성취를 독립 검증하느냐"** 로 나뉜다.

| 등급 | 의미 | 허용 보상 |
|---|---|---|
| **L0** | 검증 불가 — 정적 클라이언트가 주장하는 성취 | 명목상 소액만 |
| **L2** | 앱 서버가 성취를 **독립 검증** | 정상 캡 |

앱 서버가 클라이언트의 "완료했다"를 그대로 서명해 넘기면 그건 L2 가 아니다.
**신뢰등급만 올라간 세탁기**가 된다.

## 5. 보상 (P1-2 예정 — 아직 열려 있지 않다)

```
요청  grantAppReward({ token, achievementId, clientRunId })   ← amount 없음
```

**앱은 금액을 보내지 않는다.** 무엇을 달성했는지만 보내고, 금액·종류·횟수·쿨다운은
알찬 서버의 성취 카탈로그가 확정한다. 클라가 금액을 보내고 서버가 캡으로만 막으면
**캡이 방어가 아니라 가격표**가 된다 — 공격자는 매일 확정적으로 최대치를 가져간다.

성취 등록은 알찬 쪽에 요청한다(앱이 스스로 만들 수 없다).

## 6. 앱 등록

| 문서 | 무엇 | 캐시 |
|---|---|---|
| `platformApps/_registry` | 표시용 카탈로그(이름·아이콘·URL) | ✅ 세션당 1회 |
| `platformAppPolicies/{appId}` | **집행 정책**(kill switch·실행URL·등급·캡·허용 클레임) | ❌ 매번 직접 읽음 |

정책을 카탈로그에 합치지 않는 이유: 카탈로그는 캐시된다. 거기에 kill switch 를 넣으면
**앱을 끈 뒤에도 캐시가 살아 있는 학생에게는 계속 켜져 있다.**

앱 하나를 AAP 로 이관하려면 정책 문서의 `aapEnabled` 를 켠다. 기본은 꺼짐이다 —
카탈로그에 있다고 자동으로 토큰이 나가지 않는다.

## 7. 운영

- **kill switch**: `status` 를 `active` 밖의 값으로 두면 그 즉시 토큰 발급이 멈춘다.
  정책을 캐시하지 않으므로 **다음 실행부터 바로** 듣는다(이미 발급된 토큰은 최대 5분 남는다).
  ```bash
  node scripts/ops/aap-switch.mjs list              # 전체 상태
  node scripts/ops/aap-switch.mjs off siteXxx       # 🔴 즉시 차단
  node scripts/ops/aap-switch.mjs migrate siteXxx   # AAP 이관 켜기
  ```
  화면이 아직 없어서 이 스크립트가 유일한 조작 수단이다. **스위치가 있는데 누를 방법이 없으면
  스위치가 없는 것과 같다** — 화면이 생기기 전까지 이걸 유지한다
- **fail-closed**: 서명키·salt 가 없거나 정책을 못 읽으면 **발급하지 않는다**. 의심스러우면 지급하지 않는다
- **키 회전 = 반드시 2단계.** 한 번에 바꾸면 JWKS 를 캐시한 앱이 최대 5분 통째로 실패한다.
  핵심은 **"서명에 쓰기 전에 먼저 게시한다"** 이다 — `CURRENT` 가 서명키, `PREVIOUS` 는 게시만 된다.

  | 단계 | `AAP_SIGNING_KEY_CURRENT` | `AAP_SIGNING_KEY_PREVIOUS` | 대기 | 이 시점의 상태 |
  |---|---|---|---|---|
  | ① 게시 | **옛 키**(그대로) | **새 키** | > 5분 (JWKS 캐시) | 새 키가 JWKS 에 뜨지만 아직 아무도 그걸로 서명 안 함 |
  | ② 전환 | **새 키** | 옛 키 | > 10분 (토큰 TTL + 캐시) | 모든 앱이 새 키를 이미 받아 뒀다 → 무중단 |
  | ③ 정리 | 새 키 | (비움) | — | 옛 키 폐기 |

  각 단계는 GitHub Secret 을 바꾸고 `functions/` 를 재배포하면 적용된다.
  **①을 건너뛰면 회전이 곧 장애다.**
- **pairwise salt 는 회전하지 않는다**. 바꾸면 모든 위성앱의 학생 신원이 통째로 갈린다
