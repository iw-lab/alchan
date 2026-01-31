// src/utils/salaryCalculator.js
// 급여 관련 순수 계산 로직 (Firebase 의존성 없음 - 테스트 가능)

/**
 * 세후 급여 계산
 * @param {number} grossSalary - 세전 급여
 * @param {number} taxRate - 세율 (0~1, 예: 0.1 = 10%)
 * @returns {number} 세후 급여 (반올림)
 */
export const calculateNetSalary = (grossSalary, taxRate) => {
  if (typeof grossSalary !== 'number' || isNaN(grossSalary)) return 0;
  if (typeof taxRate !== 'number' || isNaN(taxRate)) return grossSalary;
  if (grossSalary <= 0) return 0;
  if (taxRate < 0) taxRate = 0;
  if (taxRate > 1) taxRate = 1;

  const taxAmount = Math.round(grossSalary * taxRate);
  return grossSalary - taxAmount;
};

/**
 * 세금 금액 계산
 * @param {number} amount - 금액
 * @param {number} taxRate - 세율 (0~1)
 * @returns {number} 세금 금액 (반올림)
 */
export const calculateTaxAmount = (amount, taxRate) => {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
  if (typeof taxRate !== 'number' || isNaN(taxRate)) return 0;
  if (taxRate < 0) taxRate = 0;
  if (taxRate > 1) taxRate = 1;

  return Math.round(amount * taxRate);
};

/**
 * 학생의 총 주급 계산 (여러 직업 합산)
 * @param {Array<string>} selectedJobIds - 학생이 선택한 직업 ID 배열
 * @param {Array<{id: string, weeklySalary: number}>} allJobs - 전체 직업 목록
 * @returns {number} 총 주급
 */
export const calculateTotalWeeklySalary = (selectedJobIds, allJobs) => {
  if (!Array.isArray(selectedJobIds) || selectedJobIds.length === 0) return 0;
  if (!Array.isArray(allJobs) || allJobs.length === 0) return 0;

  return selectedJobIds.reduce((total, jobId) => {
    const job = allJobs.find(j => j.id === jobId);
    if (job && typeof job.weeklySalary === 'number') {
      return total + job.weeklySalary;
    }
    return total;
  }, 0);
};

/**
 * 주급 인상 계산
 * @param {number} currentSalary - 현재 주급
 * @param {number} increaseRate - 인상률 (%, 예: 3 = 3%)
 * @returns {number} 인상된 주급 (반올림)
 */
export const calculateIncreasedSalary = (currentSalary, increaseRate) => {
  if (typeof currentSalary !== 'number' || isNaN(currentSalary) || currentSalary <= 0) return 0;
  if (typeof increaseRate !== 'number' || isNaN(increaseRate)) return currentSalary;

  const multiplier = 1 + increaseRate / 100;
  return Math.round(currentSalary * multiplier);
};

/**
 * 주급 지급 결과 계산 (전체 학생)
 * @param {Array} students - 학생 목록 [{id, selectedJobIds, ...}]
 * @param {Array} jobs - 직업 목록 [{id, weeklySalary, ...}]
 * @param {number} taxRate - 세율 (0~1)
 * @returns {{paidCount: number, totalPaid: number, details: Array}}
 */
export const calculatePayrollResult = (students, jobs, taxRate) => {
  if (!Array.isArray(students)) return { paidCount: 0, totalPaid: 0, details: [] };
  if (!Array.isArray(jobs)) jobs = [];
  if (typeof taxRate !== 'number') taxRate = 0;

  let paidCount = 0;
  let totalPaid = 0;
  const details = [];

  for (const student of students) {
    if (!student.selectedJobIds || student.selectedJobIds.length === 0) continue;

    const grossSalary = calculateTotalWeeklySalary(student.selectedJobIds, jobs);
    if (grossSalary <= 0) continue;

    const taxAmount = calculateTaxAmount(grossSalary, taxRate);
    const netSalary = grossSalary - taxAmount;

    paidCount++;
    totalPaid += netSalary;
    details.push({
      studentId: student.id,
      studentName: student.name,
      grossSalary,
      taxAmount,
      netSalary,
    });
  }

  return { paidCount, totalPaid, details };
};
