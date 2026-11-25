/**
 * 재난 보험 — 계산만 떼어 낸 순수 함수(firebase-admin 을 import 하지 않는다).
 *
 * 규칙(선생님이 맡긴 값 — 2026-11-11, 2026-11-25 «보험이 세금도 막아줘»로 넓힘):
 *   · 보험료 = 가입할 때 가진 현금의 1.5%(최소 100원), 1주일 보장. 자동 갱신 없음 — 매주 아이가 고른다.
 *   · 보장 = 경제이벤트 «경제 위기 긴급 부담금»(CASH_PENALTY)·«긴급 세금 추징»(TAX_EXTRA)으로 나가는 돈의 절반.
 *     평소 세금(재산세·주급 세금·거래세)은 이벤트가 아니라서 해당 없음.
 *   · 한 번 가입으로 받을 수 있는 보험금은 낸 보험료의 20배까지(현금을 잠깐 빼 두고 싸게 드는 꾀를 막는다 —
 *     보험료가 싸면 받을 수 있는 돈도 그만큼 적다).
 *
 * 불변식(src/test/functions/insuranceMath.test.js 가 지킨다):
 *   I1 보험금은 정수이고 0 ≤ 보험금 ≤ 손실액   I2 보험금 ≤ 남은 한도   I3 못 쓰는 입력은 0 원(던지지 않는다)
 */
const { MAX_MONEY } = require("./moneyGuards");

const PREMIUM_PERMILLE = 15; // 1.5% — 정수 천분율로 계산한다(0.015 를 곱하면 소수 오차로 1원 더 받는 값이 있다)
const PREMIUM_RATE = PREMIUM_PERMILLE / 1000;
const MIN_PREMIUM = 100;
const CAP_MULTIPLIER = 20;
const COVERAGE_RATE = 0.5;
const TERM_DAYS = 7;
const TERM_MS = TERM_DAYS * 24 * 60 * 60 * 1000;

const isMoney = (v) => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= MAX_MONEY;

/** Timestamp·Date·ms → ms. 못 읽으면 0. */
function toMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * 지금 가입하면 내는 보험료와 보장 한도.
 * @param {number} cash 지금 가진 현금
 * @return {{ok:true, premium:number, cap:number}|{ok:false, reason:string}}
 */
function quotePremium(cash) {
  if (typeof cash !== "number" || !Number.isFinite(cash)) return { ok: false, reason: "bad-cash" };
  const premium = Math.max(MIN_PREMIUM, Math.ceil((cash * PREMIUM_PERMILLE) / 1000));
  if (!isMoney(premium)) return { ok: false, reason: "bad-cash" };
  if (cash < premium) return { ok: false, reason: "not-enough-cash" };
  const cap = premium * CAP_MULTIPLIER;
  if (!isMoney(cap)) return { ok: false, reason: "bad-cash" };
  return { ok: true, premium, cap };
}

/** 이 정책이 지금 이 학생의 것으로 살아 있는가. */
function isPolicyActive(policy, nowMs, classCode, uid) {
  if (!policy || typeof policy !== "object") return false;
  if (policy.classCode !== classCode || policy.userId !== uid) return false;
  if (!isMoney(policy.capRemaining) || policy.capRemaining <= 0) return false;
  return toMs(policy.expiresAt) > nowMs;
}

/**
 * 손실 한 건에 대한 보험금.
 * @param {number} loss 이번에 실제로 차감되는 돈(정수, ≥0)
 * @param {number} capRemaining 정책의 남은 한도
 * @param {number} [coverageRate]
 * @return {number} 정수, 0 ≤ 값 ≤ min(loss, capRemaining)
 */
function computePayout(loss, capRemaining, coverageRate = COVERAGE_RATE) {
  // 손실은 100억을 넘을 수 있다(순자산 기준 세금) — 정확히 셀 수 있는 정수면 받는다. 나가는 돈은 남은 한도(≤100억)가 막는다.
  if (!Number.isSafeInteger(loss) || loss < 0 || !isMoney(capRemaining)) return 0;
  const rate = typeof coverageRate === "number" && coverageRate > 0 && coverageRate <= 1 ? coverageRate : 0;
  const payout = Math.min(Math.floor(loss * rate), capRemaining, loss);
  return isMoney(payout) ? payout : 0;
}

module.exports = {
  PREMIUM_PERMILLE, PREMIUM_RATE, MIN_PREMIUM, CAP_MULTIPLIER, COVERAGE_RATE, TERM_DAYS, TERM_MS,
  toMs, quotePremium, isPolicyActive, computePayout,
};
