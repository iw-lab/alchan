// src/utils/classReportText.js — 학급 경제 리포트의 숫자를 말로 풀어 주는 순수 함수(화면·시험 공용).

/** 지니계수 → 한 줄 풀이. */
export function giniReading(g) {
  if (!(typeof g === "number" && Number.isFinite(g))) return { tone: "none", text: "아직 계산하지 않았어요" };
  if (g < 0.25) return { tone: "good", text: "자산이 고르게 퍼져 있어요" };
  if (g < 0.4) return { tone: "ok", text: "조금 차이가 나요" };
  if (g < 0.55) return { tone: "warn", text: "꽤 몰려 있어요" };
  return { tone: "bad", text: "몇 명에게 많이 몰려 있어요" };
}

/**
 * 리포트에서 수업 거리(이야깃거리)를 뽑는다. 정답을 주는 게 아니라 아이들과 나눌 질문을 준다.
 * @param {object} r classReportMath.buildClassReport 결과
 * @return {string[]} 최대 4개
 */
export function teachingPrompts(r) {
  if (!r || !r.count) return [];
  const out = [];
  const pct = (n) => Math.round((n / r.count) * 100);
  // 5명 미만이면 «상위 20%»가 한 명이라 몫이 뜻을 잃는다 — 말하지 않는다(교차검증 gemini 2026-11-11).
  if (r.count >= 5 && r.gini >= 0.4) out.push(`상위 20%가 학급 자산의 ${Math.round(r.top20Share * 100)}%를 갖고 있어요. «세금과 지원금은 누구에게 얼마나?»를 국회 안건으로 올려 볼 만해요.`);
  if (r.inDebt > 0) out.push(`순자산이 마이너스인 학생이 ${r.inDebt}명 있어요. 빚이 왜 생겼는지, 어떻게 갚을지 따로 이야기해 보세요.`);
  if (pct(r.savers) < 50) out.push(`통장에 돈을 넣어 둔 학생이 ${r.savers}명(${pct(r.savers)}%)뿐이에요. «이자는 왜 생길까?» 수업을 해 볼 때예요.`);
  if (pct(r.investors) < 30) out.push(`주식을 가진 학생이 ${r.investors}명이에요. 모둠별 모의투자를 한 주 해 보면 어떨까요?`);
  if (r.landlords === 0) out.push("부동산을 가진 학생이 없어요. 자리 경매를 한 번 열면 부동산 시장이 움직이기 시작해요.");
  const cashShare = r.totalAssets > 0 ? (r.composition?.cash || 0) / r.totalAssets : 0;
  if (cashShare >= 0.7) out.push(`자산의 ${Math.round(cashShare * 100)}%가 그냥 현금이에요. 돈이 쓰이지도 불어나지도 않고 쌓여 있다는 뜻이에요.`);
  return out.slice(0, 4);
}

export const COMPOSITION_LABELS = [
  ["cash", "현금", "#6366f1"],
  ["parkingBalance", "파킹통장", "#0ea5e9"],
  ["depositSavingsTotal", "예금·적금", "#10b981"],
  ["stockValue", "주식", "#f59e0b"],
  ["realEstateValue", "부동산", "#ef4444"],
  ["couponTotal", "쿠폰", "#a855f7"],
];
