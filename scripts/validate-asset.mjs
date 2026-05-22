#!/usr/bin/env node
/* eslint-disable */
/**
 * 아바타 PNG 자동 검증 — codex prompt 위반 자동 감지
 *
 * 검사 항목:
 *   1. 파일 존재 + 크기 (>30KB)
 *   2. 빈 PNG (opaque < 10%)
 *   3. 색상 위반 (expectedColor 메타 대비)
 *
 * 사용법:
 *   node scripts/validate-asset.mjs                    # 전체 검증
 *   node scripts/validate-asset.mjs --id=hat_graduation # 단일 아이템
 *   node scripts/validate-asset.mjs --slot=hat         # 슬롯별
 *
 * Exit:
 *   0 = 모두 PASS
 *   1 = 1개 이상 FAIL
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, "../public/avatar-shop");
const catalogPath = path.resolve(__dirname, "../src/data/avatarShopCatalog.js");
const catalogMod = await import(`file://${catalogPath}`);
const ALL = catalogMod.ALL_AVATAR_ITEMS || [];

const args = process.argv.slice(2).reduce((a, v) => {
  const [k, val] = v.split("=");
  a[k.replace(/^--/, "")] = val === undefined ? true : val;
  return a;
}, {});

const MIN_SIZE_BYTES = 30 * 1024;
const MIN_OPAQUE_RATIO = 0.10;
const MIN_COLOR_RATIO = 0.05;

// expectedColor 자동 추론 (메타 없을 때) — id 패턴 기반
function inferExpectedColor(item) {
  if (item.expectedColor) return item.expectedColor;
  const id = item.id;
  if (/_(black|graduation|eyepatch)$/.test(id)) return "black";
  if (/_(white|mask_medic|chef)$/.test(id)) return "white";
  return null;
}

async function check(item) {
  const filePath = path.join(DIR, `${item.id}.png`);
  const warnings = [];
  const fails = [];

  if (!fs.existsSync(filePath)) {
    fails.push("FILE_MISSING");
    return { item, warnings, fails };
  }
  const size = fs.statSync(filePath).size;
  if (size < MIN_SIZE_BYTES) {
    fails.push(`SIZE_TOO_SMALL (${(size / 1024).toFixed(1)}KB)`);
  }

  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height;
  let opaque = 0, blackPx = 0, whitePx = 0, edgeOpaque = 0;
  const W = info.width, H = info.height;
  for (let i = 0; i < N; i++) {
    const a = data[i * 4 + 3];
    if (a < 100) continue;
    opaque++;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (Math.max(r, g, b) < 50) blackPx++;
    if (Math.min(r, g, b) > 240) whitePx++;
    const x = i % W, y = (i / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edgeOpaque++;
  }
  const opaqueRatio = opaque / N;
  const blackRatio = opaque > 0 ? blackPx / opaque : 0;
  const whiteRatio = opaque > 0 ? whitePx / opaque : 0;

  if (opaqueRatio < MIN_OPAQUE_RATIO) {
    fails.push(`EMPTY_PNG (opaque=${(opaqueRatio * 100).toFixed(1)}%)`);
  }
  if (edgeOpaque > W * 4) {
    warnings.push(`EDGE_NOT_TRANSPARENT (${edgeOpaque}px on canvas edge — strip-white 누락 가능)`);
  }

  const expected = inferExpectedColor(item);
  if (expected === "black" && blackRatio < MIN_COLOR_RATIO) {
    fails.push(`EXPECTED_BLACK_BUT_NOT (black=${(blackRatio * 100).toFixed(1)}%)`);
  }
  if (expected === "white" && whiteRatio < MIN_COLOR_RATIO) {
    fails.push(`EXPECTED_WHITE_BUT_NOT (white=${(whiteRatio * 100).toFixed(1)}%)`);
  }

  return { item, size, opaqueRatio, blackRatio, whiteRatio, warnings, fails };
}

let items = ALL;
if (args.id) items = items.filter((i) => i.id === args.id);
if (args.slot) items = items.filter((i) => i.slot === args.slot);

console.log(`🧪 검증 시작: ${items.length}개`);
let failCount = 0, warnCount = 0;
for (const item of items) {
  const r = await check(item);
  if (r.fails.length > 0) {
    failCount++;
    console.log(`❌ ${item.id}: ${r.fails.join(", ")}`);
  } else if (r.warnings.length > 0) {
    warnCount++;
    console.log(`⚠️  ${item.id}: ${r.warnings.join(", ")}`);
  } else if (args.verbose) {
    console.log(`✅ ${item.id} (opaque=${(r.opaqueRatio * 100).toFixed(0)}%, ${(r.size / 1024).toFixed(0)}KB)`);
  }
}
console.log(`\n📊 결과: ${items.length - failCount - warnCount} PASS · ${warnCount} WARN · ${failCount} FAIL`);
process.exit(failCount > 0 ? 1 : 0);
