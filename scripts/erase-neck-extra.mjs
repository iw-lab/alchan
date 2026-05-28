#!/usr/bin/env node
/* eslint-disable */
// 특정 outfit의 vertical 0~30% 영역 추가 alpha (목 칼라/넥라인 제거)
import sharp from "sharp";
import fs from "fs";
import path from "path";

const DIR = "/Users/iw-lab/Documents/dev/iwalchan/alchan/public/avatar-shop";
const TARGETS = [
  { file: "luxury_kpop_stage.png", ratio: 0.25 },
  { file: "luxury_dress_diamond.png", ratio: 0.32 },
];

async function erase(filePath, ratio) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.from(data);
  const eraseUntilY = Math.round(height * ratio);
  let cleared = 0;
  for (let y = 0; y < eraseUntilY; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] > 0) {
        out[i + 3] = 0;
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
  const cleared = await erase(fp, t.ratio);
  console.log(`✅ ${t.file} (ratio ${t.ratio}) ${cleared}px alpha`);
}
