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
const out = Buffer.from(data);

// 머리 영역 = canvas 위쪽 0~35% (옆머리까지 포함)
const headEndY = Math.floor(info.height * 0.35);

let changedHair = 0;
for (let i = 0; i < N; i++) {
  const a = out[i * 4 + 3];
  if (a < 50) continue;
  const y = Math.floor(i / info.width);
  if (y >= headEndY) continue;
  const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
  const maxRGB = Math.max(r, g, b);
  if (maxRGB >= HAIR_MAX_RGB) continue;
  // 검은 머리카락 → 살색으로 변환 (alpha는 유지)
  out[i * 4] = SKIN_R;
  out[i * 4 + 1] = SKIN_G;
  out[i * 4 + 2] = SKIN_B;
  changedHair++;
}

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(DST);
console.log(`✅ editor_bald.png 생성 (base_male 복사 + 머리 ${changedHair}px 살색 변환)`);
