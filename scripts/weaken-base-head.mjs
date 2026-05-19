#!/usr/bin/env node
/* eslint-disable */
/**
 * 베이스 캐릭터의 머리 영역(y < 35%) 검정 윤곽선·눈을 alpha 80으로 약화.
 * → hair PNG 장착 시 머리카락 사이로 베이스 검정선이 거의 안 비침.
 * → hair 미장착 시도 윤곽 보임 (약하게).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");

const HEAD_REGION_RATIO = 1.0;  // 전신 (긴 머리는 몸까지 덮으므로 몸 윤곽도 약화)
const DARK_RGB_THRESHOLD = 200; // RGB max < 200 → 짙은 픽셀 (검정/짙은 회색/짙은 갈색 다 포함)
const WEAKENED_ALPHA = 60;       // 24% 보임 (거의 안 보이지만 hair 미장착 인식 가능)

const FILES = ["editor_bald.png", "base_male.png", "base_female.png"];

async function process(file) {
  const filePath = path.join(DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file} 없음, skip`);
    return;
  }
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height;
  const out = Buffer.from(data);
  const headY = Math.floor(info.height * HEAD_REGION_RATIO);

  // RGB max < 200 인 짙은 픽셀의 alpha를 WEAKENED_ALPHA로 (이미 처리된 픽셀도 재처리)
  let weakened = 0;
  for (let i = 0; i < N; i++) {
    const a = out[i * 4 + 3];
    if (a === 0) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    const maxRGB = Math.max(r, g, b);
    if (maxRGB >= DARK_RGB_THRESHOLD) continue;
    const y = Math.floor(i / info.width);
    if (y >= headY) continue;
    out[i * 4 + 3] = Math.min(a, WEAKENED_ALPHA);
    weakened++;
  }
  if (weakened === 0) {
    console.log(`✅ ${file} 약화 대상 없음 (이미 처리됨?)`);
    return;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false, force: true })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  console.log(`✅ ${file} 머리 영역 검정선 ${weakened}px alpha=${WEAKENED_ALPHA}로 약화`);
}

for (const f of FILES) await process(f);
