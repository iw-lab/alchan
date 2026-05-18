#!/usr/bin/env node
/* eslint-disable */
/**
 * 스마트 흰색 제거 - connected component 기반
 *
 * 1. 모든 흰 픽셀을 connected component로 그룹화
 * 2. 외곽 모서리와 연결된 그룹 → alpha=0 (배경)
 * 3. 큰 흰 그룹 (>= SIZE_THRESHOLD 픽셀) → alpha=0 (빈공간, 예: 이마)
 * 4. 작은 흰 그룹 (< SIZE_THRESHOLD) → 보존 (머리카락 내 highlight/sparkle)
 *
 * 결과: 머리카락 디테일 보존 + 외곽/큰 빈공간만 투명.
 *
 * 다음으로 normalize-hair-position.mjs를 돌려 표준 위치 padding.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const WHITE_THRESHOLD = 240;
const SIZE_THRESHOLD = 3000; // 이보다 큰 흰 그룹은 배경/빈공간으로 간주

const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_"];

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v === undefined ? true : v;
  return acc;
}, {});

function isWhite(r, g, b) {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

async function processFile(filePath) {
  const img = sharp(filePath).removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const N = width * height;

  // RGBA 출력 버퍼
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    out[i * 4] = data[i * channels];
    out[i * 4 + 1] = data[i * channels + 1];
    out[i * 4 + 2] = data[i * channels + 2];
    out[i * 4 + 3] = 255;
  }

  // 흰 픽셀 마크
  const isWhiteArr = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = out[i * 4];
    const g = out[i * 4 + 1];
    const b = out[i * 4 + 2];
    if (isWhite(r, g, b)) isWhiteArr[i] = 1;
  }

  // Connected component (4-방향) BFS
  const groupId = new Int32Array(N); // 0 = 미방문, >0 = 그룹 ID
  let nextGroupId = 0;
  const groupSizes = [0]; // index 0 dummy
  const groupTouchesEdge = [false];

  for (let i = 0; i < N; i++) {
    if (!isWhiteArr[i] || groupId[i]) continue;
    nextGroupId++;
    let size = 0;
    let touchesEdge = false;
    const queue = [i];
    groupId[i] = nextGroupId;
    while (queue.length) {
      const idx = queue.pop();
      size++;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      // 4-방향
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      for (const ni of neighbors) {
        if (!groupId[ni] && isWhiteArr[ni]) {
          groupId[ni] = nextGroupId;
          queue.push(ni);
        }
      }
    }
    groupSizes.push(size);
    groupTouchesEdge.push(touchesEdge);
  }

  // 각 그룹 판정 + alpha 적용
  for (let i = 0; i < N; i++) {
    const g = groupId[i];
    if (!g) continue; // 흰색 아님
    const size = groupSizes[g];
    const edge = groupTouchesEdge[g];
    // 외곽 연결 또는 큰 그룹 → 투명
    if (edge || size >= SIZE_THRESHOLD) {
      out[i * 4 + 3] = 0;
    }
    // 작은 isolated 흰 그룹 (highlight/sparkle) → 보존
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);

  // 통계
  let groupsRemoved = 0;
  let groupsKept = 0;
  for (let g = 1; g <= nextGroupId; g++) {
    if (groupTouchesEdge[g] || groupSizes[g] >= SIZE_THRESHOLD) groupsRemoved++;
    else groupsKept++;
  }
  return { groupsRemoved, groupsKept };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  let done = 0;
  let skipped = 0;
  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) { skipped++; continue; }
    try {
      const start = Date.now();
      const stats = await processFile(path.join(DIR, file));
      done++;
      console.log(`✅ ${file} (${Date.now() - start}ms · 제거 ${stats.groupsRemoved}그룹, 보존 ${stats.groupsKept}그룹)`);
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 ${done}개 처리, ${skipped}개 건너뜀`);
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
