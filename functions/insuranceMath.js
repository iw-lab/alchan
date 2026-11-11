/**
 * 재난 보험 — 계산만 떼어 낸 순수 함수(firebase-admin 을 import 하지 않는다).
 *
 * 규칙(선생님이 맡긴 값 — 2026-11-11):
 *   · 보험료 = 가입할 때 가진 현금의 1%(최소 100원), 1주일 보장. 자동 갱신 없음 — 매주 아이가 고른다.
 *   · 보장 = 경제이벤트 «현금 긴급 차감»으로 잃은 돈의 절반. 세금(추가 과세)은 보험 대상이 아니다.
 *   · 한 번 가입으로 받을 수 있는 보험금은 낸 보험료의 20배까지(현금을 잠깐 빼 두고 싸게 드는 꾀를 막는다 —
 *     보험료가 싸면 받을 수 있는 돈도 그만큼 적다).
 *
 * 불변식(src/test/functions/insuranceMath.test.js 가 지킨다):
 *   I1 보험금은 정수이고 0 ≤ 보험금 ≤ 손실액   I2 보험금 ≤ 남은 한도   I3 못 쓰는 입력은 0 원(던지지 않는다)
 */
const { MAX_MONEY } = require("./moneyGuards");

const PREMIUM_RATE = 0.01;
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
  const premium = Math.max(MIN_PREMIUM, Math.ceil(cash * PREMIUM_RATE));
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
  if (!isMoney(loss) || !isMoney(capRemaining)) return 0;
  const rate = typeof coverageRate === "number" && coverageRate > 0 && coverageRate <= 1 ? coverageRate : 0;
  const payout = Math.min(Math.floor(loss * rate), capRemaining, loss);
  return isMoney(payout) ? payout : 0;
}

module.exports = {
  PREMIUM_RATE, MIN_PREMIUM, CAP_MULTIPLIER, COVERAGE_RATE, TERM_DAYS, TERM_MS,
  toMs, quotePremium, isPolicyActive, computePayout,
};
