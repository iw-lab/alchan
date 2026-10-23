// 쿠폰 목표 1인 상한(목표의 50%) — 서버 functions/couponGoalCap.js 와 같은 판정. 여기는 안내용이고 막는 건 서버다.
export const SHARE = 0.5;

export function personalCap(targetAmount) {
  // 목표 수가 비었거나 이상하면 화면과 같은 기본 목표 1000 으로 본다(0 으로 두면 아무도 응모를 못 한다).
  const n = Math.floor(Number(targetAmount));
  const t = Number.isFinite(n) && n > 0 ? n : 1000;
  return Math.max(1, Math.floor(t * SHARE)); // 목표가 1개면 절반이 0 이 되어 영영 못 채운다 — 최소 1
}

export function contributedBy(donations, uid) {
  if (!Array.isArray(donations)) return 0;
  let sum = 0;
  for (const d of donations) {
    if (d && d.userId === uid && Number.isInteger(d.amount) && d.amount > 0) sum += d.amount;
  }
  return sum;
}

export function remainingFor(targetAmount, donations, uid) {
  return Math.max(0, personalCap(targetAmount) - contributedBy(donations, uid));
}
