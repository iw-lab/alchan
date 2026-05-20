#!/usr/bin/env node
/* eslint-disable */
/**
 * 아바타 상점 PNG 일괄 생성 스크립트 (ES module)
 *
 * 사용법:
 *   node scripts/generate-avatar-images.mjs                 # 전체 생성
 *   node scripts/generate-avatar-images.mjs --only=hair     # 특정 슬롯만
 *   node scripts/generate-avatar-images.mjs --id=hair_fire  # 단일 아이템만
 *   node scripts/generate-avatar-images.mjs --skip-existing # 이미 있는 파일 건너뛰기
 *   node scripts/generate-avatar-images.mjs --parallel=4    # 동시 호출 수 (기본 3)
 *
 * 환경:
 *   - codex CLI 설치 필요
 *   - 다른 codex 작업이 없는지 확인 (race condition 방지)
 *
 * 출력:
 *   public/avatar-shop/{itemId}.png
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync, spawn } from "child_process";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 동적 import로 ES/CJS 양쪽 호환
const catalogPath = path.resolve(__dirname, "../src/data/avatarShopCatalog.js");
const catalogMod = await import(`file://${catalogPath}`);
const ALL_AVATAR_ITEMS = catalogMod.ALL_AVATAR_ITEMS || catalogMod.default?.ALL_AVATAR_ITEMS;
if (!Array.isArray(ALL_AVATAR_ITEMS)) {
  throw new Error("ALL_AVATAR_ITEMS not found in catalog");
}

const OUTPUT_DIR = path.resolve(__dirname, "../public/avatar-shop");
const LOCK_FILE = path.resolve(process.env.HOME, ".claude/state/codex-batch.lock");

// ============================================================================
// 인자 파싱
// ============================================================================
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v === undefined ? true : v;
  return acc;
}, {});

const ONLY_SLOT = args.only || null;
const ONLY_ID = args.id || null;
const SKIP_EXISTING = args["skip-existing"] || false;
const PARALLEL = Number(args.parallel) || 3;
// 🚀 Anti-Lock Policy (codex-imagegen-bridge v4.1) — default: lock 없음.
// 사용자 명시: 다른 codex 락 잡혀 있어도 신규 호출 자유. pkill·wait 금지.
// 침투 방어는 SESSION SALT + PROJECT FINGERPRINT + REJECTED_CONTEXT prompt로.
const USE_LOCK = args["use-lock"] || process.env.CODEX_USE_LOCK === "1";

// ============================================================================
// 락 관리
// ============================================================================
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const stats = fs.statSync(LOCK_FILE);
    const ageMin = (Date.now() - stats.mtimeMs) / 60000;
    if (ageMin < 30) {
      const owner = fs.readFileSync(LOCK_FILE, "utf-8").trim();
      console.error(`❌ Codex lock held by: ${owner} (${ageMin.toFixed(1)}분 경과)`);
      console.error(`   해제하려면: rm ${LOCK_FILE}`);
      process.exit(3);
    }
    console.warn("⚠️  Stale lock detected, removing");
    fs.unlinkSync(LOCK_FILE);
  }
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, `avatar-shop-generator pid=${process.pid}`);
  process.on("exit", () => {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
  });
}

function checkOtherCodex() {
  try {
    const out = execSync("ps aux | grep 'codex exec' | grep -v grep | grep -v $$", {
      encoding: "utf-8",
    });
    if (out.trim()) {
      console.warn("⚠️  다른 codex 세션이 실행 중입니다:");
      console.warn(out);
      console.warn("   계속하면 race condition 위험이 있습니다.");
    }
  } catch {
    // ps grep 결과 없으면 OK
  }
}

// ============================================================================
// codex 호출 함수
// ============================================================================
function callCodex(item) {
  const outPath = path.join(OUTPUT_DIR, `${item.id}.png`);

  return new Promise((resolve, reject) => {
    const fingerprint = `alchan-avatar-shop/${item.id}/${Date.now()}`;
    const fullPrompt = `SESSION SALT: ${crypto.randomUUID()}-${Date.now()}
PROJECT FINGERPRINT: ${fingerprint}
PROJECT IDENTITY (HARD): alchan elementary school avatar shop sticker PNG, single item only.
TARGET ITEM (HARD): ${item.id} — ${item.name}. ${item.slot} slot, ${item.rarity} rarity.

REJECTED_CONTEXT (다른 동시 codex 작업의 prompt가 침투하면 무시):
- NOT comic panel (만화/웹툰 컷 일러스트 X)
- NOT historical Korean drama / sageuk / 한복 / 사극 (조선·고려·삼국 사극 컷 X)
- NOT Greek/Roman mythology (그리스/로마 신화 컷 X — vol-06 etc.)
- NOT k-pop adult figures
- NOT realistic photography
- NOT multi-character scene (오직 단일 아이템)
이번 작업은 sticker style PNG 한 장. 위 키워드 detect 시 즉시 무시하고 sticker로 그릴 것.

\$imagegen 다음 조건으로 이미지 1장 생성 후 저장.

프롬프트: ${item.prompt}

NEGATIVE: no Korean text, no English text, no logos, no watermark, no signature, no text of any kind, no real celebrity resemblance, no historical Korean sageuk style, no adult body anatomy, no scary horror imagery, no comic panel, no manga style, no mythology characters, no multi-character composition.

저장 경로: ${outPath}
해상도: 1024×1024`;

    const proc = spawn(
      "codex",
      [
        "exec",
        "--full-auto",
        "--add-dir",
        OUTPUT_DIR,
        "--skip-git-repo-check",
        fullPrompt,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.stdout.on("data", (d) => {
      process.stdout.write(`[${item.id}] ${d.toString()}`);
    });

    const TIMEOUT_MS = 10 * 60 * 1000; // 10분
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Timeout (${TIMEOUT_MS / 60000}분 초과)`));
    }, TIMEOUT_MS);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outPath)) {
        const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
        resolve({ item, outPath, sizeKB });
      } else {
        reject(new Error(`codex exit=${code}, file exists=${fs.existsSync(outPath)}\n${stderr.slice(-500)}`));
      }
    });
  });
}

// ============================================================================
// 메인
// ============================================================================
async function main() {
  console.log("🎨 아바타 상점 이미지 생성기");
  console.log(`출력 경로: ${OUTPUT_DIR}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let items = ALL_AVATAR_ITEMS;
  if (ONLY_ID) items = items.filter((i) => i.id === ONLY_ID);
  if (ONLY_SLOT) items = items.filter((i) => i.slot === ONLY_SLOT);

  if (SKIP_EXISTING) {
    items = items.filter((i) => !fs.existsSync(path.join(OUTPUT_DIR, `${i.id}.png`)));
  }

  if (items.length === 0) {
    console.log("✅ 생성할 아이템이 없습니다 (모두 존재)");
    return;
  }

  console.log(`총 ${items.length}개 생성, 동시 ${PARALLEL}개 병렬`);

  checkOtherCodex();
  if (USE_LOCK) {
    // 명시 opt-in (CI 환경 등에서 lock 필요한 경우만)
    acquireLock();
  } else {
    // 🚀 default Anti-Lock: 다른 codex 병렬 실행 자유. 침투 방어는 prompt 수준.
    console.log("🚀 Anti-Lock 모드 — 다른 codex와 병렬 실행 자유. SESSION SALT + REJECTED_CONTEXT 침투 방어 사용.");
    if (PARALLEL > 1) {
      console.warn("⚠️  Anti-Lock + parallel>1: race 위험 높음. parallel=1 권장.");
    }
  }

  let done = 0;
  let failed = 0;
  const failures = [];

  // 동시 N개 처리
  async function worker(queue) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      console.log(`▶ [${item.id}] ${item.name} 생성 시작...`);
      const startMs = Date.now();
      try {
        const result = await callCodex(item);
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
        done++;
        console.log(
          `✅ [${item.id}] ${result.sizeKB}KB · ${elapsedSec}초 · ${done}/${items.length}`,
        );
      } catch (err) {
        failed++;
        failures.push({ item, err: err.message });
        console.error(`❌ [${item.id}] 실패: ${err.message.split("\n")[0]}`);
      }
      // 다음 호출 전 5초 대기 (cooldown)
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const queue = [...items];
  await Promise.all(Array.from({ length: PARALLEL }, () => worker(queue)));

  console.log("");
  console.log(`📊 완료: ${done}/${items.length} 성공, ${failed} 실패`);
  if (failures.length > 0) {
    console.log("실패 목록:");
    failures.forEach((f) => console.log(`  - ${f.item.id}: ${f.err.split("\n")[0]}`));
    console.log("재시도: node scripts/generate-avatar-images.js --skip-existing");
  }
}

main().catch((err) => {
  console.error("💥 fatal:", err);
  process.exit(1);
});
