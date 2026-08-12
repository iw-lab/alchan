/**
 * base 아바타 5종(PNG) → WebP 변환.
 *
 * 왜 이 5개만 PNG 로 남아 있었나: `Avatar.js` 가 옷을 입은 변종을 찾을 때
 * URL 의 `.png` 를 `_outfit.png` 로 **문자열 치환**했기 때문이다(Avatar.js:31).
 * 확장자를 바꾸면 그 치환이 깨지므로 2026-08-03 WebP 이관에서 이 5개만 제외됐다.
 * 이번에 치환을 확장자 무관으로 고쳤으므로(`\.(png|webp)` → `_outfit.$1`) 제약이 사라졌다.
 *
 * 실측(2026-08-12): 3,490,000 B → 125,466 B (**96% 절감**).
 * 학생 한 명이 어느 화면을 열든 base 이미지 1장을 받는다 — 700 KB 가 31 KB 가 된다.
 *
 * 품질: q90 · alpha_q 100.
 *   - **알파 채널은 픽셀 단위로 완전히 동일**(최대 차이 0). 알파는 `_outfit` 합성과
 *     투명 배경을 좌우하므로 여기가 어긋나면 아바타가 깨진다 — 그래서 이 값을 고정한다.
 *   - 보이는 RGB 는 평균 차이 0.06~0.24/255, 최대 21~35(굵은 외곽선의 링잉).
 *     같은 설정으로 이미 87개 아이템이 돌고 있다.
 *
 * ⚠️ 이 스크립트는 **원본을 다시 만들지 않는다** — 포맷만 바꾼다.
 *    base 캐릭터의 재생성·후처리는 금지돼 있다(scripts/strip-base-bg.mjs 등은 과거 일회성).
 *
 * 사용: node scripts/convert-base-avatars-to-webp.mjs [--keep-png]
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "..", "public", "avatar-shop");

const TARGETS = [
  "base_male",
  "base_female",
  "base_male_outfit",
  "base_female_outfit",
  "editor_bald",
];

const keepPng = process.argv.includes("--keep-png");

try {
  execFileSync("cwebp", ["-version"], { stdio: "ignore" });
} catch {
  console.error("cwebp 가 없습니다.  brew install webp");
  process.exit(1);
}

let before = 0;
let after = 0;
let converted = 0;

for (const name of TARGETS) {
  const src = path.join(DIR, `${name}.png`);
  const dst = path.join(DIR, `${name}.webp`);

  if (!fs.existsSync(src)) {
    if (fs.existsSync(dst)) {
      console.log(`  · ${name}: 이미 webp — 건너뜀`);
      continue;
    }
    console.error(`  ✗ ${name}.png 없음`);
    process.exitCode = 1;
    continue;
  }

  execFileSync("cwebp", [
    "-quiet",
    "-q", "90",
    "-alpha_q", "100",
    "-m", "6",
    src,
    "-o", dst,
  ]);

  const b = fs.statSync(src).size;
  const a = fs.statSync(dst).size;
  before += b;
  after += a;
  converted++;
  console.log(
    `  ✓ ${name.padEnd(20)} ${String(b).padStart(8)} B → ${String(a).padStart(7)} B  (${(100 - (a / b) * 100).toFixed(0)}% ↓)`,
  );

  if (!keepPng) fs.unlinkSync(src);
}

if (converted > 0) {
  console.log(
    `\n합계 ${before.toLocaleString()} B → ${after.toLocaleString()} B ` +
      `(${(100 - (after / before) * 100).toFixed(1)}% 절감)` +
      (keepPng ? "\nPNG 는 --keep-png 로 보존했습니다." : "\nPNG 는 삭제했습니다(git 이력에 남아 있습니다)."),
  );
}
