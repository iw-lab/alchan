// src/test/utils/salaryCalculator.test.js
// 급여 계산 로직 테스트

import { describe, it, expect } from 'vitest';
import {
  calculateNetSalary,
  calculateTaxAmount,
  calculateTotalWeeklySalary,
  calculateIncreasedSalary,
  calculatePayrollResult,
} from '../../utils/salaryCalculator';

describe('salaryCalculator', () => {
  // ========================================
  // calculateNetSalary (세후 급여 계산)
  // ========================================
  describe('calculateNetSalary', () => {
    it('세금 10%가 정확히 공제되어야 함', () => {
      const result = calculateNetSalary(10000, 0.1);
      expect(result).toBe(9000);
    });

    it('세금 0%면 전액 지급', () => {
      const result = calculateNetSalary(10000, 0);
      expect(result).toBe(10000);
    });

    it('세금 100%면 0원', () => {
      const result = calculateNetSalary(10000, 1);
      expect(result).toBe(0);
    });

    it('급여가 0원이면 0원', () => {
      const result = calculateNetSalary(0, 0.1);
      expect(result).toBe(0);
    });

    it('음수 급여는 0원 반환', () => {
      const result = calculateNetSalary(-5000, 0.1);
      expect(result).toBe(0);
    });

    it('음수 세율은 0%로 처리', () => {
      const result = calculateNetSalary(10000, -0.1);
      expect(result).toBe(10000);
    });

    it('100% 초과 세율은 100%로 처리', () => {
      const result = calculateNetSalary(10000, 1.5);
      expect(result).toBe(0);
    });

    it('소수점 급여도 정확히 계산 (반올림)', () => {
      // 15000 * 0.1 = 1500 (세금)
      const result = calculateNetSalary(15000, 0.1);
      expect(result).toBe(13500);
    });

    it('유효하지 않은 입력은 0 반환', () => {
      expect(calculateNetSalary(undefined, 0.1)).toBe(0);
      expect(calculateNetSalary(null, 0.1)).toBe(0);
      expect(calculateNetSalary('invalid', 0.1)).toBe(0);
      expect(calculateNetSalary(NaN, 0.1)).toBe(0);
    });

    it('유효하지 않은 세율은 원금 반환', () => {
      expect(calculateNetSalary(10000, undefined)).toBe(10000);
      expect(calculateNetSalary(10000, null)).toBe(10000);
      expect(calculateNetSalary(10000, 'invalid')).toBe(10000);
      expect(calculateNetSalary(10000, NaN)).toBe(10000);
    });
  });

  // ========================================
  // calculateTaxAmount (세금 금액 계산)
  // ========================================
  describe('calculateTaxAmount', () => {
    it('10% 세금 정확히 계산', () => {
      const result = calculateTaxAmount(10000, 0.1);
      expect(result).toBe(1000);
    });

    it('3% 세금 정확히 계산', () => {
      const result = calculateTaxAmount(10000, 0.03);
      expect(result).toBe(300);
    });

    it('0% 세금은 0원', () => {
      const result = calculateTaxAmount(10000, 0);
      expect(result).toBe(0);
    });

    it('음수 금액은 0원', () => {
      const result = calculateTaxAmount(-5000, 0.1);
      expect(result).toBe(0);
    });

    it('반올림 처리 확인', () => {
      // 333 * 0.1 = 33.3 -> 33 (반올림)
      const result = calculateTaxAmount(333, 0.1);
      expect(result).toBe(33);
    });
  });

  // ========================================
  // calculateTotalWeeklySalary (총 주급 계산)
  // ========================================
  describe('calculateTotalWeeklySalary', () => {
    const mockJobs = [
      { id: 'job1', weeklySalary: 5000 },
      { id: 'job2', weeklySalary: 3000 },
      { id: 'job3', weeklySalary: 2000 },
    ];

    it('단일 직업 주급 계산', () => {
      const result = calculateTotalWeeklySalary(['job1'], mockJobs);
      expect(result).toBe(5000);
    });

    it('다중 직업 주급 합산', () => {
      const result = calculateTotalWeeklySalary(['job1', 'job2'], mockJobs);
      expect(result).toBe(8000);
    });

    it('모든 직업 주급 합산', () => {
      const result = calculateTotalWeeklySalary(['job1', 'job2', 'job3'], mockJobs);
      expect(result).toBe(10000);
    });

    it('빈 직업 배열은 0원', () => {
      const result = calculateTotalWeeklySalary([], mockJobs);
      expect(result).toBe(0);
    });

    it('존재하지 않는 직업 ID는 무시', () => {
      const result = calculateTotalWeeklySalary(['job1', 'nonexistent'], mockJobs);
      expect(result).toBe(5000);
    });

    it('null 또는 undefined 입력 처리', () => {
      expect(calculateTotalWeeklySalary(null, mockJobs)).toBe(0);
      expect(calculateTotalWeeklySalary(undefined, mockJobs)).toBe(0);
      expect(calculateTotalWeeklySalary(['job1'], null)).toBe(0);
      expect(calculateTotalWeeklySalary(['job1'], undefined)).toBe(0);
    });
  });

  // ========================================
  // calculateIncreasedSalary (주급 인상 계산)
  // ========================================
  describe('calculateIncreasedSalary', () => {
    it('3% 인상 정확히 계산', () => {
      // 10000 * 1.03 = 10300
      const result = calculateIncreasedSalary(10000, 3);
      expect(result).toBe(10300);
    });

    it('5% 인상 정확히 계산', () => {
      // 10000 * 1.05 = 10500
      const result = calculateIncreasedSalary(10000, 5);
      expect(result).toBe(10500);
    });

    it('0% 인상은 원금 유지', () => {
      const result = calculateIncreasedSalary(10000, 0);
      expect(result).toBe(10000);
    });

    it('음수 인상률(감소)도 처리', () => {
      // 10000 * 0.95 = 9500
      const result = calculateIncreasedSalary(10000, -5);
      expect(result).toBe(9500);
    });

    it('소수점 결과는 반올림', () => {
      // 10000 * 1.033 = 10330
      const result = calculateIncreasedSalary(10000, 3.3);
      expect(result).toBe(10330);
    });

    it('0원 급여는 0원 반환', () => {
      const result = calculateIncreasedSalary(0, 3);
      expect(result).toBe(0);
    });
  });

  // ========================================
  // calculatePayrollResult (전체 급여 지급 결과)
  // ========================================
  describe('calculatePayrollResult', () => {
    const mockJobs = [
      { id: 'job1', weeklySalary: 10000 },
      { id: 'job2', weeklySalary: 5000 },
    ];

    const mockStudents = [
      { id: 'student1', name: '철수', selectedJobIds: ['job1'] },
      { id: 'student2', name: '영희', selectedJobIds: ['job2'] },
      { id: 'student3', name: '민수', selectedJobIds: ['job1', 'job2'] },
      { id: 'student4', name: '직업없음', selectedJobIds: [] },
      { id: 'student5', name: '직업없음2', selectedJobIds: null },
    ];

    it('전체 급여 지급 결과 계산', () => {
      const result = calculatePayrollResult(mockStudents, mockJobs, 0.1);

      // 철수: 10000 - 1000(세금) = 9000
      // 영희: 5000 - 500(세금) = 4500
      // 민수: 15000 - 1500(세금) = 13500
      // 총합: 27000
      expect(result.paidCount).toBe(3);
      expect(result.totalPaid).toBe(27000);
      expect(result.details).toHaveLength(3);
    });

    it('세금 0%일 때 결과', () => {
      const result = calculatePayrollResult(mockStudents, mockJobs, 0);

      expect(result.paidCount).toBe(3);
      expect(result.totalPaid).toBe(30000); // 10000 + 5000 + 15000
    });

    it('직업 없는 학생은 제외', () => {
      const studentsNoJobs = [
        { id: 'student1', name: '철수', selectedJobIds: [] },
        { id: 'student2', name: '영희', selectedJobIds: null },
      ];
      const result = calculatePayrollResult(studentsNoJobs, mockJobs, 0.1);

      expect(result.paidCount).toBe(0);
      expect(result.totalPaid).toBe(0);
    });

    it('빈 학생 배열 처리', () => {
      const result = calculatePayrollResult([], mockJobs, 0.1);

      expect(result.paidCount).toBe(0);
      expect(result.totalPaid).toBe(0);
    });

    it('상세 정보(details) 확인', () => {
      const result = calculatePayrollResult(
        [{ id: 'student1', name: '철수', selectedJobIds: ['job1'] }],
        mockJobs,
        0.1
      );

      expect(result.details[0]).toEqual({
        studentId: 'student1',
        studentName: '철수',
        grossSalary: 10000,
        taxAmount: 1000,
        netSalary: 9000,
      });
    });
  });
});
