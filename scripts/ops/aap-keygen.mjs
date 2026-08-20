#!/usr/bin/env node
/**
 * AAP 서명키 생성 (RS256, RSA-2048).
 *
 * 이 스크립트는 **개인키를 화면에 찍지 않는다.** 저장소가 PUBLIC 이고, 터미널 출력은
 * 스크롤백·로그·스크린샷으로 남는다. 개인키는 저장소 **밖** 파일로만 나가고,
 * 화면에는 kid 와 공개 JWK 만 보여준다.
 *
 * 실행:
 *   node scripts/ops/aap-keygen.mjs                 # 새 키 생성
 *   node scripts/ops/aap-keygen.mjs --print-secret  # base64 개인키를 stdout 으로 (파이프 전용)
 *
 * 배포까지의 경로:
 *   1) 이 스크립트로 키 생성 → ~/alchan-backups/aap-key-<kid앞8>.b64
 *   2) gh secret set AAP_SIGNING_KEY_CURRENT < 그 파일
 *   3) git push → deploy.yml 이 functions/.env 로 주입
 *
 * 🔁 회전은 **2단계다. 한 번에 바꾸면 장애다.**
 *    JWKS 를 5분 캐시한 위성앱은 아직 옛 키만 들고 있는데 새 kid 토큰을 받게 되기 때문이다.
 *    핵심 = **서명에 쓰기 전에 먼저 게시한다**(CURRENT 가 서명키, PREVIOUS 는 게시만 된다).
 *      ① 게시:  CURRENT=옛 키(그대로) · PREVIOUS=새 키   → 배포 → 5분 이상 대기
 *      ② 전환:  CURRENT=새 키          · PREVIOUS=옛 키   → 배포 → 10분 이상 대기
 *      ③ 정리:  CURRENT=새 키          · PREVIOUS=(비움)  → 배포
 *    상세 표는 docs/AAP_V1_SPEC.md §7.
 */
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PRINT = process.argv.includes("--print-secret");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const b64 = Buffer.from(pem).toString("base64");

// kid = RFC 7638 JWK 지문. functions/aap/keys.js 와 **같은 식**이어야 한다.
const jwk = createPublicKey(privateKey).export({ format: "jwk" });
const kid = createHash("sha256")
  .update(`{"e":"${jwk.e}","kty":"${jwk.kty}","n":"${jwk.n}"}`)
  .digest("base64url");

if (PRINT) {
  // 파이프 전용. `node ... --print-secret | gh secret set NAME`
  process.stdout.write(b64);
  process.exit(0);
}

// 기본은 저장소 밖 개인 백업 폴더. `AAP_KEYGEN_DIR` 로 바꿀 수 있는 이유는 **테스트** 때문이다 —
// 테스트가 이 스크립트를 진짜로 돌려 kid 파생식을 대조하는데(가짜 초록 방지), 그때마다
// 진짜 백업 폴더에 버리는 키가 쌓이면 **정작 배포에 쓰는 키를 구분할 수 없게 된다**
// (2026-08-20 실측: 한 세션에 28개가 쌓였다).
const dir = process.env.AAP_KEYGEN_DIR || join(homedir(), "alchan-backups");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const out = join(dir, `aap-key-${kid.slice(0, 8)}.b64`);
writeFileSync(out, b64, { mode: 0o600 });

console.log("✅ AAP 서명키 생성 완료");
console.log(`   kid   : ${kid}`);
console.log(`   개인키 : ${out}  (권한 600 · 저장소 밖 · 내용은 출력하지 않음)`);
console.log("   공개키 :", JSON.stringify({ kty: jwk.kty, e: jwk.e, alg: "RS256", use: "sig", kid }));
console.log("");
console.log("다음:");
console.log(`   gh secret set AAP_SIGNING_KEY_CURRENT < ${out}`);
console.log("   (회전이면 옛 키를 먼저 AAP_SIGNING_KEY_PREVIOUS 로 옮길 것)");
