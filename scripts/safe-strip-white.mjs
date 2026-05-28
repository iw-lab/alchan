#!/usr/bin/env node
/* eslint-disable */
/**
 * 안전한 PNG 흰 배경 제거
 *
 * 1. 외곽에서 BFS flood-fill → alpha 0 (PNG 외곽 흰 영역)
 * 2. 머리카락 안쪽 빈공간(작은 isolated 흰 그룹) 중 큰 그룹(>3000px) alpha 0
 * 3. 작은 isolated 흰 그룹(highlight)은 보존
 * 4. sharp PNG 저장 시 premultiplied 회피 옵션 + alpha 0 픽셀 RGB는 흰색으로 강제 보존
 *
 * 이전 smart-strip-white의 문제: sharp save 시 alpha 0 픽셀 RGB가 검정으로 변환됨
 * 해결: PNG 디코드 시 raw 채널 4로 받고, save 시 동일 채널 4로 명시
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const WHITE_THRESHOLD = 240;
const SIZE_THRESHOLD = 3000;
const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_", "luxury_"];
// 흰색이 본체인 자산 — strip 대상에서 제외 (본체까지 alpha 처리되어 사라짐)
const WHITE_CONTENT_PROTECT = new Set([
  "hat_chef.png",
  "hat_beanie_yellow.png", // 흰 줄무늬 패턴이 본체 일부
  "glasses_mask_medic.png", // 흰 마스크 본체
  "glasses_aviator.png", // 안쪽 흰 outline 외곽
  "glasses_round_black.png", // 렌즈 안쪽 흰 영역
  "glasses_eyepatch.png",
  "outfit_astronaut.png", // 흰 우주복 본체
  "outfit_chef.png", // 흰 셰프복
  "outfit_doctor.png", // 흰 의사 가운
  "luxury_dress_diamond.png", // 흰/은 다이아 드레스
  "luxury_fur_coat.png", // 흰 fur coat
  "luxury_athletic_set.png", // 흰 옷 가능성
  "luxury_kpop_stage.png", // 흰 + 보석 stage 의상
]);

function isWhite(r, g, b) {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

async function processFile(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected 4 channels, got ${channels}`);
  }
  const N = width * height;
  const out = Buffer.from(data);

  // Step 1: 흰 픽셀 마크 (alpha > 100인 픽셀 중)
  const isWhiteArr = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 100) continue;
    const r = out[i * 4];
    const g = out[i * 4 + 1];
    const b = out[i * 4 + 2];
    if (isWhite(r, g, b)) isWhiteArr[i] = 1;
  }

  // Step 2: connected component 분석
  const groupId = new Int32Array(N);
  let nextGroupId = 0;
  const groupSizes = [0];
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

  // Step 3: 외곽 연결 + 큰 그룹 → alpha 0, RGB 흰색 유지
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const g = groupId[i];
    if (!g) continue;
    if (groupTouchesEdge[g] || groupSizes[g] >= SIZE_THRESHOLD) {
      // 명시적으로 흰색 RGB + alpha 0 (premultiplied 회피)
      out[i * 4] = 255;
      out[i * 4 + 1] = 255;
      out[i * 4 + 2] = 255;
      out[i * 4 + 3] = 0;
      cleared++;
    }
  }

  // Step 4: PNG 저장 (premultiplied 회피 옵션)
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false, force: true, progressive: false })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);

  return { cleared, groups: nextGroupId };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  let done = 0;
  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) continue;
    if (WHITE_CONTENT_PROTECT.has(file)) {
      console.log(`⏭  ${file} skip (흰 본체 보호)`);
      continue;
    }
    try {
      const result = await processFile(path.join(DIR, file));
      done++;
      console.log(`✅ ${file} (${result.cleared}px alpha 처리, ${result.groups} 그룹)`);
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 ${done}개 처리`);
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
