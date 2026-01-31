// src/utils/transactionCalculator.js
// 송금/거래 관련 순수 계산 로직 (Firebase 의존성 없음 - 테스트 가능)

/**
 * 송금 가능 여부 검증
 * @param {number} senderBalance - 보내는 사람 잔액
 * @param {number} amount - 송금 금액
 * @returns {{valid: boolean, error: string|null}}
 */
export const validateTransfer = (senderBalance, amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: '유효한 금액을 입력하세요.' };
  }
  if (amount <= 0) {
    return { valid: false, error: '금액은 0보다 커야 합니다.' };
  }
  if (typeof senderBalance !== 'number' || isNaN(senderBalance)) {
    return { valid: false, error: '잔액 정보가 유효하지 않습니다.' };
  }
  if (senderBalance < amount) {
    return { valid: false, error: '잔액이 부족합니다.' };
  }
  return { valid: true, error: null };
};

/**
 * 송금 금액 계산 (세금 적용)
 * @param {number} amount - 송금 금액
 * @param {number} taxRate - 세율 (0~100, %)
 * @returns {{grossAmount: number, taxAmount: number, netAmount: number}}
 */
export const calculateTransferAmount = (amount, taxRate = 0) => {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return { grossAmount: 0, taxAmount: 0, netAmount: 0 };
  }
  if (typeof taxRate !== 'number' || isNaN(taxRate)) taxRate = 0;
  if (taxRate < 0) taxRate = 0;
  if (taxRate > 100) taxRate = 100;

  const taxAmount = Math.floor((amount * taxRate) / 100);
  const netAmount = amount - taxAmount;

  return {
    grossAmount: amount,
    taxAmount,
    netAmount,
  };
};

/**
 * 퍼센트 기반 금액 계산
 * @param {number} balance - 잔액
 * @param {number} percentage - 퍼센트 (0~100)
 * @returns {number} 계산된 금액 (내림)
 */
export const calculatePercentageAmount = (balance, percentage) => {
  if (typeof balance !== 'number' || isNaN(balance) || balance <= 0) return 0;
  if (typeof percentage !== 'number' || isNaN(percentage)) return 0;
  if (percentage < 0) percentage = 0;
  if (percentage > 100) percentage = 100;

  return Math.floor((balance * percentage) / 100);
};

/**
 * 송금 후 잔액 계산
 * @param {number} senderBalance - 보내는 사람 현재 잔액
 * @param {number} receiverBalance - 받는 사람 현재 잔액
 * @param {number} amount - 송금 금액
 * @param {number} taxRate - 세율 (0~100, %)
 * @returns {{senderNewBalance: number, receiverNewBalance: number, taxAmount: number}}
 */
export const calculateBalancesAfterTransfer = (senderBalance, receiverBalance, amount, taxRate = 0) => {
  const validation = validateTransfer(senderBalance, amount);
  if (!validation.valid) {
    return {
      senderNewBalance: senderBalance,
      receiverNewBalance: receiverBalance,
      taxAmount: 0,
      error: validation.error,
    };
  }

  const { netAmount, taxAmount } = calculateTransferAmount(amount, taxRate);

  return {
    senderNewBalance: senderBalance - amount,
    receiverNewBalance: receiverBalance + netAmount,
    taxAmount,
    error: null,
  };
};

/**
 * 다중 송금 계산 (여러 명에게 동일 금액)
 * @param {number} senderBalance - 보내는 사람 잔액
 * @param {Array<{id: string, cash: number}>} receivers - 받는 사람 목록
 * @param {number} amountPerPerson - 1인당 금액
 * @param {number} taxRate - 세율 (0~100, %)
 * @returns {{totalSent: number, totalTax: number, results: Array, error: string|null}}
 */
export const calculateBulkTransfer = (senderBalance, receivers, amountPerPerson, taxRate = 0) => {
  if (!Array.isArray(receivers) || receivers.length === 0) {
    return { totalSent: 0, totalTax: 0, results: [], error: '받는 사람이 없습니다.' };
  }
  if (typeof amountPerPerson !== 'number' || amountPerPerson <= 0) {
    return { totalSent: 0, totalTax: 0, results: [], error: '유효한 금액을 입력하세요.' };
  }

  const totalRequired = amountPerPerson * receivers.length;
  if (senderBalance < totalRequired) {
    return { totalSent: 0, totalTax: 0, results: [], error: '잔액이 부족합니다.' };
  }

  const { netAmount, taxAmount } = calculateTransferAmount(amountPerPerson, taxRate);
  const results = receivers.map(receiver => ({
    receiverId: receiver.id,
    oldBalance: receiver.cash || 0,
    newBalance: (receiver.cash || 0) + netAmount,
    received: netAmount,
  }));

  return {
    totalSent: totalRequired,
    totalReceived: netAmount * receivers.length,
    totalTax: taxAmount * receivers.length,
    senderNewBalance: senderBalance - totalRequired,
    results,
    error: null,
  };
};

/**
 * 퍼센트 기반 다중 송금 계산
 * @param {number} senderBalance - 보내는 사람 잔액
 * @param {Array<{id: string, cash: number}>} receivers - 받는 사람 목록
 * @param {number} percentage - 각 받는 사람 잔액의 퍼센트
 * @param {number} taxRate - 세율 (0~100, %)
 * @returns {{totalSent: number, totalTax: number, results: Array, error: string|null}}
 */
export const calculateBulkTransferByPercentage = (senderBalance, receivers, percentage, taxRate = 0) => {
  if (!Array.isArray(receivers) || receivers.length === 0) {
    return { totalSent: 0, totalTax: 0, results: [], error: '받는 사람이 없습니다.' };
  }
  if (typeof percentage !== 'number' || percentage <= 0 || percentage > 100) {
    return { totalSent: 0, totalTax: 0, results: [], error: '유효한 퍼센트를 입력하세요 (1~100).' };
  }

  let totalRequired = 0;
  let totalTax = 0;
  const results = [];

  for (const receiver of receivers) {
    const receiverBalance = receiver.cash || 0;
    const baseAmount = calculatePercentageAmount(receiverBalance, percentage);
    const { netAmount, taxAmount } = calculateTransferAmount(baseAmount, taxRate);

    totalRequired += baseAmount;
    totalTax += taxAmount;
    results.push({
      receiverId: receiver.id,
      oldBalance: receiverBalance,
      newBalance: receiverBalance + netAmount,
      received: netAmount,
      baseAmount,
    });
  }

  if (senderBalance < totalRequired) {
    return { totalSent: 0, totalTax: 0, results: [], error: '잔액이 부족합니다.' };
  }

  return {
    totalSent: totalRequired,
    totalReceived: totalRequired - totalTax,
    totalTax,
    senderNewBalance: senderBalance - totalRequired,
    results,
    error: null,
  };
};
