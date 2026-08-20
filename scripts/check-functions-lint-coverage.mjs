#!/usr/bin/env node
/**
 * functions/ 의 린트 사각지대 검사.
 *
 * 2026-08-17 주급이 **전 학급 실패**했다. 원인은 `flushIfNeeded is not defined` —
 * ESLint 의 `no-undef` 가 잡는 종류의 실수다. 못 잡은 이유는 규칙이 없어서가 아니라
 * `functions/scheduler-http.js` 1행에 통짜 `eslint-disable` 이 있어 **4,096줄 돈 코드가
 * 통째로 검사 밖**이었기 때문이다. 같은 주석이 10개 파일에 더 있었다.
 *
 * 린트를 켜 두는 것만으로는 부족하다 — 다음 사람이 오류 하나를 만나면 파일 맨 위에
 * 통짜 해제를 다시 붙이고, 그 순간부터 아무도 모른다. 그래서 **되돌아오는 것을** 막는다.
 *
 * 규칙 하나: functions/ 안의 어떤 파일도 "전체 해제"로 시작하지 않는다.
 *   허용   `eslint-disable quotes, no-unused-vars`   (무엇을 왜 끄는지 적힌 것)
 *   금지   `eslint-disable`                          (전부 끄는 것)
 *
 * 실행: node scripts/check-functions-lint-coverage.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "functions");

// 파일 어디에 있든 잡는다 — 1행이 아니어도 그 아래 전부가 검사 밖이 되는 건 똑같다.
//   ① 통짜 해제: `eslint-disable` 뒤에 규칙이 없는 것(주석 `--` 이 붙어도 규칙은 아니다)
//   ② no-undef 를 콕 집어 끄는 것 — 통짜는 아니지만 **이번 사고를 잡은 규칙을 정확히 끈다**
const BLANKET = /\/\*\s*eslint-disable\s*(--[^*]*)?\*\//;
const KILLS_NO_UNDEF = /\/\*\s*eslint-disable[^*]*\bno-undef\b/;

const offenders = [];
for (const name of readdirSync(DIR)) {
  if (!name.endsWith(".js")) continue;
  const lines = readFileSync(join(DIR, name), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BLANKET.test(line)) offenders.push(`functions/${name}:${i + 1}  (통짜 해제)`);
    else if (KILLS_NO_UNDEF.test(line)) offenders.push(`functions/${name}:${i + 1}  (no-undef 해제)`);
  });
}

if (offenders.length > 0) {
  console.error("❌ functions/ 에 린트 사각지대가 있습니다 — 그 아래 코드는 검사되지 않습니다.");
  for (const o of offenders) console.error(`   ${o}`);
  console.error("\n   끌 규칙을 명시하세요:  /* eslint-disable quotes, no-unused-vars */");
  console.error("   (2026-08-17 주급 전 학급 실패가 정확히 이 사각지대에서 나왔습니다)");
  process.exit(1);
}
console.log("✅ functions/ 린트 사각지대 없음");
