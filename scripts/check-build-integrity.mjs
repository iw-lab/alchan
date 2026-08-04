#!/usr/bin/env node
/**
 * 커밋된 build/ 가 **스스로 온전한지** 검사한다.
 *
 * 이 저장소는 build/ 를 git 에 커밋해서 배포한다(deploy.yml 이 build/** 변경에 반응).
 * 그래서 다음 실수가 가능하다:
 *
 *   npm run build          → 새 해시로 청크가 통째로 새로 생김
 *   git add -u build       → **수정·삭제분만** 스테이징 (신규 파일은 안 들어감)
 *   git commit && push     → index.html 은 새 해시를 가리키는데 그 파일이 없음
 *   → 배포 직후 전원 404. 로그인 화면조차 안 뜬다.
 *
 * 빌드는 성공하고 테스트도 통과한다. git 도 아무 말 안 한다. 오직 배포 후 학생이
 * 발견한다. 그 실패모드를 여기서 막는다 — index.html 과 각 청크가 참조하는
 * /assets/* 가 실제로 build/ 안에 있는지 전수 확인한다.
 *
 * ⚠️ 이 검사는 "커밋된 산출물이 자기 참조를 만족하는가"만 본다. "산출물이 현재
 *    소스와 일치하는가"는 못 본다 — 그건 재빌드 후 diff 로 확인해야 하는데
 *    실제 환경변수가 필요해서 CI 에선 못 한다(vite.config.js 의 ALLOW_MISSING_ENV 설명 참고).
 *
 * 실행: node scripts/check-build-integrity.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * acorn(문법 검사용)은 **있으면 쓰고 없으면 건너뛴다.**
 *
 * 이 스크립트는 두 곳에서 돈다:
 *   · ci.yml     — npm ci 뒤라 node_modules 가 있다 → 문법 검사까지 전부
 *   · deploy.yml — npm ci 를 안 한다 → node_modules 가 없다
 * 정적 import 로 두었더니 배포가 ERR_MODULE_NOT_FOUND 로 죽었다(실측). 배포 경로에
 * 의존성 설치를 새로 넣는 것보다, 의존성 없이도 도는 쪽이 맞다 — 여기서 진짜 막아야 할
 * 건 "청크 누락 = 전원 404"이고 그건 파서가 필요 없다. 문법 검사는 CI 가 담당한다.
 *
 * ⚠️ 단 **조용히 건너뛰지 않는다.** 검사가 사라진 것은 실패로 보이지 않기 때문에,
 *    건너뛴다는 사실 자체를 출력한다.
 */
let tokenizer = null;
try {
  ({ tokenizer } = await import("acorn"));
} catch {
  // 아래에서 안내 문구와 함께 문법 검사만 건너뛴다.
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");

if (!existsSync(join(BUILD, "index.html"))) {
  console.error("❌ build/index.html 이 없습니다. npm run build 를 먼저 실행하세요.");
  process.exit(1);
}

/**
 * 자산 참조를 긁는다. Rollup 은 한 산출물 안에서도 **세 가지 형태**를 섞어 쓴다:
 *   · index.html          →  "/assets/index-abc.js"        (절대)
 *   · 동적 import         →  import("./Banking-abc.js")     (상대)
 *   · __vite__mapDeps 표  →  "assets/Banking-abc.js"        (build 루트 기준)
 * 하나만 보면 대부분을 놓친다 — 처음엔 절대경로만 봐서 참조 4건만 찾았고,
 * 나머지 105개가 전부 "아무도 참조 안 함"으로 보였다. 셋 다 잡아 build/ 기준
 * 경로로 정규화한다.
 */
const REF = /["'`(]\s*(?:\.\/|\/)?((?:assets\/)?[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.(?:js|css))/g;
const normalize = (raw) =>
  "/" + (raw.startsWith("assets/") ? raw : `assets/${raw}`);

const sources = [
  { file: "index.html", text: readFileSync(join(BUILD, "index.html"), "utf8") },
];
const assetsDir = join(BUILD, "assets");
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (name.endsWith(".js")) {
      sources.push({
        file: `assets/${name}`,
        text: readFileSync(join(assetsDir, name), "utf8"),
      });
    }
  }
}

const missing = [];
const seen = new Set();
let refCount = 0;

for (const { file, text } of sources) {
  for (const m of text.matchAll(REF)) {
    const ref = normalize(m[1]);
    refCount++;
    seen.add(ref);
    if (!existsSync(join(BUILD, ref))) {
      missing.push({ from: file, ref });
    }
  }
}

console.log("\n📦 빌드 산출물 무결성 검사\n");
console.log(`  검사한 파일     ${sources.length}개`);
console.log(`  참조            ${refCount}건 (고유 ${seen.size}개)`);

if (missing.length) {
  console.log(`\n\x1b[31m❌ 참조하는데 존재하지 않는 파일 ${missing.length}건:\x1b[0m\n`);
  for (const { from, ref } of missing.slice(0, 20)) {
    console.log(`   ${from}  →  ${ref}`);
  }
  if (missing.length > 20) console.log(`   … 외 ${missing.length - 20}건`);
  console.log(
    `\n  거의 항상 원인은 하나입니다: 새로 생긴 청크를 커밋하지 않았습니다.\n` +
      `  \x1b[33mgit add -A build/\x1b[0m 로 신규 파일까지 담아 다시 커밋하세요.\n` +
      `  (\`git add -u\` 는 신규 파일을 담지 않습니다 — 이게 이 사고의 단골 원인입니다)\n`,
  );
  process.exit(1);
}

