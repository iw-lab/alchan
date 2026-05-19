#!/usr/bin/env node
/* eslint-disable */
/**
 * base_male.png를 복사해서 머리 영역의 검정 머리카락을 살색으로 칠해 대머리 만들기.
 * codex가 "BALD" 프롬프트를 흉상/벗은 캐릭터로 해석하는 문제 회피.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const SRC = path.join(DIR, "base_male.png");
const DST = path.join(DIR, "editor_bald.png");

const SKIN_R = 247, SKIN_G = 213, SKIN_B = 184; // 살색 (light beige)
const HAIR_MAX_RGB = 130; // RGB max < 130 = 검정/짙은 갈색 머리

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const N = info.width * info.height;
const W = info.width;
const out = Buffer.from(data);

const headEndY = Math.floor(info.height * 0.35);

// 1단계: 머리 영역(y<35%) 의 모든 검정/짙은 머리카락을 살색으로 (외곽선 포함)
let changedHair = 0;
for (let i = 0; i < N; i++) {
  const a = out[i * 4 + 3];
  if (a < 50) continue;
  const y = Math.floor(i / W);
  if (y >= headEndY) continue;
  const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
  if (Math.max(r, g, b) >= HAIR_MAX_RGB) continue;
  out[i * 4] = SKIN_R;
  out[i * 4 + 1] = SKIN_G;
  out[i * 4 + 2] = SKIN_B;
  changedHair++;
}

// 2단계: 머리 영역(y<headEndY+여유)의 boundary 픽셀(살색이지만 이웃 alpha=0)에 검정 외곽선 그리기
// 캔버스 가장자리 패딩 영역은 SKIP (검정 박스 회피)
const outlineRange = Math.floor(info.height * 0.38);
const CANVAS_MARGIN = 70; // 패딩 영역 안 건드림 (pad-base-avatars의 top=100, side=62)
const outlineMask = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const a = out[i * 4 + 3];
  if (a < 200) continue;
  const y = Math.floor(i / W);
  if (y >= outlineRange) continue;
  const x = i % W;
  if (x < CANVAS_MARGIN || x > W - CANVAS_MARGIN || y < CANVAS_MARGIN) continue;
  const neighborsToCheck = [];
  if (x > 0) neighborsToCheck.push(i - 1);
  if (x < W - 1) neighborsToCheck.push(i + 1);
  if (y > 0) neighborsToCheck.push(i - W);
  if (y < info.height - 1) neighborsToCheck.push(i + W);
  for (const ni of neighborsToCheck) {
    if (out[ni * 4 + 3] < 50) {
      outlineMask[i] = 1;
      break;
    }
  }
}
// dilation 1번: outlineMask의 이웃도 outline에 포함 (2px 두께)
const outlineMaskDilated = new Uint8Array(outlineMask);
for (let i = 0; i < N; i++) {
  if (!outlineMask[i]) continue;
  const x = i % W;
  const y = Math.floor(i / W);
  if (x > 0) outlineMaskDilated[i - 1] = 1;
  if (x < W - 1) outlineMaskDilated[i + 1] = 1;
  if (y > 0) outlineMaskDilated[i - W] = 1;
  if (y < info.height - 1) outlineMaskDilated[i + W] = 1;
}

let outlinePixels = 0;
for (let i = 0; i < N; i++) {
  if (!outlineMaskDilated[i]) continue;
  const y = Math.floor(i / W);
  if (y >= outlineRange) continue;
  out[i * 4] = 0;
  out[i * 4 + 1] = 0;
  out[i * 4 + 2] = 0;
  out[i * 4 + 3] = 255;
  outlinePixels++;
}
console.log(`  머리 ${changedHair}px 살색 변환, 외곽선 ${outlinePixels}px 검정 재그림`);

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(DST);
console.log(`✅ editor_bald.png 생성 (base_male 복사 + 머리 ${changedHair}px 살색 변환)`);
