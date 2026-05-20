#!/usr/bin/env node
/* eslint-disable */
/**
 * outfit/luxury PNG 상단 (목·옷깃 위) 영역을 alpha=0 으로 — base 캐릭터의 목이 자연스럽게 보이도록.
 * 사용자 명시: "목부분은 투명하게 해야지 자연스럽겠네"
 *
 * 처리 영역: 위쪽 ratio (default 0.18 = PNG 높이의 18%)
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const NECK_TOP_RATIO = 0.18; // PNG 높이 상단 18%까지 투명

const TARGETS = fs
  .readdirSync(DIR)
  .filter((f) => /^(outfit_|luxury_).*\.png$/.test(f));

for (const file of TARGETS) {
  const filePath = path.join(DIR, file);
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const cutoff = Math.floor(H * NECK_TOP_RATIO);
  const out = Buffer.from(data);
  let cleared = 0;
  for (let y = 0; y < cutoff; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (out[i + 3] > 0) {
        out[i + 3] = 0;
        cleared++;
      }
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 상단 ${(NECK_TOP_RATIO * 100).toFixed(0)}% (${cleared}px) 투명화`);
}
