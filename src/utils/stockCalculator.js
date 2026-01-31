// src/utils/stockCalculator.js
// 주식 관련 순수 계산 로직 (Firebase 의존성 없음 - 테스트 가능)

// 상수
export const COMMISSION_RATE = 0.003; // 0.3% 수수료
export const STOCK_TAX_RATE = 0.22; // 22% 주식 양도세
export const BOND_TAX_RATE = 0.154; // 15.4% 채권 이자소득세
export const HOLDING_LOCK_PERIOD = 60 * 60 * 1000; // 1시간 (밀리초)

/**
 * 주식 매수 시 필요 금액 계산 (수수료 포함)
 * @param {number} price - 주가
 * @param {number} quantity - 수량
 * @param {number} commissionRate - 수수료율 (기본 0.003 = 0.3%)
 * @returns {{totalPrice: number, commission: number, totalCost: number}}
 */
export const calculateBuyCost = (price, quantity, commissionRate = COMMISSION_RATE) => {
  if (typeof price !== 'number' || price <= 0) return { totalPrice: 0, commission: 0, totalCost: 0 };
  if (typeof quantity !== 'number' || quantity <= 0) return { totalPrice: 0, commission: 0, totalCost: 0 };
  if (typeof commissionRate !== 'number') commissionRate = COMMISSION_RATE;

  const totalPrice = price * quantity;
  const commission = Math.round(totalPrice * commissionRate);
  const totalCost = totalPrice + commission;

  return { totalPrice, commission, totalCost };
};

/**
 * 주식 매도 시 수익/손실 계산
 * @param {number} sellPrice - 매도가
 * @param {number} buyPrice - 매수가 (평균)
 * @param {number} quantity - 수량
 * @param {number} commissionRate - 수수료율
 * @param {string} productType - 'stock' | 'bond' | 'etf'
 * @returns {{grossProceeds: number, commission: number, profit: number, tax: number, netProceeds: number}}
 */
export const calculateSellResult = (sellPrice, buyPrice, quantity, commissionRate = COMMISSION_RATE, productType = 'stock') => {
  if (typeof sellPrice !== 'number' || sellPrice <= 0) {
    return { grossProceeds: 0, commission: 0, profit: 0, tax: 0, netProceeds: 0 };
  }
  if (typeof buyPrice !== 'number' || buyPrice <= 0) buyPrice = sellPrice;
  if (typeof quantity !== 'number' || quantity <= 0) {
    return { grossProceeds: 0, commission: 0, profit: 0, tax: 0, netProceeds: 0 };
  }

  const grossProceeds = sellPrice * quantity;
  const commission = Math.round(grossProceeds * commissionRate);
  const totalBuyCost = buyPrice * quantity;
  const profit = grossProceeds - totalBuyCost - commission;

  // 세금은 이익이 있을 때만
  let tax = 0;
  if (profit > 0) {
    const taxRate = productType === 'bond' ? BOND_TAX_RATE : STOCK_TAX_RATE;
    tax = Math.round(profit * taxRate);
  }

  const netProceeds = grossProceeds - commission - tax;

  return {
    grossProceeds,
    commission,
    profit,
    tax,
    netProceeds,
  };
};

/**
 * 주식 양도세 계산
 * @param {number} profit - 이익 금액
 * @param {string} productType - 'stock' | 'bond' | 'etf'
 * @returns {number} 세금
 */
export const calculateStockTax = (profit, productType = 'stock') => {
  if (typeof profit !== 'number' || profit <= 0) return 0;

  if (productType === 'bond') {
    return Math.round(profit * BOND_TAX_RATE);
  }
  return Math.round(profit * STOCK_TAX_RATE);
};

/**
 * 매수 가능 여부 확인
 * @param {number} userCash - 보유 현금
 * @param {number} price - 주가
 * @param {number} quantity - 매수 수량
 * @param {number} commissionRate - 수수료율
 * @returns {{canBuy: boolean, error: string|null, maxQuantity: number}}
 */
