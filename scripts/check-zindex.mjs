#!/usr/bin/env node
/**
 * 확인창·토스트가 **항상 맨 위**인지 지킨다.
 *
 * ## 왜 이 검사가 필요한가 (실제로 당한 것)
 * 확인 모달은 처음에 `z-[10001]` 이었다. 앱에서 제일 높은 축이라고 생각했는데,
 * 재 보니 그보다 위에 그려지는 파일이 **8개**였다:
 *
 *   10000000  pages/government/Police.css      ← 모바일 미디어쿼리
 *    1000000  pages/real-estate/RealEstateRegistry.js
 *     100000  pages/government/NationalAssembly.css
 *      99999  components/EconomicEventPopup.js  …
 *
 * 특히 나쁜 건 Police.css 다. `.modal-overlay` / `.modal-container` 라는
 * **아주 흔한 클래스 이름**에 `!important` 로 z-index 를 박아 두는데,
 * 이 클래스는 12개 화면이 공유하고, CSS 는 컴포넌트에서 import 해도 전역이다.
 * 즉 학생이 경찰서를 한 번 열면 그 뒤로 앱 전체에서 확인창이 다른 모달 뒤에 숨는다.
 *
 * 증상은 조용하다 — 에러가 안 난다. 사용자는 "버튼이 안 눌린다"고 느껴 계속 누르고,
 * 호출부는 `await confirmDialog(...)` 에서 멈춘 채 로딩 상태로 남는다.
 * 그리고 하필 가장 파괴적인 확인들(법안 전체 삭제·신고 기록 전체 삭제·파산 신청)이
 * 정확히 그 높은 z-index 화면 안에 있다.
 *
 * ## 그래서 숫자를 올리는 대신 경쟁을 끝냈다
 * 확인창을 int32 최대값에 두고, **누구도 그 위로 못 올라오게** 이 검사로 막는다.
 * 숫자만 올리면 다음 사람이 또 999999 를 적고 같은 일이 반복된다.
 *
 * 실행: node scripts/check-zindex.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** 최상단을 차지해야 하는 것들. 값은 파일에서 직접 읽어 온다(문서와 코드가 어긋나지 않게). */
const TOP = [
  { file: "src/components/ConfirmHost.js", role: "확인 모달" },
  { file: "src/components/ToastHost.js", role: "토스트" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // 깨진 심볼릭 링크 등
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

/** 한 파일에서 z-index 로 보이는 값을 전부 뽑는다(Tailwind 임의값·인라인 style·CSS). */
function zIndexesOf(text) {
  const found = [];
  for (const m of text.matchAll(/z-\[(\d+)\]/g)) found.push(+m[1]);
  for (const m of text.matchAll(/zIndex:\s*["']?(\d+)/g)) found.push(+m[1]);
  for (const m of text.matchAll(/z-index:\s*(\d+)/g)) found.push(+m[1]);
  return found;
}

const files = walk(SRC);
const texts = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

// ① 최상단 컴포넌트들의 실제 값을 읽는다.
const tops = [];
for (const t of TOP) {
  const abs = join(ROOT, t.file);
  const text = texts.get(abs);
  if (text === undefined) {
    console.error(`❌ ${t.file} 을 찾지 못했습니다 — 경로가 바뀌었으면 이 검사도 고치세요.`);
    process.exit(1);
  }
  const vals = zIndexesOf(text);
  if (vals.length === 0) {
    console.error(`❌ ${t.file} 에서 z-index 를 찾지 못했습니다 — ${t.role}이 최상단이 아닐 수 있습니다.`);
    process.exit(1);
  }
  tops.push({ ...t, abs, value: Math.max(...vals) });
}

const floor = Math.min(...tops.map((t) => t.value));

// ② 그 값 이상을 쓰는 다른 파일이 있으면 실패.
const offenders = [];
for (const [abs, text] of texts) {
  if (tops.some((t) => t.abs === abs)) continue;
  const max = Math.max(0, ...zIndexesOf(text));
  if (max >= floor) offenders.push({ file: relative(ROOT, abs), max });
}

console.log("\n🧱 z-index 최상단 검사\n");
for (const t of tops) {
  console.log(`  ${t.role.padEnd(10)} ${String(t.value).padStart(11)}  ${t.file}`);
}
console.log(`  다른 파일 검사   ${String(files.length - tops.length).padStart(11)}개`);

if (offenders.length) {
  offenders.sort((a, b) => b.max - a.max);
  console.log(`\n\x1b[31m❌ 확인창/토스트를 가릴 수 있는 z-index 가 있습니다:\x1b[0m\n`);
  for (const o of offenders) console.log(`   ${String(o.max).padStart(11)}  ${o.file}`);
  console.log(
    `\n  확인창이 가려지면 에러 없이 조용히 멈춥니다 — 사용자는 "버튼이 안 눌린다"고 느끼고,\n` +
      `  호출부는 await 에서 안 끝납니다. 되돌릴 수 없는 작업의 관문이라 그 결과가 큽니다.\n` +
      `  해당 값을 ${floor} 미만으로 낮추세요. 확인창보다 위에 있어야 할 UI 는 없습니다.\n`,
  );
  process.exit(1);
}

console.log(`\n통과 — 확인창/토스트보다 위에 그려지는 것이 없습니다\n`);
