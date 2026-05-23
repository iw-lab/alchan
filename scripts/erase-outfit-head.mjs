#!/usr/bin/env node
/* eslint-disable */
/**
 * outfit/luxury PNG의 vertical 0~27% (머리/얼굴 영역) 강제 알파.
 * base 캐릭터의 머리가 그 위에 보이도록.
 *
 * 사용: node scripts/erase-outfit-head.mjs
 *       node scripts/erase-outfit-head.mjs --id=outfit_chef
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");
const ERASE_RATIO = 0.30;

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.split("=");
  acc[k.replace(/^--/, "")] = v === undefined ? true : v;
  return acc;
}, {});

async function eraseHead(filePath) {
  const name = path.basename(filePath, ".png");
  const bakPath = path.join(DIR, `${name}.head-bak.png`);
  if (!fs.existsSync(bakPath)) fs.copyFileSync(filePath, bakPath);

  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error("channels != 4");

  const eraseUntilY = Math.round(height * ERASE_RATIO);
  const out = Buffer.from(data);
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
  console.log(`✅ ${name} — 머리 영역 ${cleared}px 알파 (0~${eraseUntilY}px)`);
}

(async () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^(outfit|luxury)_.+\.png$/.test(f) && !f.endsWith(".bak.png") && !f.endsWith(".head-bak.png"));
  const filtered = args.id ? files.filter((f) => f === `${args.id}.png`) : files;
  if (filtered.length === 0) {
    console.log("⚠️  대상 파일 없음");
    return;
  }
  console.log(`🧹 ${filtered.length}개 outfit PNG 머리 영역 알파 처리...`);
  for (const f of filtered) {
    await eraseHead(path.join(DIR, f));
  }
  console.log("\n✨ 완료");
})();
