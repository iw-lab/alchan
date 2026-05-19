#!/usr/bin/env node
/* eslint-disable */
/**
 * 동공만 살짝 선명하게 — 작은 검정 connected component (< 500px)만 1px dilation.
 * 큰 component(외곽선)는 보존 → 자연스러운 캐릭터.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const DARK_RGB_MAX = 50;     // 매우 검정 (동공)
const PUPIL_SIZE_MAX = 500;   // 동공으로 간주할 component 최대 크기
const FILES = ["editor_bald.png", "base_male.png", "base_female.png"];

async function processFile(file) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) return;
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const out = Buffer.from(data);

  // 검정 픽셀 마스크
  const darkMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 200) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    if (Math.max(r, g, b) < DARK_RGB_MAX) darkMask[i] = 1;
  }

  // connected component (4-neighbor)
  const groupId = new Int32Array(N);
  const groupSizes = [0];
  let nextGroup = 0;
  for (let i = 0; i < N; i++) {
    if (!darkMask[i] || groupId[i]) continue;
    nextGroup++;
    let size = 0;
    const stack = [i];
    groupId[i] = nextGroup;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const x = idx % W, y = Math.floor(idx / W);
      const ns = [];
      if (x > 0) ns.push(idx - 1);
      if (x < W - 1) ns.push(idx + 1);
      if (y > 0) ns.push(idx - W);
      if (y < H - 1) ns.push(idx + W);
      for (const ni of ns) {
        if (darkMask[ni] && !groupId[ni]) {
          groupId[ni] = nextGroup;
          stack.push(ni);
        }
      }
    }
    groupSizes.push(size);
  }

  // 작은 component (동공) 픽셀만 1px dilate → 동공 두꺼워짐
  const pupilMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const g = groupId[i];
    if (g && groupSizes[g] <= PUPIL_SIZE_MAX) pupilMask[i] = 1;
  }
  let strengthened = 0;
  for (let i = 0; i < N; i++) {
    if (!pupilMask[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    const ns = [];
    if (x > 0) ns.push(i - 1);
    if (x < W - 1) ns.push(i + 1);
    if (y > 0) ns.push(i - W);
    if (y < H - 1) ns.push(i + W);
    for (const ni of ns) {
      if (pupilMask[ni]) continue;
      const a = out[ni * 4 + 3];
      if (a < 50) continue;
      // 흰자/살색 이웃을 검정으로 (동공 확장)
      out[ni * 4] = 0;
      out[ni * 4 + 1] = 0;
      out[ni * 4 + 2] = 0;
      out[ni * 4 + 3] = 255;
      strengthened++;
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 동공 dilate ${strengthened}px (외곽선 보존)`);
}

for (const f of FILES) await processFile(f);