export const validateBuy = (userCash, price, quantity, commissionRate = COMMISSION_RATE) => {
  if (typeof userCash !== 'number' || userCash <= 0) {
    return { canBuy: false, error: '현금이 부족합니다.', maxQuantity: 0 };
  }
  if (typeof price !== 'number' || price <= 0) {
    return { canBuy: false, error: '유효하지 않은 가격입니다.', maxQuantity: 0 };
  }
  if (typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
    return { canBuy: false, error: '유효하지 않은 수량입니다.', maxQuantity: 0 };
  }

  const { totalCost } = calculateBuyCost(price, quantity, commissionRate);

  // 최대 매수 가능 수량 계산
  const maxQuantity = Math.floor(userCash / (price * (1 + commissionRate)));

  if (totalCost > userCash) {
    return { canBuy: false, error: '현금이 부족합니다.', maxQuantity };
  }

  return { canBuy: true, error: null, maxQuantity };
};

/**
 * 매도 가능 여부 확인 (보유 잠금 기간)
 * @param {Date|number} lastBuyTime - 마지막 매수 시간
 * @param {number} lockPeriod - 잠금 기간 (밀리초, 기본 1시간)
 * @returns {{canSell: boolean, remainingTime: number}}
 */
export const validateSellLock = (lastBuyTime, lockPeriod = HOLDING_LOCK_PERIOD) => {
  if (!lastBuyTime) return { canSell: true, remainingTime: 0 };

  let lastBuyTimeMs;
  if (lastBuyTime instanceof Date) {
    lastBuyTimeMs = lastBuyTime.getTime();
  } else if (typeof lastBuyTime === 'number') {
    lastBuyTimeMs = lastBuyTime;
  } else if (lastBuyTime?.toDate) {
    // Firestore Timestamp
    lastBuyTimeMs = lastBuyTime.toDate().getTime();
  } else {
    return { canSell: true, remainingTime: 0 };
  }

  const now = Date.now();
  const timeSinceBuy = now - lastBuyTimeMs;
  const remainingTime = Math.max(0, lockPeriod - timeSinceBuy);

  return {
    canSell: remainingTime === 0,
    remainingTime,
  };
};

/**
 * 보유 주식 평균 매수가 계산 (추가 매수 시)
 * @param {number} currentQuantity - 현재 보유 수량
 * @param {number} currentAvgPrice - 현재 평균 매수가
 * @param {number} newQuantity - 추가 매수 수량
 * @param {number} newPrice - 추가 매수가
 * @returns {number} 새로운 평균 매수가
 */
export const calculateNewAvgPrice = (currentQuantity, currentAvgPrice, newQuantity, newPrice) => {
  if (typeof currentQuantity !== 'number' || currentQuantity < 0) currentQuantity = 0;
  if (typeof currentAvgPrice !== 'number' || currentAvgPrice < 0) currentAvgPrice = 0;
  if (typeof newQuantity !== 'number' || newQuantity <= 0) return currentAvgPrice;
  if (typeof newPrice !== 'number' || newPrice <= 0) return currentAvgPrice;

  const totalValue = (currentQuantity * currentAvgPrice) + (newQuantity * newPrice);
  const totalQuantity = currentQuantity + newQuantity;

  if (totalQuantity === 0) return 0;

  return Math.round(totalValue / totalQuantity);
};

/**
 * 수익률 계산
 * @param {number} currentPrice - 현재가
 * @param {number} avgBuyPrice - 평균 매수가
 * @returns {number} 수익률 (%)
 */
export const calculateReturnRate = (currentPrice, avgBuyPrice) => {
  if (typeof avgBuyPrice !== 'number' || avgBuyPrice <= 0) return 0;
  if (typeof currentPrice !== 'number' || currentPrice <= 0) return 0;

  return ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
};

/**
 * 시장 지수 계산 (기준가 대비)
 * @param {Array<{price: number, initialPrice: number, isListed: boolean, productType: string}>} stocks
 * @param {number} baseIndex - 기준 지수 (기본 1000)
 * @returns {number} 시장 지수
 */
export const calculateMarketIndex = (stocks, baseIndex = 1000) => {
  if (!Array.isArray(stocks) || stocks.length === 0) return baseIndex;

  const listedStocks = stocks.filter(s => s && s.isListed && s.productType === 'stock');
  if (listedStocks.length === 0) return baseIndex;

  let totalCurrentValue = 0;
  let totalBaseValue = 0;

  for (const stock of listedStocks) {
    const currentPrice = stock.price || 0;
    const basePrice = stock.initialPrice || stock.price || 1;

    totalCurrentValue += currentPrice;
    totalBaseValue += basePrice;
  }

  if (totalBaseValue === 0) return baseIndex;

  return Math.round((totalCurrentValue / totalBaseValue) * baseIndex);
};
