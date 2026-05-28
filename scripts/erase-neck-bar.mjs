#!/usr/bin/env node
/* eslint-disable */
// 목 영역(vertical 25-35%) 중앙(horizontal 35-65%)의 흰색 픽셀만 alpha 처리
// "흰색 카라/바" 제거 — outfit 본체는 보존
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const TARGETS = [
  // [파일명, top%, bottom%, left%, right%, white_threshold]
  { file: "outfit_school.png",      top: 0.25, bottom: 0.36, left: 0.40, right: 0.60, thresh: 230 },
  { file: "luxury_hanbok_gold.png", top: 0.25, bottom: 0.36, left: 0.40, right: 0.60, thresh: 230 },
  { file: "luxury_kpop_stage.png",  top: 0.25, bottom: 0.36, left: 0.40, right: 0.60, thresh: 230 },
  { file: "outfit_astronaut.png",   top: 0.25, bottom: 0.36, left: 0.40, right: 0.60, thresh: 220 },
];

async function eraseRect(filePath, top, bottom, left, right, thresh) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.from(data);
  const y0 = Math.round(height * top);
  const y1 = Math.round(height * bottom);
  const x0 = Math.round(width * left);
  const x1 = Math.round(width * right);
  let cleared = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = out[i], g = out[i+1], b = out[i+2], a = out[i+3];
      if (a > 0 && r >= thresh && g >= thresh && b >= thresh) {
        out[i+3] = 0;
        cleared++;
      }
    }
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  return cleared;
}

for (const t of TARGETS) {
  const fp = path.join(DIR, t.file);
  if (!fs.existsSync(fp)) { console.log(`⏭  ${t.file} (없음)`); continue; }
  const cleared = await eraseRect(fp, t.top, t.bottom, t.left, t.right, t.thresh);
  console.log(`✅ ${t.file}: ${cleared}px 목 흰색 alpha`);
}
