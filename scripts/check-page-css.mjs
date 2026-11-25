// scripts/check-page-css.mjs — 화면 전용 CSS 가 다른 화면으로 새지 않는지 본다(npm run lint — CI 도 같은 명령을 돈다).
//  1) src/pages·src/Music*.css 는 `import css from "x.css?inline"` + usePageCss 로만 붙인다.
//  2) 화면 CSS 에 맨 요소 선택자(*, body, button, h2, input …)·!root 밖 전역 규칙을 쓰지 않는다 —
//     화면이 떠 있는 동안 헤더·사이드바까지 바꾼다. 실측: 주식 `* {box-sizing:inherit}` → 사이드바 288→290px, 줄 44→66px.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("../", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(join(ROOT, "src"));
const rel = (p) => p.slice(ROOT.length);
const GLOBAL_CSS = new Set(["src/index.css", "src/styles.css", "src/App.css"]);
const bad = [];
let pageCss = 0, hooked = 0;
for (const f of files.filter((p) => p.endsWith(".js"))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/import\s+(?:([\w$]+)\s+from\s+)?["']([^"']+\.css)(\?inline)?["']/g)) {
    const target = rel(join(f, "..", m[2]));
    if (GLOBAL_CSS.has(target)) continue;
    if (!m[3]) bad.push(`${rel(f)}: ${m[2]} 를 그냥 import — "?inline" + usePageCss 로 붙인다`);
    else if (!new RegExp(`usePageCss\\(\\s*${m[1]}\\s*\\)`).test(s)) bad.push(`${rel(f)}: ${m[1]} 를 usePageCss 로 붙이지 않았다`);
    else hooked++;
  }
}
for (const f of files.filter((p) => p.endsWith(".css") && !GLOBAL_CSS.has(rel(p)))) {
  pageCss++;
  const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  let buf = "", depth = [], line = 1, start = 1;
  for (const ch of css) {
    if (ch === "{") {
      const sel = buf.trim(); buf = "";
      const inKeyframes = depth.some((d) => /^@(-webkit-)?keyframes/.test(d));
      const nested = depth.some((d) => d && !d.startsWith("@")); // 중첩 규칙은 부모 선택자 아래로 들어간다
      if (!sel.startsWith("@") && !inKeyframes && !nested) for (const part of sel.split(",").map((x) => x.trim())) {
        if (part === ":root") continue; // 변수 선언
        if (!/[.#[]/.test(part)) bad.push(`${rel(f)}:${start} 맨 선택자 "${part}" — 화면 컨테이너 클래스 아래로 내린다`);
      }
      depth.push(sel);
    } else if (ch === "}") { depth.pop(); buf = ""; }
    else if (ch === ";") buf = "";
    else { if (!buf.trim()) start = line; buf += ch; }
    if (ch === "\n") line++;
  }
}
if (!pageCss || !hooked) { console.log("❌ PAGE CSS FAIL — 화면 CSS 를 하나도 못 찾았다(검사 정규식이 코드 모양과 어긋남)"); process.exit(1); }
if (bad.length) { console.log("❌ PAGE CSS FAIL — 화면 CSS 가 다른 화면으로 샌다\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`✅ 화면 CSS ${pageCss}개 · 붙인 곳 ${hooked} — 새는 규칙 없음`);
