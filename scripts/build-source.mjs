#!/usr/bin/env node
/**
 * build/ 가 **지금 커밋된 소스로** 만들어졌는지 — 소스 지문(sha256)으로 확인한다.
 *
 * 왜 (2026-10-14 실측):
 *   이 저장소는 build/ 를 git 에 커밋해 배포하고, 같은 main 에서 여러 세션이 동시에 일한다.
 *   한 세션이 다른 세션의 소스 커밋(죽은 페이지 삭제)을 받기 전 작업 트리로 `npm run build` 해
 *   build/ 를 커밋했고, 그게 그대로 배포됐다 — 운영 번들에 소스에서 이미 지운 페이지
 *   (FirestoreDoctor·RecoverDonations·AuditAdminCash)가 살아 있었다.
 *   check-build-integrity 는 «build/ 가 자기 참조를 만족하는가»만 보고, 소스와의 일치는 못 본다
 *   (그 스크립트 머리말의 ⚠️ 참조). 그 빈칸을 메운다.
 *
 * 방법: 번들에 들어가는 입력(아래 INPUTS)의 경로·내용을 정렬해 sha256 하나로 묶는다.
 *   · 빌드 때(vite.config.js 플러그인) → build/build-source.json 에 적는다
 *   · 배포 때(deploy.yml, node_modules 없음) → 체크아웃된 소스로 다시 계산해 비교, 다르면 실패
 *   작업 트리에 커밋 안 된 변경이 섞인 채 빌드해도 다르게 나온다 — 그게 의도다
 *   (커밋에 없는 코드가 운영에 나가는 것).
 *
 * ⚠️ .env 값(REACT_APP_*)은 커밋되지 않아 지문에 못 넣는다 — 환경변수 차이는 여기서 못 잡는다.
 * ⚠️ 의존성 잠금 파일은 일부러 뺐다 — 개발 도구 버전만 올려도 배포가 막히는 소음이 커서.
 *
 * 실행:
 *   node scripts/build-source.mjs            → 지문 출력
 *   node scripts/build-source.mjs --check    → build/build-source.json 과 비교(다르면 exit 1)
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 번들 입력. 디렉터리는 재귀. src/test 는 번들에 안 들어가므로 뺀다. */
const INPUTS = ["src", "public", "index.html", "vite.config.js", "tailwind.config.js", "postcss.config.js"];
const EXCLUDE = [/^src\/test\//, /(^|\/)\.DS_Store$/];

function walk(abs, out) {
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) walk(join(abs, name), out);
  } else if (st.isFile()) {
    out.push(abs);
  }
}

/** 소스 지문 — 경로(슬래시 정규화)와 내용을 정렬 순서로 해시한다. */
export function sourceFingerprint(root = ROOT) {
  const files = [];
  for (const p of INPUTS) {
    const abs = join(root, p);
    if (existsSync(abs)) walk(abs, files);
  }
  const rels = files
    .map((f) => relative(root, f).split(sep).join("/"))
    .filter((r) => !EXCLUDE.some((re) => re.test(r)))
    .sort();
  const h = createHash("sha256");
  for (const r of rels) {
    h.update(r);
    h.update("\0");
    h.update(readFileSync(join(root, r)));
    h.update("\0");
  }
  return { sha256: h.digest("hex"), files: rels.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const now = sourceFingerprint();
  if (!process.argv.includes("--check")) {
    console.log(JSON.stringify(now));
    process.exit(0);
  }
  const metaPath = join(ROOT, "build", "build-source.json");
  if (!existsSync(metaPath)) {
    console.error("❌ build/build-source.json 이 없다 — `npm run build` 로 만든 build/ 를 커밋하라(vite 플러그인이 적는다).");
    process.exit(1);
  }
  const built = JSON.parse(readFileSync(metaPath, "utf8"));
  if (built.sha256 !== now.sha256) {
    console.error(
      "❌ build/ 가 커밋된 소스로 만들어지지 않았다(소스 지문 불일치).\n" +
        `   build/build-source.json: ${built.sha256} (파일 ${built.files}개)\n` +
        `   지금 소스:              ${now.sha256} (파일 ${now.files}개)\n` +
        "   → 최신 main 을 받은 깨끗한 작업 트리에서 `npm run build` 후 build/ 를 다시 커밋하라.\n" +
        "     (다른 세션의 소스 커밋을 받기 전 트리로 빌드하면 그 커밋이 운영에서 되돌려진다.)",
    );
    process.exit(1);
  }
  console.log(`✅ build/ ↔ 소스 지문 일치 (${now.files}개 파일, ${now.sha256.slice(0, 12)})`);
}
