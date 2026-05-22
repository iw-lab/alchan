#!/usr/bin/env node
/* eslint-disable */
/**
 * base_male / base_female / editor_bald PNG의 캐릭터 외부 연한 배경(흰/연파랑) 알파 처리.
 *
 * 안전 동작:
 * 1. 원본을 .bak.png로 백업 (이미 백업 있으면 skip)
 * 2. 외곽 BFS flood-fill — 가장자리부터 연결된 연한 색 픽셀만 alpha=0
 *    → 캐릭터 *내부*의 흰색(눈자위·셔츠 등)은 절대 안 건드림
 * 3. 임계: RGB 모두 >= 210 (연한 파랑/흰색 포함) AND 살색·검정·짙은 색 제외
 *
 * 사용: node scripts/strip-base-bg.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");
const TARGETS = ["base_male", "base_female", "editor_bald"];
const BG_THRESHOLD = 210;

const isLightBg = (r, g, b) => r >= BG_THRESHOLD && g >= BG_THRESHOLD && b >= BG_THRESHOLD;

async function processFile(name) {
  const filePath = path.join(DIR, `${name}.png`);
  const bakPath = path.join(DIR, `${name}.bak.png`);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${name}.png 없음 — skip`);
    return;
  }
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(filePath, bakPath);
    console.log(`💾 ${name}.bak.png 백업 생성`);
  }

  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`channels != 4`);
  const N = width * height;
  const out = Buffer.from(data);

  // 1. 연한 색 + alpha>50 픽셀 마크
  const lightMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 50) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    if (isLightBg(r, g, b)) lightMask[i] = 1;
  }

  // 2. connected component (4-neighbor BFS)
  const groupId = new Int32Array(N);
  const groupSizes = [0];
  let nextGroup = 0;
  for (let i = 0; i < N; i++) {
    if (!lightMask[i] || groupId[i]) continue;
    nextGroup++;
    let size = 0;
    const stack = [i];
    groupId[i] = nextGroup;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const x = idx % width;
      const y = (idx - x) / width;
      const ns = [];
      if (x > 0) ns.push(idx - 1);
      if (x < width - 1) ns.push(idx + 1);
      if (y > 0) ns.push(idx - width);
      if (y < height - 1) ns.push(idx + width);
      for (const ni of ns) {
        if (lightMask[ni] && !groupId[ni]) {
          groupId[ni] = nextGroup;
          stack.push(ni);
        }
      }
    }
    groupSizes.push(size);
  }

  // 3. 가장 큰 그룹의 50% 이상 크기 그룹은 모두 *배경*으로 판정 → alpha 0
  // (작은 그룹 = 캐릭터 내부 흰 영역 — 눈자위, 셔츠 등 — 은 보존)
  const maxSize = groupSizes.reduce((m, s) => Math.max(m, s), 0);
  const STRIP_THRESHOLD = Math.max(maxSize * 0.5, 30000);
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const g = groupId[i];
    if (g && groupSizes[g] >= STRIP_THRESHOLD) {
      out[i * 4 + 3] = 0;
      cleared++;
    }
  }
  console.log(`   component ${nextGroup}개, max=${maxSize}, threshold=${STRIP_THRESHOLD}`);

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${name}.png — 외곽 배경 ${cleared}px 알파 처리`);
}

(async () => {
  for (const t of TARGETS) await processFile(t);
  console.log("\n✨ 완료. 결과 확인 후 문제 있으면 .bak.png로 복원.");
})();
