// src/BankingCalculations.js

/**
 * 일단위 복리로 최종 금액을 계산합니다.
 *
 * @param {number} principal - 원금
 * @param {number} dailyRate - 일 이자율 (소수점 형태, 예: 0.0001)
 * @param {number} termInDays - 기간 (일)
 * @returns {number} - 복리 적용된 최종 금액
 */
export const calculateCompoundInterest = (principal, dailyRate, termInDays) => {
  // 일단위 복리 계산: principal * (1 + dailyRate)^termInDays
  const decimalRate = dailyRate / 100; // 퍼센트를 소수로 변환
  return principal * Math.pow(1 + decimalRate, termInDays);
};

/**
 * 예금 상품의 최종 수령액을 계산합니다.
 *
 * @param {number} principal - 원금
 * @param {number} dailyRate - 일 이자율 (%)
 * @param {number} termInDays - 예금 기간 (일)
 * @returns {Object} - { finalAmount, interestEarned }
 */
export const calculateDeposit = (principal, dailyRate, termInDays) => {
  const finalAmount = calculateCompoundInterest(
    principal,
    dailyRate,
    termInDays
  );
  const interestEarned = finalAmount - principal;

  return {
    finalAmount: Math.round(finalAmount),
    interestEarned: Math.round(interestEarned),
  };
};

/**
 * 적금 상품의 최종 수령액을 계산합니다. (매월 일정액 납입)
 *
 * @param {number} monthlyPayment - 월 납입액
 * @param {number} dailyRate - 일 이자율 (%)
 * @param {number} termInDays - 적금 기간 (일)
 * @returns {Object} - { finalAmount, totalDeposits, interestEarned }
 */
export const calculateInstallmentSavings = (
  monthlyPayment,
  dailyRate,
  termInDays
) => {
  const months = Math.floor(termInDays / 30);
  let finalAmount = 0;

  // 각 납입액에 대한 복리 계산
  for (let month = 0; month < months; month++) {
    const remainingDays = termInDays - month * 30;
    const amountWithInterest = calculateCompoundInterest(
      monthlyPayment,
      dailyRate,
      remainingDays
    );
    finalAmount += amountWithInterest;
  }

  const totalDeposits = monthlyPayment * months;
  const interestEarned = finalAmount - totalDeposits;

  return {
    finalAmount: Math.round(finalAmount),
    totalDeposits: totalDeposits,
    interestEarned: Math.round(interestEarned),
  };
};

/**
 * 대출 상품의 상환액을 계산합니다.
 *
 * @param {number} loanAmount - 대출 원금
 * @param {number} dailyRate - 일 이자율 (%)
 * @param {number} termInDays - 대출 기간 (일)
 * @param {string} repaymentType - 상환 방식 ('bullet', 'equal', 'amortization')
 * @returns {Object} - 상환 방식에 따른 계산 결과
 */
export const calculateLoan = (
  loanAmount,
  dailyRate,
  termInDays,
  repaymentType = "equal"
) => {
  const decimalRate = dailyRate / 100;

  switch (repaymentType) {
    case "bullet": // 만기일시상환 (복리 적용)
      const totalRepayment = loanAmount * Math.pow(1 + decimalRate, termInDays);
      return {
        totalRepayment: Math.round(totalRepayment),
        interestAmount: Math.round(totalRepayment - loanAmount),
        monthlyPayment: 0, // 만기일시상환은 월납입금이 없음
        repaymentSchedule: [
          {
            period: termInDays,
            payment: Math.round(totalRepayment),
            principal: loanAmount,
            interest: Math.round(totalRepayment - loanAmount),
          },
        ],
      };

    case "equal": // 원리금균등상환
      const months = Math.ceil(termInDays / 30);
      // 월 이자율 계산 (30일 기준)
      const monthlyRate = Math.pow(1 + decimalRate, 30) - 1;

      // 원리금균등상환 월납입금
      const monthlyPayment =
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);

      let remainingPrincipal = loanAmount;
      const repaymentSchedule = [];
      let totalInterest = 0;

      for (let month = 1; month <= months; month++) {
        const interestPayment = remainingPrincipal * monthlyRate;
        const principalPayment = monthlyPayment - interestPayment;

        remainingPrincipal -= principalPayment;
        totalInterest += interestPayment;

        repaymentSchedule.push({
          period: month,
          payment: Math.round(monthlyPayment),
          principal: Math.round(principalPayment),
          interest: Math.round(interestPayment),
          remainingPrincipal: Math.max(0, Math.round(remainingPrincipal)),
        });
      }

      return {
        totalRepayment: Math.round(monthlyPayment * months),
        interestAmount: Math.round(totalInterest),
        monthlyPayment: Math.round(monthlyPayment),
        repaymentSchedule,
      };

    case "amortization": // 원금균등상환
      const monthsAmort = Math.ceil(termInDays / 30);
      const monthlyPrincipal = loanAmount / monthsAmort;
      let remainingPrincipalAmort = loanAmount;
      const repaymentScheduleAmort = [];
      let totalInterestAmort = 0;

      for (let month = 1; month <= monthsAmort; month++) {
        // 30일 기준 이자 계산
        const monthlyRateAmort = Math.pow(1 + decimalRate, 30) - 1;
        const interestPayment = remainingPrincipalAmort * monthlyRateAmort;
        const payment = monthlyPrincipal + interestPayment;

        remainingPrincipalAmort -= monthlyPrincipal;
        totalInterestAmort += interestPayment;

        repaymentScheduleAmort.push({
          period: month,
          payment: Math.round(payment),
          principal: Math.round(monthlyPrincipal),
          interest: Math.round(interestPayment),
          remainingPrincipal: Math.max(0, Math.round(remainingPrincipalAmort)),
        });
      }

      return {
        totalRepayment: Math.round(loanAmount + totalInterestAmort),
        interestAmount: Math.round(totalInterestAmort),
        monthlyPayment: null, // 원금균등상환은 월납입금이 매월 달라짐
        repaymentSchedule: repaymentScheduleAmort,
      };

    default:
      throw new Error("지원되지 않는 상환 방식입니다.");
  }
};
