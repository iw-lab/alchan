// src/test/utils/salaryRaise.test.js
// 기본급 주간 복리 인상 로직 테스트 (functions/salaryUtils.js 순수 함수)
//
// 복리는 수 주에 걸쳐 조용히 누적되므로 회귀가 즉시 드러나지 않는다.
// → 누적 정확성·클램프·0% 존중·기존 동작 보존을 순수 함수 단위로 고정한다.

import { describe, it, expect } from 'vitest';
import {
  SALARY,
  computeSalaryAmounts,
  computeEffectiveBase,
  nextBaseMultiplier,
} from '../../../functions/salaryUtils';

describe('기본급 주간 복리 인상', () => {
  describe('computeEffectiveBase', () => {
    it('배수 1이면 기준 기본급 그대로', () => {
      expect(computeEffectiveBase(1)).toBe(SALARY.BASE);
    });

    it('배수를 곱해 정수로 반올림', () => {
      expect(computeEffectiveBase(1.05)).toBe(2100000);
      expect(computeEffectiveBase(1.1025)).toBe(2205000);
    });

    it('배수가 없거나 이상값이면 기준 기본급으로 폴백', () => {
      expect(computeEffectiveBase(undefined)).toBe(SALARY.BASE);
      expect(computeEffectiveBase(NaN)).toBe(SALARY.BASE);
      expect(computeEffectiveBase(0)).toBe(SALARY.BASE);
      expect(computeEffectiveBase(-3)).toBe(SALARY.BASE);
      expect(computeEffectiveBase(Infinity)).toBe(SALARY.BASE);
    });

    it('상한(MAX_BASE)을 넘지 않음', () => {
      expect(computeEffectiveBase(1e9)).toBe(SALARY.MAX_BASE);
    });
  });

  describe('nextBaseMultiplier', () => {
    it('인상률만큼 복리로 증가', () => {
      expect(nextBaseMultiplier(1, 0.05)).toBeCloseTo(1.05, 10);
      expect(nextBaseMultiplier(1.05, 0.05)).toBeCloseTo(1.1025, 10);
    });

    it('인상률 0%면 배수가 그대로(인상 없음)', () => {
      expect(nextBaseMultiplier(1.2, 0)).toBe(1.2);
    });

    it('음수·NaN 인상률은 안전 처리(음수는 0으로 클램프)', () => {
      expect(nextBaseMultiplier(1.2, -0.5)).toBe(1.2);
      expect(nextBaseMultiplier(1.2, NaN)).toBeCloseTo(1.2 * (1 + SALARY.DEFAULT_RAISE_RATE), 10);
    });

    it('인상률 상한(MAX_RAISE_RATE)으로 클램프', () => {
      expect(nextBaseMultiplier(1, 99)).toBeCloseTo(1 + SALARY.MAX_RAISE_RATE, 10);
    });

    it('현재 배수가 이상값이면 1에서 시작', () => {
      expect(nextBaseMultiplier(NaN, 0.05)).toBeCloseTo(1.05, 10);
      expect(nextBaseMultiplier(-1, 0.05)).toBeCloseTo(1.05, 10);
    });

    it('무한 복리로 발산하지 않고 상한에 수렴', () => {
      let m = 1;
      for (let i = 0; i < 500; i++) m = nextBaseMultiplier(m, 1);
      expect(Number.isFinite(m)).toBe(true);
      expect(computeEffectiveBase(m)).toBeLessThanOrEqual(SALARY.MAX_BASE);
    });

    it('20주 5% 복리 누적이 기대값과 일치', () => {
      let m = 1;
      for (let i = 0; i < 20; i++) m = nextBaseMultiplier(m, 0.05);
      expect(computeEffectiveBase(m)).toBe(Math.round(SALARY.BASE * Math.pow(1.05, 20)));
    });
  });

  describe('computeSalaryAmounts — 인상 반영', () => {
    const jobMap = new Map();

    it('baseSalary 생략 시 기존 동작(200만) 보존 = 회귀 없음', () => {
      const r = computeSalaryAmounts(1, [], jobMap, 0);
      expect(r.grossSalary).toBe(SALARY.BASE);
      expect(r.netSalary).toBe(SALARY.BASE);
    });

    it('실효 기본급이 세전에 반영됨', () => {
      const r = computeSalaryAmounts(1, [], jobMap, 0, 2100000);
      expect(r.grossSalary).toBe(2100000);
    });

    it('인상은 기본급에만 — 직업가산은 고정', () => {
      // 직업 3개: 기본급(인상분) + 2 × 50만
      const r = computeSalaryAmounts(3, [], jobMap, 0, 2100000);
      expect(r.grossSalary).toBe(2100000 + 2 * SALARY.ADDITIONAL);
    });

    it('대통령 보너스는 인상 대상 아님(고정)', () => {
      const presidentJobs = new Map([['p1', { title: '대통령' }]]);
      const r = computeSalaryAmounts(1, ['p1'], presidentJobs, 0, 2100000);
      expect(r.grossSalary).toBe(2100000);
      expect(r.bonus).toBe(SALARY.PRESIDENT_BONUS);
      expect(r.totalGross).toBe(2100000 + SALARY.PRESIDENT_BONUS);
    });

    it('세금은 인상된 세전총액 기준으로 계산', () => {
      const r = computeSalaryAmounts(1, [], jobMap, 0.1, 2100000);
      expect(r.tax).toBe(210000);
      expect(r.netSalary).toBe(1890000);
    });

    it('이상한 baseSalary는 기준 기본급으로 폴백', () => {
      expect(computeSalaryAmounts(1, [], jobMap, 0, NaN).grossSalary).toBe(SALARY.BASE);
      expect(computeSalaryAmounts(1, [], jobMap, 0, -100).grossSalary).toBe(SALARY.BASE);
    });
  });
});
