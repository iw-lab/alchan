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

/**
 * src 아래 파일을 모두 훑는다. node_modules 는 애초에 없다.
 *
 * 깨진 심볼릭 링크 하나로 CI 가 raw stack trace 를 뱉으며 죽으면, 사람은 "부채 검사가
 * 고장났다"가 아니라 "CI 가 이상하다"로 읽고 검사를 꺼 버린다. 무엇이 문제인지
 * 말해 주고 죽는다.
 */
function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (err) {
    console.error(`디렉터리를 읽지 못했습니다: ${dir}\n  ${err.message}`);
    process.exit(1);
  }
  for (const name of names) {
    const p = join(dir, name);
    let stat;
    try {
      stat = statSync(p);
    } catch {
      // 깨진 심볼릭 링크 등. 셀 수 없는 것은 세지 않고 넘어간다 — 다만 조용히는 아니다.
      console.warn(`  ⚠️ 건너뜀(읽을 수 없음): ${relative(ROOT, p)}`);
      continue;
    }
    if (stat.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const code = files.filter((f) => [".js", ".jsx"].includes(extname(f)));
const styles = files.filter((f) => [".css", ".js", ".jsx"].includes(extname(f)));

/**
 * 주석을 지운 뒤 센다.
 *
 * ⚠️ 왜 필요한가 — 이 저장소에서 두 번 걸렸다. `lintSuppress` 는 처음에 맨 문자열로
 *    세다가 "eslint-disable 은 여기서 안 먹는다" 같은 **설명 문장**까지 부채로 잡았다.
 *    이번엔 `!important` 가 같은 식으로 걸렸다: Police.css 의 `!important` 함정을
 *    주석으로 적어 두자 천장이 721 → 723 으로 올라갔다.
 *
 *    함정을 문서로 남길수록 부채가 늘어나는 지표는 사람이 결국 문서를 안 쓰게 만든다.
 *    지표는 **실행되는 코드**만 세야 한다.
 *
 *    URL 의 `://` 는 줄 주석으로 오인하지 않는다.
 */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * @param keepComments 주석 자체가 측정 대상인 지표만 true.
 *   ⚠️ 이걸 빼먹으면 `lintSuppress` 가 **항상 0** 이 된다(억제 지시자는 주석이니까).
 *      실제로 한 번 그렇게 만들었고, 0 이라는 숫자가 너무 이상해서 알아챘다.
 *      "개선됐다"로 보이는 고장이 가장 위험하다.
 */
const count = (list, re, { keepComments = false } = {}) =>
  list.reduce((n, f) => {
    const text = readFileSync(f, "utf8");
    return n + ((keepComments ? text : stripComments(text)).match(re) || []).length;
  }, 0);

/**
 * 각 지표는 "왜 이게 부채인가"가 분명한 것만 넣는다. 숫자를 위한 숫자는 사람이 무시한다.
 */
const METRICS = {
  // 탭 전체를 얼리고, 금액을 못 보여주고, 되돌릴 수 없다. 모바일에선 특히 나쁘다.
  // `globalThis.alert`·`window["confirm"]` 형태도 센다 — 지금 이 코드베이스엔 0건이지만,
  // 세지 않는 형태가 있으면 그게 곧 우회로가 된다.
  //
  // ⚠️ `prompt` 도 센다. 처음엔 alert·confirm 만 셌는데, 둘을 다 걷어낸 뒤 린트를
  //    켜 보니 **prompt 가 10건 남아 있었다**(2026-08-04). 세지 않는 것은 줄지 않는다 —
  //    "부채 0"이라고 보고할 뻔했다. 셋 다 같은 종류의 문제(탭을 얼리는 시스템 창)다.
  alertConfirm: {
    label: "alert()/confirm()/prompt() 호출",
    value: count(
      code,
      /(?<![\w.])(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)\s*\(|(?:window|globalThis)\s*\[\s*["'](?:alert|confirm|prompt)["']\s*\]/g,
    ),
  },
  // CSS 가 서로 싸우고 있다는 뜻. "한 군데 고쳤더니 다른 데가 깨진다"의 기계적 원인.
  important: {
    label: "!important",
    value: count(styles, /!important/g),
  },
  // 억제 한 줄이 파일 전체 검사를 무력화하는 경우가 있다. 늘어나면 검사가 그만큼 눈이 먼다.
  // ⚠️ 주석 시작(`//` 또는 `/*`) 바로 뒤에 오는 것만 센다 = **실제 지시자만**.
  //    맨 문자열로 세면 "eslint-disable 은 여기서 안 먹는다" 같은 설명 문장까지 부채로
  //    잡혀서, 함정을 문서로 남기려 할수록 천장이 올라간다 — 실제로 한 번 걸렸다.
  lintSuppress: {
    label: "린트 억제 주석",
    // 이 지표만 주석을 살려서 센다 — 억제 지시자 자체가 주석이다.
    value: count(code, /(?:\/\/|\/\*)\s*eslint-disable/g, { keepComments: true }),
  },
  // 화면이 데이터 계층을 건너뛰고 Firestore 를 직접 부르는 파일 수.
  // 읽기 방식을 바꾸려면 이 파일들을 전부 고쳐야 한다 = 변경 비용이 여기 비례한다.
  firestoreDirect: {
    label: "Firestore 를 직접 부르는 화면 파일",
    value: code.filter((f) => {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      if (rel.startsWith("firebase/")) return false; // 여기가 데이터 계층 — 정상
      // 정적 import 뿐 아니라 동적 import()·require() 도 센다. 실제로 이 코드베이스엔
      // `await import("firebase/firestore")` 를 쓰는 파일이 4개 있다 — 지금은 넷 다
      // 정적 import 도 함께 있어서 어느 쪽으로 세든 같지만, 동적만 쓰는 파일이 생기면
      // 정적만 보는 검사는 그걸 못 본다.
      // ⚠️ `from\s+` 였다가 **공백 없는 `from"firebase/firestore"` 를 놓쳤다**(뮤테이션으로
      //    발견). 유효한 JS 이고 포매터를 안 거친 코드에서 흔하다. `\s*` 로 고쳤다.
      //    지표가 못 세는 형태는 그대로 우회로가 된다.
      return /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']firebase\/firestore["']/.test(
        stripComments(readFileSync(f, "utf8")),
      );
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
