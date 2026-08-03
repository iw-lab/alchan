#!/usr/bin/env node
/**
 * 기술부채 비율 조임(ratchet).
 *
 * 이 앱에는 alert() 671곳, !important 721곳처럼 오래 쌓인 것들이 있다. 오늘 다 고치는 건
 * 비현실적이고, 고치겠다고 멈추면 아무것도 안 고쳐진다. 그래서 **지금 수치를 천장으로
 * 박고, 늘어나면 실패**시킨다. 줄이는 건 언제든 환영이고 그때 천장을 내린다.
 *
 * 린터로 "규칙 위반 금지"를 켜면 671개를 한 번에 고쳐야 해서 결국 규칙을 끄게 된다.
 * 억제 주석을 671개 다는 것도 같은 결과다 — 그 순간부터 아무도 그 규칙을 안 본다.
 * 천장 방식은 새 부채만 막으므로 켜 두는 값이 있다.
 *
 * 실행: node scripts/debt-ratchet.mjs           (검사)
 *       node scripts/debt-ratchet.mjs --update  (줄어든 만큼 천장 내리기)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "debt-baseline.json");

/** src 아래 파일을 모두 훑는다. node_modules 는 애초에 없다. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const code = files.filter((f) => [".js", ".jsx"].includes(extname(f)));
const styles = files.filter((f) => [".css", ".js", ".jsx"].includes(extname(f)));

const count = (list, re) =>
  list.reduce((n, f) => n + (readFileSync(f, "utf8").match(re) || []).length, 0);

/**
 * 각 지표는 "왜 이게 부채인가"가 분명한 것만 넣는다. 숫자를 위한 숫자는 사람이 무시한다.
 */
const METRICS = {
  // 탭 전체를 얼리고, 금액을 못 보여주고, 되돌릴 수 없다. 모바일에선 특히 나쁘다.
  alertConfirm: {
    label: "alert()/confirm() 호출",
    value: count(code, /(?<![\w.])(?:window\.)?(?:alert|confirm)\s*\(/g),
  },
  // CSS 가 서로 싸우고 있다는 뜻. "한 군데 고쳤더니 다른 데가 깨진다"의 기계적 원인.
  important: {
    label: "!important",
    value: count(styles, /!important/g),
  },
  // 억제 한 줄이 파일 전체 검사를 무력화하는 경우가 있다. 늘어나면 검사가 그만큼 눈이 먼다.
  lintSuppress: {
    label: "린트 억제 주석",
    value: count(code, /eslint-disable/g),
  },
  // 화면이 데이터 계층을 건너뛰고 Firestore 를 직접 부르는 파일 수.
  // 읽기 방식을 바꾸려면 이 파일들을 전부 고쳐야 한다 = 변경 비용이 여기 비례한다.
  firestoreDirect: {
    label: "Firestore 를 직접 부르는 화면 파일",
    value: code.filter((f) => {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      if (rel.startsWith("firebase/")) return false; // 여기가 데이터 계층 — 정상
      return /from\s+["']firebase\/firestore["']/.test(readFileSync(f, "utf8"));
    }).length,
  },
};

const current = Object.fromEntries(
  Object.entries(METRICS).map(([k, v]) => [k, v.value]),
);

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
  console.log("천장을 현재 수치로 갱신했습니다:");
  for (const [k, m] of Object.entries(METRICS)) console.log(`  ${m.label}: ${m.value}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`천장 파일이 없습니다: ${BASELINE}\n  먼저 --update 로 만드세요.`);
  process.exit(1);
}

console.log("\n📊 기술부채 천장 검사\n");
let failed = 0;
let improved = 0;
for (const [key, m] of Object.entries(METRICS)) {
  const cap = baseline[key];
  if (cap === undefined) {
    console.log(`  \x1b[33m?\x1b[0m ${m.label}: ${m.value} (천장 미설정 — --update 필요)`);
    continue;
  }
  const d = m.value - cap;
  if (d > 0) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${m.label}: ${m.value} (천장 ${cap}, \x1b[31m+${d}\x1b[0m)`);
  } else if (d < 0) {
    improved++;
    console.log(`  \x1b[32m✓\x1b[0m ${m.label}: ${m.value} (천장 ${cap}, \x1b[32m${d}\x1b[0m 개선)`);
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${m.label}: ${m.value} (천장과 동일)`);
  }
}

if (failed) {
  console.log(
    `\n\x1b[31m${failed}개 지표가 늘었습니다.\x1b[0m\n` +
      `  새로 넣은 것을 되돌리거나, 대체 수단을 쓰세요.\n` +
      `  예) alert(") → 토스트/모달 · !important → 선택자 정리 · 직접 Firestore → src/firebase 경유\n` +
      `  정말 불가피하다면 이 검사를 끄지 말고 천장을 올리되, 왜인지 커밋 메시지에 남기세요.\n`,
  );
  process.exit(1);
}
if (improved) {
  console.log(
    `\n\x1b[32m${improved}개 지표가 개선됐습니다.\x1b[0m 천장을 내려 되돌아가지 않게 하세요:\n` +
      `  node scripts/debt-ratchet.mjs --update\n`,
  );
}
console.log("통과 — 새 부채 없음\n");
