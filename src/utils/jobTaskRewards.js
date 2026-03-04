// 직업 할일 보상 생성 함수

// 가중치 기반 랜덤 보상 생성 (직업 할일용)
export const generateJobTaskReward = () => {
  // 현금 보상 (1,000원 ~ 500,000원) - 높은 금액일수록 낮은 확률
  const cashRewards = [
    { amount: 500000, weight: 0.5 },  // 50만원: 0.5% (초대박)
    { amount: 300000, weight: 1 },    // 30만원: 1%
    { amount: 100000, weight: 2 },    // 10만원: 2%
    { amount: 50000, weight: 4 },     // 5만원: 4%
    { amount: 30000, weight: 6 },     // 3만원: 6%
    { amount: 20000, weight: 8 },     // 2만원: 8%
    { amount: 10000, weight: 13 },    // 1만원: 13%
    { amount: 5000, weight: 18 },     // 5천원: 18%
    { amount: 3000, weight: 20 },     // 3천원: 20%
    { amount: 1000, weight: 27.5 },   // 1천원: 27.5% (가장 높은 확률)
  ];

  // 쿠폰 보상 (1개, 3개, 5개, 10개, 20개만)
  const couponRewards = [
    { amount: 20, weight: 10 },       // 20개: 10%
    { amount: 10, weight: 20 },       // 10개: 20%
    { amount: 5, weight: 20 },        // 5개: 20%
    { amount: 3, weight: 20 },        // 3개: 20%
    { amount: 1, weight: 30 }         // 1개: 30%
  ];

  // 가중치 기반 랜덤 선택 함수
  const weightedRandom = (items) => {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item.amount;
      }
    }

    return items[items.length - 1].amount;
  };

  return {
    cash: weightedRandom(cashRewards),
    coupon: weightedRandom(couponRewards)
  };
};
