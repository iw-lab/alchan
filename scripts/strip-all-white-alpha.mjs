#!/usr/bin/env node
/* eslint-disable */
/**
 * PNG의 모든 흰 픽셀을 alpha=0(투명)으로 변환
 *
 * strip-white-bg.mjs는 외곽 flood-fill만 처리 (안쪽 흰 영역은 그대로).
 * 이 스크립트는 **모든** 흰 픽셀(전체 PNG)을 일괄 alpha 0 처리.
 * 머리카락 안쪽 빈공간 + 외곽 흰 padding 모두 투명화.
 *
 * 사용:
 *   node scripts/strip-all-white-alpha.mjs --slot=hair
 *   node scripts/strip-all-white-alpha.mjs  # 헤어/모자/안경/의상/이펙트
 *
 * 단점: PNG 콘텐츠 내 흰 highlight도 사라짐 (대부분 영향 미미).
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v === undefined ? true : v;
  return acc;
}, {});

const ONLY_SLOT = args.slot || null;
const WHITE_THRESHOLD = 240;

// 처리 대상 prefix
const TARGET_PREFIXES = ["hair_", "hat_", "glasses_", "outfit_", "effect_"];

async function processFile(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    const r = out[idx];
    const g = out[idx + 1];
    const b = out[idx + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      out[idx + 3] = 0; // alpha = 0
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  let done = 0;
  let skipped = 0;

  for (const file of files) {
    const matched = TARGET_PREFIXES.some((p) => file.startsWith(p));
    if (!matched) {
      skipped++;
      continue;
    }
    if (ONLY_SLOT) {
      const expected = ONLY_SLOT + "_";
      if (!file.startsWith(expected)) {
        skipped++;
        continue;
      }
    }
    try {
      const start = Date.now();
      await processFile(path.join(DIR, file));
      done++;
      console.log(`✅ ${file} (${Date.now() - start}ms · ${done})`);
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 ${done}개 처리, ${skipped}개 건너뜀`);
}

main().catch((err) => {
  console.error("💥", err);
  process.exit(1);
});
