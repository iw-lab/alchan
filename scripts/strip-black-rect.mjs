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

const BLACK_THRESHOLD = 30;
const SIZE_THRESHOLD = 5000;
const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_", "luxury_"];

function isBlack(r, g, b) {
  return r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD;
}

async function processFile(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const N = width * height;
  const out = Buffer.from(data);

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

  if (cleared === 0) return { cleared: 0 };

  // PNG 저장 (premultiplied 알파 회피 - effort 6, palette false)
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  return { cleared };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) continue;
    try {
      const result = await processFile(path.join(DIR, file));
      if (result.cleared > 0) {
        console.log(`✅ ${file} (검은 사각형 제거: ${result.cleared}px)`);
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
