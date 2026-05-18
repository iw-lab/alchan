#!/usr/bin/env node
/* eslint-disable */
/**
 * PNG에서 alpha=0인 픽셀의 RGB를 강제로 (255,255,255)로 설정.
 *
 * 문제: normalize 후 alpha=0 픽셀의 RGB가 (0,0,0) 검정으로 저장되어
 * 일부 렌더링 환경에서 검정으로 보임. 이걸 흰색으로 강제 변환하여
 * 어떤 환경에서도 alpha 0이 투명으로 보이게.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_", "luxury_"];

async function processFile(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const N = width * height;

  const out = Buffer.from(data);
  let fixed = 0;
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a === 0) {
      // alpha 0인 픽셀의 RGB를 강제로 (255,255,255)로
      if (out[i * 4] !== 255 || out[i * 4 + 1] !== 255 || out[i * 4 + 2] !== 255) {
        out[i * 4] = 255;
        out[i * 4 + 1] = 255;
        out[i * 4 + 2] = 255;
        fixed++;
      }
    }
  }

  if (fixed === 0) return { fixed: 0 };

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  return { fixed };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  let done = 0;
  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) continue;
    try {
      const result = await processFile(path.join(DIR, file));
      done++;
      if (result.fixed > 0) {
        console.log(`✅ ${file} (alpha0 RGB 흰색화: ${result.fixed}px)`);
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 ${done}개 검사 완료`);
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
