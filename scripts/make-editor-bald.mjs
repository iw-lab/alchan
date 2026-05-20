#!/usr/bin/env node
/* eslint-disable */
/**
 * base_male.png를 복사해서 머리카락 영역만 살색으로 치환 → editor_bald.png 생성.
 *
 * v2 (2026-05-20): connected component 사이즈 기반 — 큰 component(머리카락 ~10k px)만 살색,
 * 작은 component(눈동공·입·눈썹 100~600px)은 보존 → 얼굴 디테일 손상 없음.
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

const SKIN_R = 247, SKIN_G = 213, SKIN_B = 184;
const HAIR_MAX_RGB = 130; // 검정/짙은 갈색 머리 detect
const MIN_HAIR_COMPONENT = 2000; // 2000px 이상 = 머리카락. 그 이하 = 눈/입/눈썹

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const out = Buffer.from(data);

const headEndY = Math.floor(H * 0.42); // 좀 넉넉하게 — 큰 머리카락이 42%까지 내려올 수 있음

// 1. 머리 영역의 검정 픽셀 마스크
const darkMask = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const a = out[i * 4 + 3];
  if (a < 50) continue;
  const y = Math.floor(i / W);
  if (y >= headEndY) continue;
  const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
  if (Math.max(r, g, b) < HAIR_MAX_RGB) darkMask[i] = 1;
}

// 2. connected component (4-neighbor BFS)
const groupId = new Int32Array(N);
const groupSizes = [0];
let nextGroup = 0;
for (let i = 0; i < N; i++) {
  if (!darkMask[i] || groupId[i]) continue;
  nextGroup++;
  let size = 0;
  const stack = [i];
  groupId[i] = nextGroup;
  while (stack.length) {
    const idx = stack.pop();
    size++;
    const x = idx % W, y = Math.floor(idx / W);
    const ns = [];
    if (x > 0) ns.push(idx - 1);
    if (x < W - 1) ns.push(idx + 1);
    if (y > 0) ns.push(idx - W);
    if (y < H - 1) ns.push(idx + W);
    for (const ni of ns) {
      if (darkMask[ni] && !groupId[ni]) {
        groupId[ni] = nextGroup;
        stack.push(ni);
      }
    }
  }
  groupSizes.push(size);
}

// 3. 큰 component(머리카락)의 내부만 살색. 외곽 boundary 픽셀은 검정 유지 (외곽선 보존).
//    작은 component(눈·입) 전체 보존.
const isHair = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const g = groupId[i];
  if (g && groupSizes[g] >= MIN_HAIR_COMPONENT) isHair[i] = 1;
}

let changedHair = 0;
let preservedFeatures = 0;
let preservedOutline = 0;
for (let i = 0; i < N; i++) {
  const g = groupId[i];
  if (!g) continue;
  if (groupSizes[g] < MIN_HAIR_COMPONENT) {
    preservedFeatures++;
    continue;
  }
  // hair component 안 픽셀: 이웃에 비-hair (component 밖 = 외곽 boundary) 있으면 검정 유지
  const x = i % W, y = Math.floor(i / W);
  let isBoundary = false;
  if (x > 0 && !isHair[i - 1]) isBoundary = true;
  else if (x < W - 1 && !isHair[i + 1]) isBoundary = true;
  else if (y > 0 && !isHair[i - W]) isBoundary = true;
  else if (y < H - 1 && !isHair[i + W]) isBoundary = true;
  if (isBoundary) {
    preservedOutline++;
    continue; // 검정 유지 — base_male의 머리카락 외곽선
  }
  // 내부 픽셀만 살색 fill
  out[i * 4] = SKIN_R;
  out[i * 4 + 1] = SKIN_G;
  out[i * 4 + 2] = SKIN_B;
  out[i * 4 + 3] = 255;
  changedHair++;
}

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(DST);
console.log(`✅ editor_bald.png — 머리카락 ${changedHair}px 살색 치환, 얼굴 디테일 ${preservedFeatures}px 보존 (눈/입/눈썹)`);
console.log(`   component ${nextGroup}개 분석, 큰 컴포넌트(≥${MIN_HAIR_COMPONENT}px) = 머리카락`);
