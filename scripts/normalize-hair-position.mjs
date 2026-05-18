#!/usr/bin/env node
/* eslint-disable */
/**
 * 헤어/모자/안경/의상 PNG 콘텐츠 위치 표준화
 *
 * 각 PNG의 콘텐츠(non-white, non-transparent) bounding box를 자동 추출하고,
 * 1024×1024 캔버스의 표준 위치에 맞춰 padding을 재구성한다.
 *
 * 표준 위치 (베이스 캐릭터 머리 영역 기준):
 *   hair:    콘텐츠 중심 (50%, 40%) - 머리 전체 영역 (정수리~목)
 *            콘텐츠 높이 = canvas의 60%
 *   hat:     콘텐츠 중심 (50%, 22%) - 머리 최상단
 *            콘텐츠 높이 = canvas의 30%
 *   glasses: 콘텐츠 중심 (50%, 44%) - 눈 부분
 *            콘텐츠 높이 = canvas의 15%
 *   outfit:  콘텐츠 중심 (50%, 75%) - 어깨~상체
 *            콘텐츠 높이 = canvas의 40%
 *   effect:  변경 없음 (전체 frame 사용)
 *
 * 사용:
 *   node scripts/normalize-hair-position.mjs              # 전체
 *   node scripts/normalize-hair-position.mjs --slot=hair  # 특정 슬롯만
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
const CANVAS_SIZE = 1024;

// 슬롯별 표준 위치 (콘텐츠 중심 cx, cy + 콘텐츠 높이 비율 contentHeightRatio)
// cx, cy는 캔버스 백분율 (0~1)
// contentHeightRatio: 콘텐츠 높이를 캔버스 높이의 몇 %로 채울지
// 베이스 캐릭터 표준 위치 (대머리 chibi):
//   정수리 ~22%, 눈 ~44%, 입 ~56%, 어깨 ~85%
//   머리 영역(정수리~귀 끝): y = 15%~45%, 폭 ≈ 50%
// 헤어는 이 머리 영역만 덮어야 하고, 얼굴(y=44%~58%)을 침범하지 않아야 함.
const SLOT_LAYOUT = {
  // 헤어: 정수리~이마 위까지, 폭은 머리 양옆 살짝 넘어가게
  hair:    { cx: 0.5, cy: 0.30, contentHeightRatio: 0.40, prefix: "hair_" },
  // 모자: 정수리에 얹힘
  hat:     { cx: 0.5, cy: 0.18, contentHeightRatio: 0.25, prefix: "hat_" },
  // 안경: 눈 위치
  glasses: { cx: 0.5, cy: 0.44, contentHeightRatio: 0.14, prefix: "glasses_" },
  // 의상: 어깨~상체
  outfit:  { cx: 0.5, cy: 0.82, contentHeightRatio: 0.36, prefix: "outfit_" },
};

// 비-흰색 픽셀 판정
const WHITE_THRESHOLD = 245;
function isContent(r, g, b, a) {
  if (a !== undefined && a < 50) return false; // 거의 투명
  return !(r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD);
}

/**
 * PNG의 콘텐츠 bounding box 추출
 */
async function findBoundingBox(filePath) {
  const img = sharp(filePath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels >= 4 ? data[idx + 3] : 255;
      if (isContent(r, g, b, a)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // 콘텐츠 없음
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 한 PNG 정규화 처리
 */
async function normalizeFile(filePath, layout) {
  const bbox = await findBoundingBox(filePath);
  if (!bbox) {
    console.warn(`  ⚠️  콘텐츠 없음: ${path.basename(filePath)}`);
    return false;
  }

  // 콘텐츠 부분만 추출
  const cropped = await sharp(filePath)
    .extract({
      left: bbox.left,
      top: bbox.top,
      width: bbox.width,
      height: bbox.height,
    })
    .toBuffer();

  // 콘텐츠를 표준 크기로 리사이즈
  // 콘텐츠 비율 유지하면서, 높이가 contentHeightRatio × CANVAS_SIZE가 되도록
  const targetHeight = Math.round(CANVAS_SIZE * layout.contentHeightRatio);
  const aspectRatio = bbox.width / bbox.height;
  const targetWidth = Math.round(targetHeight * aspectRatio);

  // 만약 콘텐츠가 너무 옆으로 길어서 캔버스를 넘어가면 폭에 맞추기
  let finalW = targetWidth;
  let finalH = targetHeight;
  const maxWidth = Math.round(CANVAS_SIZE * 0.95); // 캔버스의 95%까지 허용
  if (finalW > maxWidth) {
    const scale = maxWidth / finalW;
    finalW = maxWidth;
    finalH = Math.round(targetHeight * scale);
  }

  const resized = await sharp(cropped)
    .resize(finalW, finalH, { fit: "fill" })
    .toBuffer();

  // 새 캔버스에 표준 위치로 배치
  const cx = Math.round(layout.cx * CANVAS_SIZE);
  const cy = Math.round(layout.cy * CANVAS_SIZE);
  const left = cx - Math.round(finalW / 2);
  const top = cy - Math.round(finalH / 2);

  await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }, // 투명 배경
    },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(filePath + ".tmp");
  fs.renameSync(filePath + ".tmp", filePath);
  return true;
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  console.log(`📂 ${DIR}`);

  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    // 슬롯 매칭
    let layout = null;
    let slotKey = null;
    for (const [k, l] of Object.entries(SLOT_LAYOUT)) {
      if (file.startsWith(l.prefix)) {
        layout = l;
        slotKey = k;
        break;
      }
    }
    if (!layout) {
      skipped++;
      continue;
    }
    if (ONLY_SLOT && slotKey !== ONLY_SLOT) {
      skipped++;
      continue;
    }
    try {
      const start = Date.now();
      const ok = await normalizeFile(path.join(DIR, file), layout);
      if (ok) {
        const ms = Date.now() - start;
        processed++;
        console.log(`✅ ${file} (${slotKey}, ${ms}ms)`);
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  console.log(`\n📊 ${processed}개 정규화, ${skipped}개 건너뜀`);
}

main().catch((err) => {
  console.error("💥", err);
  process.exit(1);
});
