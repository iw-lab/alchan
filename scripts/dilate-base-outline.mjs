#!/usr/bin/env node
/* eslint-disable */
/**
 * 베이스 캐릭터의 검정 외곽선/눈 동공을 1px morphological dilation.
 * 1024x1024 PNG가 화면 400x400으로 스케일다운 시 외곽선 2px → 0.8px이 되어
 * 점선/흐림처럼 보이는 문제 해결 (외곽선 3px로 강화).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const DARK_RGB_MAX = 100;  // RGB max < 100 → 검정 외곽선/동공
const FILES = ["editor_bald.png", "base_male.png", "base_female.png"];

async function processFile(file) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file} 없음`);
    return;
  }
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const out = Buffer.from(data);

  // 1단계: 검정 픽셀 마스크
  const darkMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a < 200) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    if (Math.max(r, g, b) < DARK_RGB_MAX) darkMask[i] = 1;
  }

  // 2단계: 1px dilation — darkMask의 4-neighbor도 검정으로
  const dilated = new Uint8Array(darkMask);
  for (let i = 0; i < N; i++) {
    if (!darkMask[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    if (x > 0) dilated[i - 1] = 1;
    if (x < W - 1) dilated[i + 1] = 1;
    if (y > 0) dilated[i - W] = 1;
    if (y < H - 1) dilated[i + W] = 1;
  }

  // 3단계: dilation으로 추가된 픽셀을 검정으로 칠하기
  let strengthened = 0;
  for (let i = 0; i < N; i++) {
    if (!dilated[i] || darkMask[i]) continue;
    const a = out[i * 4 + 3];
    if (a < 50) continue; // 캔버스 밖은 skip
    out[i * 4] = 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;
    strengthened++;
  }

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 외곽선 dilation ${strengthened}px 강화`);
}

for (const f of FILES) await processFile(f);
