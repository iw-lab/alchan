#!/usr/bin/env node
/* eslint-disable */
/**
 * PNG의 큰 검정 사각형 영역을 alpha=0 + RGB 흰색으로 변환.
 *
 * 문제: sharp의 PNG 저장 시 premultiplied alpha 처리로 alpha=0 픽셀의 RGB가
 * 검정으로 변환되어 일부 환경에서 검은 사각형이 보임.
 *
 * 해결: connected component 분석으로 큰 검정 그룹(>3000px)만 투명화.
 * 작은 검정 그룹(머리카락 외곽선 등)은 보존.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const BLACK_THRESHOLD = 60;
const SIZE_THRESHOLD = 200;
const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_", "luxury_", "editor_"];

// 검정/짙은 색상 콘텐츠를 일부러 그린 아이템 — connected-component 제거 skip,
// Step 0 안티앨리어싱 정리만 적용 (외곽 정리는 유지하되 본체 보호)
const BLACK_CONTENT_ALLOWLIST = new Set([
  "hair_bun_black.png",
  "hair_messy_male.png",
  "hair_undercut_male.png",
  "hair_slick_back_male.png",
  "hair_ponytail_brown.png",
  "hair_long_wavy_brown.png",
  "hair_short_brown.png",
  "hat_graduation.png",
  "glasses_eyepatch.png", // 검정 oval 본체
  "glasses_round_black.png", // 검정 외곽선
  "glasses_mask_medic.png", // 검정 외곽선
]);

function isBlack(r, g, b) {
  return r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD;
}

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  const skipBlackComponent = BLACK_CONTENT_ALLOWLIST.has(fileName);
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const N = width * height;
  const out = Buffer.from(data);

  // Step 0: 외곽 노이즈/안티-앨리어싱 정리 (공격적)
  // alpha < 255인 모든 픽셀 + RGB < 150 (어두운 톤) → alpha 0
  // 즉 부분 투명 + 어두운 외곽 가장자리 깨끗 제거
  let antiAliasCleared = 0;
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a > 0 && a < 255) {
      const r = out[i * 4];
      const g = out[i * 4 + 1];
      const b = out[i * 4 + 2];
      if (r < 150 && g < 150 && b < 150) {
        out[i * 4] = 255;
        out[i * 4 + 1] = 255;
        out[i * 4 + 2] = 255;
        out[i * 4 + 3] = 0;
        antiAliasCleared++;
      }
    }
  }

  // 검정 콘텐츠 의도 아이템은 connected-component 단계 skip
  if (skipBlackComponent) {
    if (antiAliasCleared === 0) return { cleared: 0, antiAliasCleared: 0 };
    await sharp(out, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9, palette: false, force: true })
      .toFile(filePath + ".tmp");
    fs.renameSync(filePath + ".tmp", filePath);
    return { cleared: 0, antiAliasCleared };
  }

  // 검정 + opaque 픽셀 마크
  const isBlackArr = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 100) continue;
    const r = out[i * 4];
    const g = out[i * 4 + 1];
    const b = out[i * 4 + 2];
    if (isBlack(r, g, b)) isBlackArr[i] = 1;
  }

  // Connected component
  const groupId = new Int32Array(N);
  let nextGroupId = 0;
  const groupSizes = [0];

  for (let i = 0; i < N; i++) {
    if (!isBlackArr[i] || groupId[i]) continue;
    nextGroupId++;
    let size = 0;
    const queue = [i];
    groupId[i] = nextGroupId;
    while (queue.length) {
      const idx = queue.pop();
      size++;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      for (const ni of neighbors) {
        if (!groupId[ni] && isBlackArr[ni]) {
          groupId[ni] = nextGroupId;
          queue.push(ni);
        }
      }
    }
    groupSizes.push(size);
  }

  // 큰 검정 그룹 (>=SIZE_THRESHOLD) → alpha=0 + RGB 흰색
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const g = groupId[i];
    if (!g) continue;
    if (groupSizes[g] >= SIZE_THRESHOLD) {
      out[i * 4] = 255;
      out[i * 4 + 1] = 255;
      out[i * 4 + 2] = 255;
      out[i * 4 + 3] = 0;
      cleared++;
    }
  }

  const totalChanged = cleared + antiAliasCleared;
  if (totalChanged === 0) return { cleared: 0, antiAliasCleared: 0 };

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  return { cleared, antiAliasCleared };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) continue;
    try {
      const result = await processFile(path.join(DIR, file));
      if (result.cleared > 0 || result.antiAliasCleared > 0) {
        console.log(`✅ ${file} (검정 ${result.cleared}px + 안티앨리어스 ${result.antiAliasCleared}px)`);
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
