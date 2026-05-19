#!/usr/bin/env node
/* eslint-disable */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

// 캐릭터 콘텐츠 88%로 축소, 위쪽 100px / 좌우 62px 패딩 추가 (1024x1024 유지)
const TARGET = 900;
const TOP_PAD = 100;
const SIDE_PAD = 62;

const FILES = ["editor_bald.png", "base_male.png", "base_female.png"];

async function process(file) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file} 없음, skip`);
    return;
  }
  // 백업 (한 번만)
  const bak = filePath + ".pre-pad.bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(filePath, bak);

  const resized = await sharp(bak).resize(TARGET, TARGET, { fit: "inside" }).toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } }
  })
    .composite([{ input: resized, top: TOP_PAD, left: SIDE_PAD }])
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 패딩 추가 (top=${TOP_PAD}px, side=${SIDE_PAD}px, content=${TARGET}px)`);
}

for (const f of FILES) await process(f);
