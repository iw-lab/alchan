#!/usr/bin/env node
/* eslint-disable */
/**
 * PNG 흰 배경 제거 - 가장자리부터 flood-fill 방식
 *
 * 모서리 4곳에서 시작해서 인접 흰 픽셀들을 알파=0으로 변환.
 * 본체 안의 흰색은 보존됨.
 *
 * 사용:
 *   node scripts/strip-white-bg.mjs                  # 전체 처리
 *   node scripts/strip-white-bg.mjs --skip=preset_   # 프리셋 제외 (배경 포함 컷)
 *   node scripts/strip-white-bg.mjs --skip=bg_       # 배경 카테고리 제외
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIR = path.resolve(__dirname, "../public/avatar-shop");
const args = process.argv.slice(2);
const skipPatterns = args
  .filter((a) => a.startsWith("--skip="))
  .map((a) => a.replace("--skip=", ""));
// --only=id1,id2 : 지정한 파일만 처리 (base 등 보호 파일 안전)
const onlyPatterns = args
  .filter((a) => a.startsWith("--only="))
  .flatMap((a) => a.replace("--only=", "").split(","))
  .filter(Boolean);

// 흰색 판정 (각 RGB 채널이 threshold 이상)
const WHITE_THRESHOLD = 240;

function isNearWhite(r, g, b) {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

async function stripFile(filePath) {
  const img = sharp(filePath).removeAlpha();
  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // RGBA 버퍼 만들기
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * channels;
    const dstIdx = i * 4;
    rgba[dstIdx] = data[srcIdx];
    rgba[dstIdx + 1] = data[srcIdx + 1];
    rgba[dstIdx + 2] = data[srcIdx + 2];
    rgba[dstIdx + 3] = 255;
  }

  // BFS flood-fill from edges
  const visited = new Uint8Array(width * height);
  const queue = [];

  // 모든 가장자리 픽셀을 시드로
  for (let x = 0; x < width; x++) {
    queue.push([x, 0]);
    queue.push([x, height - 1]);
  }
  for (let y = 0; y < height; y++) {
    queue.push([0, y]);
    queue.push([width - 1, y]);
  }

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const rgbaIdx = idx * 4;
    const r = rgba[rgbaIdx];
    const g = rgba[rgbaIdx + 1];
    const b = rgba[rgbaIdx + 2];
    if (!isNearWhite(r, g, b)) continue;
    // 알파를 0으로
    rgba[rgbaIdx + 3] = 0;
    // 4-방향 인접 픽셀 추가
    queue.push([x + 1, y]);
    queue.push([x - 1, y]);
    queue.push([x, y + 1]);
    queue.push([x, y - 1]);
  }

  await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  console.log(`📂 ${DIR}`);
  console.log(`🎯 ${files.length}개 PNG 처리 시작`);

  let done = 0;
  let skipped = 0;
  for (const file of files) {
    // only 패턴 (지정 시 그 외 전부 건너뜀)
    if (onlyPatterns.length > 0) {
      const base = file.replace(/\.png$/, "");
      const match = onlyPatterns.some((p) => base === p || file === p);
      if (!match) {
        skipped++;
        continue;
      }
    }
    // skip 패턴 검사
    const skip = skipPatterns.some((p) => file.startsWith(p));
    if (skip) {
      skipped++;
      console.log(`⏭️  ${file} 건너뜀`);
      continue;
    }
    try {
      const start = Date.now();
      await stripFile(path.join(DIR, file));
      const ms = Date.now() - start;
      done++;
      console.log(`✅ ${file} (${ms}ms · ${done}/${files.length - skipped})`);
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 완료: ${done}개 처리, ${skipped}개 건너뜀`);
}

main().catch((err) => {
  console.error("💥", err);
  process.exit(1);
});
