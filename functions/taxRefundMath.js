/**
 * 세금 환급(경제이벤트) 1인당 금액 — 순수 함수.
 *
 * 배경(2026-11-03): 국고(=교사 cash)가 마이너스면 «국고의 30%» 가 0 이하라 환급이 통째로
 * 건너뛰어졌다(BG6QUC 11-02 13시, 21명 전원 0원). 사용자 결정 «국고는 모든 기능에서
 * 마이너스 허용» — 국고가 비어도 환급은 나간다.
 *
 * 국고가 플러스면 종전대로 «국고 × 환급률 ÷ 인원». 0 이하면 30% 기준이 성립하지 않으므로
 * 그 학급의 **직전 정상 환급 1인당액**을 그대로 준다(학생이 평소 받던 만큼). 이력이 없으면
 * 정부 지원금과 같은 기본액.
 */
const DEFAULT_REFUND_PER_STUDENT = 50000;

function refundPerStudentFor({ treasuryAmount, refundRate, studentCount, lastPerStudent }) {
  if (!(studentCount > 0)) return { perStudent: 0, basis: "none" };
  const treasury = Number.isFinite(treasuryAmount) ? treasuryAmount : 0;
  if (treasury > 0) {
    const perStudent = Math.floor(Math.floor(treasury * refundRate) / studentCount);
    if (perStudent > 0) return { perStudent, basis: "treasury" };
  }
  const last = Number(lastPerStudent);
  if (Number.isInteger(last) && last > 0) return { perStudent: last, basis: "last" };
  return { perStudent: DEFAULT_REFUND_PER_STUDENT, basis: "default" };
}

module.exports = { refundPerStudentFor, DEFAULT_REFUND_PER_STUDENT };
