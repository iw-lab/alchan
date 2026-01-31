// src/test/utils/transactionCalculator.test.js
// 송금/거래 계산 로직 테스트

import { describe, it, expect } from 'vitest';
import {
  validateTransfer,
  calculateTransferAmount,
  calculatePercentageAmount,
  calculateBalancesAfterTransfer,
  calculateBulkTransfer,
  calculateBulkTransferByPercentage,
} from '../../utils/transactionCalculator';

describe('transactionCalculator', () => {
  // ========================================
  // validateTransfer (송금 유효성 검증)
  // ========================================
  describe('validateTransfer', () => {
    it('충분한 잔액일 때 유효', () => {
      const result = validateTransfer(10000, 5000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('잔액과 동일한 금액 송금 가능', () => {
      const result = validateTransfer(10000, 10000);
      expect(result.valid).toBe(true);
    });

    it('잔액 부족시 에러', () => {
      const result = validateTransfer(5000, 10000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('잔액이 부족합니다.');
    });

    it('0원 송금 불가', () => {
      const result = validateTransfer(10000, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('금액은 0보다 커야 합니다.');
    });

    it('음수 금액 송금 불가', () => {
      const result = validateTransfer(10000, -1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('금액은 0보다 커야 합니다.');
    });

    it('유효하지 않은 금액 처리', () => {
      expect(validateTransfer(10000, undefined).valid).toBe(false);
      expect(validateTransfer(10000, null).valid).toBe(false);
      expect(validateTransfer(10000, 'abc').valid).toBe(false);
      expect(validateTransfer(10000, NaN).valid).toBe(false);
    });

    it('유효하지 않은 잔액 처리', () => {
      const result = validateTransfer(undefined, 5000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('잔액 정보가 유효하지 않습니다.');
    });
  });

  // ========================================
  // calculateTransferAmount (세금 포함 송금액 계산)
  // ========================================
  describe('calculateTransferAmount', () => {
    it('세금 10%일 때 계산', () => {
      const result = calculateTransferAmount(10000, 10);
      expect(result.grossAmount).toBe(10000);
      expect(result.taxAmount).toBe(1000);
      expect(result.netAmount).toBe(9000);
    });

    it('세금 0%일 때 전액 전송', () => {
      const result = calculateTransferAmount(10000, 0);
      expect(result.grossAmount).toBe(10000);
      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(10000);
    });

    it('세금 100%일 때 0원 전송', () => {
      const result = calculateTransferAmount(10000, 100);
      expect(result.netAmount).toBe(0);
      expect(result.taxAmount).toBe(10000);
    });

    it('세율 미지정시 세금 없음', () => {
      const result = calculateTransferAmount(10000);
      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(10000);
    });

    it('소수점 세금은 내림', () => {
      // 1000 * 3 / 100 = 30
      const result = calculateTransferAmount(1000, 3);
      expect(result.taxAmount).toBe(30);
      expect(result.netAmount).toBe(970);
    });

    it('0원 또는 음수 금액은 모두 0', () => {
      expect(calculateTransferAmount(0, 10)).toEqual({ grossAmount: 0, taxAmount: 0, netAmount: 0 });
      expect(calculateTransferAmount(-1000, 10)).toEqual({ grossAmount: 0, taxAmount: 0, netAmount: 0 });
    });
  });

  // ========================================
  // calculatePercentageAmount (퍼센트 기반 금액)
  // ========================================
  describe('calculatePercentageAmount', () => {
    it('10% 계산', () => {
      const result = calculatePercentageAmount(10000, 10);
      expect(result).toBe(1000);
    });

    it('50% 계산', () => {
      const result = calculatePercentageAmount(10000, 50);
      expect(result).toBe(5000);
    });

    it('100% 계산', () => {
      const result = calculatePercentageAmount(10000, 100);
      expect(result).toBe(10000);
    });

    it('0% 계산', () => {
      const result = calculatePercentageAmount(10000, 0);
      expect(result).toBe(0);
    });

    it('소수점은 내림', () => {
      // 333 * 10 / 100 = 33.3 -> 33
      const result = calculatePercentageAmount(333, 10);
      expect(result).toBe(33);
    });

    it('음수 잔액은 0', () => {
      const result = calculatePercentageAmount(-1000, 10);
      expect(result).toBe(0);
    });

    it('100% 초과 퍼센트는 100%로 제한', () => {
      const result = calculatePercentageAmount(10000, 150);
      expect(result).toBe(10000);
    });
  });

  // ========================================
  // calculateBalancesAfterTransfer (송금 후 잔액)
  // ========================================
  describe('calculateBalancesAfterTransfer', () => {
    it('세금 없이 송금', () => {
      const result = calculateBalancesAfterTransfer(10000, 5000, 3000, 0);
      expect(result.senderNewBalance).toBe(7000);  // 10000 - 3000
      expect(result.receiverNewBalance).toBe(8000);  // 5000 + 3000
      expect(result.taxAmount).toBe(0);
      expect(result.error).toBeNull();
    });

    it('세금 10%로 송금', () => {
      const result = calculateBalancesAfterTransfer(10000, 5000, 3000, 10);
      expect(result.senderNewBalance).toBe(7000);  // 10000 - 3000
      expect(result.receiverNewBalance).toBe(7700);  // 5000 + 2700 (세금 300 제외)
      expect(result.taxAmount).toBe(300);
      expect(result.error).toBeNull();
    });

    it('잔액 부족시 변화 없음', () => {
      const result = calculateBalancesAfterTransfer(1000, 5000, 3000, 0);
      expect(result.senderNewBalance).toBe(1000);
      expect(result.receiverNewBalance).toBe(5000);
      expect(result.error).toBe('잔액이 부족합니다.');
    });

    it('전액 송금', () => {
      const result = calculateBalancesAfterTransfer(10000, 0, 10000, 0);
      expect(result.senderNewBalance).toBe(0);
      expect(result.receiverNewBalance).toBe(10000);
    });
  });

  // ========================================
  // calculateBulkTransfer (다중 송금)
  // ========================================
  describe('calculateBulkTransfer', () => {
    const receivers = [
      { id: 'user1', cash: 1000 },
      { id: 'user2', cash: 2000 },
      { id: 'user3', cash: 3000 },
    ];

    it('3명에게 각 1000원씩 송금 (세금 없음)', () => {
      const result = calculateBulkTransfer(10000, receivers, 1000, 0);
      expect(result.totalSent).toBe(3000);
      expect(result.totalReceived).toBe(3000);
      expect(result.totalTax).toBe(0);
      expect(result.senderNewBalance).toBe(7000);
      expect(result.results).toHaveLength(3);
      expect(result.error).toBeNull();
    });

    it('3명에게 각 1000원씩 송금 (세금 10%)', () => {
      const result = calculateBulkTransfer(10000, receivers, 1000, 10);
      expect(result.totalSent).toBe(3000);
      expect(result.totalReceived).toBe(2700);  // 900 * 3
      expect(result.totalTax).toBe(300);  // 100 * 3
      expect(result.senderNewBalance).toBe(7000);
    });

    it('잔액 부족시 에러', () => {
      const result = calculateBulkTransfer(1000, receivers, 1000, 0);
      expect(result.totalSent).toBe(0);
      expect(result.error).toBe('잔액이 부족합니다.');
    });

    it('빈 수신자 목록 에러', () => {
      const result = calculateBulkTransfer(10000, [], 1000, 0);
      expect(result.error).toBe('받는 사람이 없습니다.');
    });

    it('0원 송금 에러', () => {
      const result = calculateBulkTransfer(10000, receivers, 0, 0);
      expect(result.error).toBe('유효한 금액을 입력하세요.');
    });

    it('각 수신자별 결과 확인', () => {
      const result = calculateBulkTransfer(10000, receivers, 1000, 0);
      expect(result.results[0]).toEqual({
        receiverId: 'user1',
        oldBalance: 1000,
        newBalance: 2000,
        received: 1000,
      });
    });
  });

  // ========================================
  // calculateBulkTransferByPercentage (퍼센트 기반 다중 송금)
  // ========================================
  describe('calculateBulkTransferByPercentage', () => {
    const receivers = [
      { id: 'user1', cash: 10000 },
      { id: 'user2', cash: 20000 },
      { id: 'user3', cash: 30000 },
    ];

    it('각 잔액의 10%씩 송금', () => {
      // 총 필요: 1000 + 2000 + 3000 = 6000
      const result = calculateBulkTransferByPercentage(100000, receivers, 10, 0);
      expect(result.totalSent).toBe(6000);
      expect(result.totalReceived).toBe(6000);
      expect(result.senderNewBalance).toBe(94000);
      expect(result.error).toBeNull();
    });

    it('각 잔액의 10%씩 송금 (세금 10%)', () => {
      const result = calculateBulkTransferByPercentage(100000, receivers, 10, 10);
      expect(result.totalSent).toBe(6000);
      expect(result.totalReceived).toBe(5400);  // 6000 - 600
      expect(result.totalTax).toBe(600);
    });

    it('잔액 부족시 에러', () => {
      const result = calculateBulkTransferByPercentage(1000, receivers, 10, 0);
      expect(result.error).toBe('잔액이 부족합니다.');
    });

    it('유효하지 않은 퍼센트 에러', () => {
      expect(calculateBulkTransferByPercentage(10000, receivers, 0, 0).error)
        .toBe('유효한 퍼센트를 입력하세요 (1~100).');
      expect(calculateBulkTransferByPercentage(10000, receivers, 101, 0).error)
        .toBe('유효한 퍼센트를 입력하세요 (1~100).');
    });

    it('각 수신자별 결과 확인', () => {
      const result = calculateBulkTransferByPercentage(100000, receivers, 10, 0);
      expect(result.results[0]).toEqual({
        receiverId: 'user1',
        oldBalance: 10000,
        newBalance: 11000,  // 10000 + 1000
        received: 1000,
        baseAmount: 1000,
      });
      expect(result.results[1]).toEqual({
        receiverId: 'user2',
        oldBalance: 20000,
        newBalance: 22000,  // 20000 + 2000
        received: 2000,
        baseAmount: 2000,
      });
    });
  });
});
