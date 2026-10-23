// 쿠폰 목표 1인 상한 — 한 사람이 학급 목표의 절반(50%)을 넘겨 응모하지 못한다(2026-10-23 사용자 «한 사람이 50% 이상 못 응모하게»).
// 서버(여기)가 진짜 경계이고, 클라이언트 src/utils/couponGoalCap.js 는 같은 판정으로 미리 안내만 한다.
// 내 응모량은 목표 문서의 donations 배열에서 센다 — 목표를 초기화하면 배열이 비므로 새 목표마다 0부터다
// (users.myContribution 은 화면도 안 쓰는 옛 값이라 기준으로 삼지 않는다).
const SHARE = 0.5;

/** 한 사람이 이 목표에 넣을 수 있는 최대 쿠폰 수(목표의 절반, 내림). */
function personalCap(targetAmount) {
  // 목표 수가 비었거나 이상하면 화면과 같은 기본 목표 1000 으로 본다(0 으로 두면 아무도 응모를 못 한다).
  const n = Math.floor(Number(targetAmount));
  const t = Number.isFinite(n) && n > 0 ? n : 1000;
  return Math.max(1, Math.floor(t * SHARE)); // 목표가 1개면 절반이 0 이 되어 영영 못 채운다 — 최소 1
}

/** donations 배열에서 이 사람이 넣은 합계 — 금액이 정상 정수가 아닌 줄은 세지 않는다. */
function contributedBy(donations, uid) {
  if (!Array.isArray(donations)) return 0;
  let sum = 0;
  for (const d of donations) {
    if (d && d.userId === uid && Number.isInteger(d.amount) && d.amount > 0) sum += d.amount;
  }
  return sum;
}

/** 지금 더 넣을 수 있는 수(0 이상). */
function remainingFor(targetAmount, donations, uid) {
  return Math.max(0, personalCap(targetAmount) - contributedBy(donations, uid));
}

module.exports = { SHARE, personalCap, contributedBy, remainingFor };