/**
 * 문법 하한선 검사.
 *
 * vite.config.js 의 `build.target` 이 지워지거나 완화되면, 산출물에 최신 문법이
 * 그대로 남는다. 그러면 오래된 기기에서 **파싱 단계에서 죽는다** — 한 줄도 실행되기
 * 전에 화면이 하얗고, 콘솔 에러조차 학생 눈엔 안 보인다. 빌드는 성공하고, 테스트도
 * 통과하고, 최신 기기에서는 멀쩡하다. 개발자가 알 방법이 없다.
 *
 * 그래서 설정을 믿지 않고 **산출물을 직접 본다.** 아래 셋은 CRA 가 변환해 주던 것이고
 * (라이브 번들 실측), 낮춰 잡는 비용은 gzip +1.3 kB 였다.
 *
 * 검사 방법: **정규식이 아니라 토크나이저**를 쓴다(acorn — rollup 이 이미 끌고 온다).
 *   정규식은 문자열 안까지 보기 때문에 이 앱에서 바로 오탐이 났다:
 *     · 프롬프트 문자열의 CSS 색상 `(#ffffff)` → private 필드로 오인, 13개 파일 오검출
 *   반대로 파싱(acorn.parse)만 쓰는 것도 안 된다:
 *     · 동적 `import()` 는 ES2020 이라 ecmaVersion 2019 파싱이 거부하는데, 이건
 *       코드 스플리팅의 핵심이라 변환 대상이 아니고 Safari 11+ 에서 잘 돈다 → 오탐
 *   토크나이저는 문자열을 토큰 하나로 넘기고 문법만 토큰으로 내보내므로 둘 다 피한다.
 *   (판별기 자체를 실측 검증했다: 문법 5종 검출, 문자열 속 같은 글자·동적 import 무시)
 */
const RISKY = new Map([
  ["?.", { name: "옵셔널 체이닝 ?.", since: "Safari 13.1" }],
  ["??", { name: "널 병합 ??", since: "Safari 13.1" }],
  ["??=", { name: "논리 대입 ??=", since: "Safari 14" }],
  ["||=", { name: "논리 대입 ||=", since: "Safari 14" }],
  ["&&=", { name: "논리 대입 &&=", since: "Safari 14" }],
  ["#private", { name: "클래스 private 필드 #", since: "Safari 14.1" }],
]);

const modern = [];
if (!tokenizer) {
  console.log(
    `  \x1b[33m⚠️ 문법 하한선 검사 건너뜀\x1b[0m — acorn 이 없습니다(node_modules 미설치).\n` +
      `     참조 무결성은 검사했습니다. 문법 검사는 CI(npm ci 뒤)에서 돕니다.`,
  );
}
for (const { file, text } of tokenizer ? sources : []) {
  if (!file.endsWith(".js")) continue;
  const found = new Set();
  try {
    for (const token of tokenizer(text, {
      ecmaVersion: 2022,
      sourceType: "module",
    })) {
      const label = token.type.label;
      if (RISKY.has(label)) found.add(label);
      else if (token.type.isAssign && RISKY.has(token.value)) found.add(token.value);
      else if (label === "privateId") found.add("#private");
    }
  } catch (err) {
    // 토큰화조차 안 되면 산출물이 깨진 것이다 — 문법 하한선보다 심각하다.
    console.error(`\n❌ ${file} 를 토큰화하지 못했습니다: ${err.message}`);
    process.exit(1);
  }
  for (const key of found) {
    modern.push({ file, ...RISKY.get(key) });
  }
}

if (modern.length) {
  console.log(`\n\x1b[31m❌ 오래된 기기에서 파싱 실패할 문법이 산출물에 있습니다:\x1b[0m\n`);
  const byName = new Map();
  for (const m of modern) {
    if (!byName.has(m.name)) byName.set(m.name, { since: m.since, files: [] });
    byName.get(m.name).files.push(m.file);
  }
  for (const [name, { since, files }] of byName) {
    console.log(`   ${name}  (${since} 이상 필요)  — ${files.length}개 파일`);
    console.log(`      예: ${files.slice(0, 2).join(", ")}`);
  }
  console.log(
    `\n  vite.config.js 의 \x1b[33mbuild.target\x1b[0m 이 빠졌거나 완화됐습니다.\n` +
      `  이대로 배포하면 구형 기기에서 **로그인 화면조차 안 뜹니다**(흰 화면, 에러 없음).\n` +
      `  target: ["es2019","safari13",…] 를 복구하세요 — 비용은 gzip 1.3 kB 입니다.\n`,
  );
  process.exit(1);
}

// 반대 방향: 아무도 참조하지 않는 청크가 대량으로 남아 있으면 옛 빌드 잔재일 수 있다.
const onDisk = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((n) => n.endsWith(".js") || n.endsWith(".css"))
  : [];
const orphans = onDisk.filter((n) => !seen.has(`/assets/${n}`));
if (orphans.length) {
  console.log(
    `\n  \x1b[33m참고\x1b[0m 아무도 참조하지 않는 파일 ${orphans.length}개 ` +
      `(진입점이거나 옛 빌드 잔재)`,
  );
  for (const n of orphans.slice(0, 5)) console.log(`     assets/${n}`);
  if (orphans.length > 5) console.log(`     … 외 ${orphans.length - 5}개`);
}

console.log("\n통과 — 참조된 자산이 모두 존재합니다\n");
