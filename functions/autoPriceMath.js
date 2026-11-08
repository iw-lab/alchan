/**
 * 자동 물가 — 판정만 떼어 낸 순수 함수(2026-11-08 사용자 «학급 학생 총자산에서 적당히 맞추는 걸 자동으로 ·
 * 너무 튀는 상하위는 조절» → 상하위는 계산에서만 뺀다). firebase-admin 을 import 하지 않는다(vitest 에서 require).
 *
 *   대표 자산 = 순자산을 정렬해 위·아래 20%(5~9명이면 1명씩)를 뺀 평균. 학생이 5명 미만이면 null.
 *   배율 = 대표/기준. 3% 안이면 1(기준 유지 — 작은 변화가 쌓였다가 넘으면 움직인다).
 *          넘으면 clamp(0.90, 1.10), 기준 ← 기준 × 배율(못 따라간 나머지는 다음 주로).
 */
// 상점가 하한·상한 정본 — 수동 버튼(index.js adjustStorePrices)도 여기서 가져간다(두 벌이면 언젠가 어긋난다)
const STORE_PRICE_MIN = 100;
const STORE_PRICE_MAX = 1000000000;
const TRIM = 0.2; // 교차검증(gemini): 10% 는 20명 학급에서 위·아래 2명뿐 — 몰아주기·대출 조작에 약하다
const MIN_STUDENTS = 5;
const DEADBAND = 0.03;
const MAX_STEP = 0.1;

function robustCenter(values) {
  const xs = (Array.isArray(values) ? values : [])
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (xs.length < MIN_STUDENTS) return null;
  const k = Math.max(1, Math.floor(xs.length * TRIM));
  const kept = xs.slice(k, xs.length - k);
  return Math.round(kept.reduce((s, v) => s + v, 0) / kept.length);
}

function planStep({ center, anchor }) {
  const keep = (reason) => ({ multiplier: 1, anchor, changed: false, ratio: null, reason });
  if (!(typeof anchor === "number" && Number.isFinite(anchor) && anchor > 0)) return keep("기준이 없다");
  if (!(typeof center === "number" && Number.isFinite(center))) return keep("대표 자산을 계산하지 못했다");
  if (center <= 0) return keep("대표 자산이 0 이하");
  const ratio = center / anchor;
  if (Math.abs(ratio - 1) < DEADBAND) return { multiplier: 1, anchor, changed: false, ratio, reason: "변화가 작다" };
  const multiplier = Math.round(Math.min(1 + MAX_STEP, Math.max(1 - MAX_STEP, ratio)) * 10000) / 10000;
  return { multiplier, anchor: Math.round(anchor * multiplier), changed: true, ratio, reason: ratio > 1 ? "자산이 늘었다" : "자산이 줄었다" };
}

/**
 * 한 아이템의 새 가격 — 수동 버튼과 같은 하한·상한 + 반올림이 한 주 ±10% 를 넘지 않게 정수 범위로 묶는다
 * (교차검증 codex: 105×1.1 을 반올림하면 116 = +10.5%). 바꿀 수 없으면 현재가 그대로.
 */
function itemPrice(current, multiplier, { min = STORE_PRICE_MIN, max = STORE_PRICE_MAX } = {}) {
  if (!(Number.isFinite(current) && current > 0) || !(multiplier > 0)) return current;
  const lo = Math.max(min, Math.ceil(current * (1 - MAX_STEP)));
  const hi = Math.min(max, Math.floor(current * (1 + MAX_STEP)));
  if (lo > hi) return current;
  return Math.min(hi, Math.max(lo, Math.round(current * multiplier)));
}

module.exports = { robustCenter, planStep, itemPrice, STORE_PRICE_MIN, STORE_PRICE_MAX, TRIM, MIN_STUDENTS, DEADBAND, MAX_STEP };
