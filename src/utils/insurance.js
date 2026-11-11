// src/utils/insurance.js — 재난 보험 계산 화면 사본(미리 보여 주기용).
// ⚠️ 정본은 functions/insuranceMath.js — 보험료·보험금은 서버가 그 파일로 정한다. 규칙을 고치면 두 파일을 같이
//    (src/test/functions/insuranceMath.test.js 가 표로 대조한다).
const MAX_MONEY = 10000000000;
const PREMIUM_RATE = 0.01;
const MIN_PREMIUM = 100;
const CAP_MULTIPLIER = 20;
const COVERAGE_RATE = 0.5;
const TERM_DAYS = 7;
const TERM_MS = TERM_DAYS * 24 * 60 * 60 * 1000;

const isMoney = (v) => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= MAX_MONEY;

/** Timestamp·Date·ms → ms. 못 읽으면 0. */
export function toMs(v) {
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
export function quotePremium(cash) {
  if (typeof cash !== "number" || !Number.isFinite(cash)) return { ok: false, reason: "bad-cash" };
  const premium = Math.max(MIN_PREMIUM, Math.ceil(cash * PREMIUM_RATE));
  if (!isMoney(premium)) return { ok: false, reason: "bad-cash" };
  if (cash < premium) return { ok: false, reason: "not-enough-cash" };
  const cap = premium * CAP_MULTIPLIER;
  if (!isMoney(cap)) return { ok: false, reason: "bad-cash" };
  return { ok: true, premium, cap };
}

/** 이 정책이 지금 이 학생의 것으로 살아 있는가. */
export function isPolicyActive(policy, nowMs, classCode, uid) {
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
export function computePayout(loss, capRemaining, coverageRate = COVERAGE_RATE) {
  if (!isMoney(loss) || !isMoney(capRemaining)) return 0;
  const rate = typeof coverageRate === "number" && coverageRate > 0 && coverageRate <= 1 ? coverageRate : 0;
  const payout = Math.min(Math.floor(loss * rate), capRemaining, loss);
  return isMoney(payout) ? payout : 0;
}

export { PREMIUM_RATE, MIN_PREMIUM, CAP_MULTIPLIER, COVERAGE_RATE, TERM_DAYS, TERM_MS };

/**
 * 화면에 보여 줄 보험 상태.
 * @return {{state:"active"|"none", daysLeft?:number, capRemaining?:number, payoutThisTerm?:number, expiresMs?:number}}
 */
export function policyView(policy, nowMs, classCode, uid) {
  if (!policy || typeof policy !== "object" || policy.classCode !== classCode || policy.userId !== uid) return { state: "none" };
  const exp = toMs(policy.expiresAt);
  if (!(exp > nowMs)) return { state: "none" };
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    state: "active",
    expiresMs: exp,
    daysLeft: Math.max(1, Math.ceil((exp - nowMs) / (24 * 60 * 60 * 1000))),
    capRemaining: num(policy.capRemaining),
    payoutThisTerm: num(policy.payoutThisTerm),
  };
}
