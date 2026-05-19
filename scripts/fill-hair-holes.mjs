#!/usr/bin/env node
/* eslint-disable */
/**
 * hair PNG의 alpha=0 내부 hole을 머리카락 평균 색상으로 채워
 * 베이스 캐릭터가 머리카락 사이로 비치는 현상 제거.
 *
 * 알고리즘:
 * 1. alpha=0 영역의 connected component 분석
 * 2. 캔버스 외곽(첫/끝 row/col)에 닿는 component = 외부 배경 (보존)
 * 3. 외곽에 안 닿는 component = 내부 hole → 머리카락 평균 색으로 채우기 (alpha=255)
 *
 * 양 갈래 머리 사이 같이 외부에 connected된 alpha=0은 보존 — 얼굴은 그대로 보임.
 * 머리카락 가닥 사이 작은 hole만 메워짐.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

// 처리할 hair 목록 (사용자가 비침 지적한 PNG들)
const TARGETS = [
  "hair_slick_back_male.png",
  "hair_long_wavy_brown.png",
  "hair_ponytail_brown.png",
  "hair_messy_male.png",
  "hair_undercut_male.png",
  "hair_silver_long.png",
  "hair_short_brown.png",
];

async function processFile(file) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ ${file} 없음, skip`);
    return;
  }
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const out = Buffer.from(data);

  // 1단계: alpha=0 마스크 + 머리카락 색 평균
  const alpha0 = new Uint8Array(N);
  let hairR = 0, hairG = 0, hairB = 0, hairCount = 0;
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 50) {
      alpha0[i] = 1;
    } else if (a > 200) {
      const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
      // 외곽 검정 라인은 제외 (RGB max > 80)
      if (Math.max(r, g, b) > 80) {
        hairR += r; hairG += g; hairB += b; hairCount++;
      }
    }
  }
  if (hairCount === 0) {
    console.log(`⚠️ ${file} 머리카락 색 추출 실패`);
    return;
  }
  hairR = Math.round(hairR / hairCount);
  hairG = Math.round(hairG / hairCount);
  hairB = Math.round(hairB / hairCount);

  // 2단계: BFS from canvas edges → 외부 alpha=0 component 마킹
  const isExternal = new Uint8Array(N);
  const queue = [];
  for (let x = 0; x < W; x++) {
    if (alpha0[x]) { isExternal[x] = 1; queue.push(x); }
    const bot = (H - 1) * W + x;
    if (alpha0[bot]) { isExternal[bot] = 1; queue.push(bot); }
  }
  for (let y = 0; y < H; y++) {
    const left = y * W;
    if (alpha0[left]) { isExternal[left] = 1; queue.push(left); }
    const right = y * W + W - 1;
    if (alpha0[right]) { isExternal[right] = 1; queue.push(right); }
  }
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % W;
    const y = Math.floor(idx / W);
    const neighbors = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < W - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - W);
    if (y < H - 1) neighbors.push(idx + W);
    for (const ni of neighbors) {
      if (alpha0[ni] && !isExternal[ni]) {
        isExternal[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // 3단계: 내부 hole = alpha0 && !isExternal → 머리카락 평균 색으로 채움
  let filled = 0;
  for (let i = 0; i < N; i++) {
    if (alpha0[i] && !isExternal[i]) {
      out[i * 4] = hairR;
      out[i * 4 + 1] = hairG;
      out[i * 4 + 2] = hairB;
      out[i * 4 + 3] = 255;
      filled++;
    }
  }
  if (filled === 0) {
    console.log(`✓ ${file} 내부 hole 없음`);
    return;
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 내부 hole ${filled}px 채움 (색 ${hairR},${hairG},${hairB})`);
}

for (const f of TARGETS) await processFile(f);
