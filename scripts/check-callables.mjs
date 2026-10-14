#!/usr/bin/env node
/**
 * 화면이 부르는 Cloud Function 이 **실제로 있는가** — src 의 httpsCallable 이름 ↔ functions/index.js exports.
 *
 * 왜 (2026-10-14 실측):
 *   슈퍼관리자 «시스템 모니터링» 탭이 getSystemStatus·resolveSystemAlert 를 불렀는데, 두 함수는
 *   2026-01-26 «불필요한 Functions 삭제» 커밋에서 이미 지워져 있었다 — 그 탭은 **9개월 동안 열 때마다
 *   오류**였다. ItemContext 도 존재하지 않는 adminCancelSale·adminDeleteItem 을 들고 있었다.
 *   함수를 지우는 쪽과 부르는 쪽이 다른 폴더라, 빌드도 린트도 테스트도 아무 말을 안 한다.
 *   운영에선 CORS 오류(=없는 함수)로만 보인다.
 *
 * 방법: 정규식 대조(의존성 없음 — deploy.yml 처럼 node_modules 없는 곳에서도 돈다).
 *   · 부르는 쪽: src/** 의 `httpsCallable(<아무 인자>, "이름")` (src/test 제외)
 *   · 있는 쪽:   functions/index.js 의 `exports.이름 =` (scheduler-http.js 의 함수도 index.js 가 다시 내보낸다)
 *
 * 실행: node scripts/check-callables.mjs   (없는 이름이 있으면 exit 1)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const exported = new Set(
  [...readFileSync(join(ROOT, "functions", "index.js"), "utf8").matchAll(/^exports\.(\w+)\s*=/gm)].map((m) => m[1]),
);

const missing = [];
let calls = 0;
for (const file of walk(join(ROOT, "src"))) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel.startsWith("src/test/")) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/httpsCallable\(\s*[\w.]+\s*,\s*["'`]([A-Za-z0-9_]+)["'`]/g)) {
    calls++;
    if (!exported.has(m[1])) {
      const line = src.slice(0, m.index).split("\n").length;
      missing.push(`${rel}:${line} → ${m[1]}`);
    }
  }
}

if (calls === 0) {
  // 정규식이 아무것도 못 잡으면 검사가 사라진 것이다 — 조용히 통과시키지 않는다.
  console.error("❌ httpsCallable 호출을 하나도 못 찾았다 — 검사 정규식이 코드 모양과 어긋났다.");
  process.exit(1);
}
if (missing.length) {
  console.error(`❌ 화면이 부르는데 functions 에 없는 함수 ${missing.length}건 (운영에선 CORS 오류로만 보인다):`);
  for (const m of missing) console.error("   " + m);
  console.error("   → 함수를 되살리거나, 부르는 화면 코드를 함께 지워라.");
  process.exit(1);
}
console.log(`✅ 화면이 부르는 함수 ${calls}곳 전부 functions 에 있음 (exports ${exported.size}개)`);
