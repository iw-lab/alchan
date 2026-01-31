// src/test/utils/stockCalculator.test.js
// 주식 계산 로직 테스트

import { describe, it, expect } from 'vitest';
import {
  calculateBuyCost,
  calculateSellResult,
  calculateStockTax,
  validateBuy,
  validateSellLock,
  calculateNewAvgPrice,
  calculateReturnRate,
  calculateMarketIndex,
  COMMISSION_RATE,
  STOCK_TAX_RATE,
  BOND_TAX_RATE,
  HOLDING_LOCK_PERIOD,
} from '../../utils/stockCalculator';

describe('stockCalculator', () => {
  // ========================================
  // calculateBuyCost (매수 비용 계산)
  // ========================================
  describe('calculateBuyCost', () => {
    it('기본 매수 비용 계산 (0.3% 수수료)', () => {
      // 10000원 * 10주 = 100000원
      // 수수료: 100000 * 0.003 = 300원
      const result = calculateBuyCost(10000, 10);
      expect(result.totalPrice).toBe(100000);
      expect(result.commission).toBe(300);
      expect(result.totalCost).toBe(100300);
    });

    it('1주 매수', () => {
      const result = calculateBuyCost(50000, 1);
      expect(result.totalPrice).toBe(50000);
      expect(result.commission).toBe(150);  // 50000 * 0.003
      expect(result.totalCost).toBe(50150);
    });

    it('커스텀 수수료율', () => {
      // 수수료 1%
      const result = calculateBuyCost(10000, 10, 0.01);
      expect(result.totalPrice).toBe(100000);
      expect(result.commission).toBe(1000);  // 100000 * 0.01
      expect(result.totalCost).toBe(101000);
    });

    it('수수료 0%', () => {
      const result = calculateBuyCost(10000, 10, 0);
      expect(result.commission).toBe(0);
      expect(result.totalCost).toBe(100000);
    });

    it('유효하지 않은 입력은 0', () => {
      expect(calculateBuyCost(0, 10).totalCost).toBe(0);
      expect(calculateBuyCost(-1000, 10).totalCost).toBe(0);
      expect(calculateBuyCost(10000, 0).totalCost).toBe(0);
      expect(calculateBuyCost(10000, -5).totalCost).toBe(0);
    });
  });

  // ========================================
  // calculateSellResult (매도 결과 계산)
  // ========================================
  describe('calculateSellResult', () => {
    it('이익 발생시 세금 적용 (주식)', () => {
      // 매수: 10000원 * 10주 = 100000원
      // 매도: 15000원 * 10주 = 150000원
      // 수수료: 150000 * 0.003 = 450원
      // 이익: 150000 - 100000 - 450 = 49550원
      // 세금: 49550 * 0.22 = 10901원
      const result = calculateSellResult(15000, 10000, 10);
      expect(result.grossProceeds).toBe(150000);
      expect(result.commission).toBe(450);
      expect(result.profit).toBe(49550);
      expect(result.tax).toBe(10901);
      expect(result.netProceeds).toBe(138649);  // 150000 - 450 - 10901
    });

    it('손실시 세금 없음', () => {
      // 매수: 15000원, 매도: 10000원 (손실)
      const result = calculateSellResult(10000, 15000, 10);
      expect(result.profit).toBeLessThan(0);
      expect(result.tax).toBe(0);
    });

    it('본전일 때 세금 없음', () => {
      const result = calculateSellResult(10000, 10000, 10);
      // 수수료만 빠지므로 손실
      expect(result.tax).toBe(0);
    });

    it('채권 세율 적용 (15.4%)', () => {
      const result = calculateSellResult(15000, 10000, 10, COMMISSION_RATE, 'bond');
      expect(result.profit).toBe(49550);
      // 49550 * 0.154 = 7631
      expect(result.tax).toBe(7631);
    });

    it('1주만 매도', () => {
      const result = calculateSellResult(20000, 10000, 1);
      expect(result.grossProceeds).toBe(20000);
      expect(result.commission).toBe(60);  // 20000 * 0.003
      expect(result.profit).toBe(9940);  // 20000 - 10000 - 60
      expect(result.tax).toBe(2187);  // 9940 * 0.22 = 2186.8 -> 2187
    });
  });

  // ========================================
  // calculateStockTax (주식 세금 계산)
  // ========================================
  describe('calculateStockTax', () => {
    it('주식 양도세 22%', () => {
      const result = calculateStockTax(10000);
      expect(result).toBe(2200);
    });

    it('채권 이자소득세 15.4%', () => {
      const result = calculateStockTax(10000, 'bond');
      expect(result).toBe(1540);
    });

    it('이익 0이면 세금 0', () => {
      expect(calculateStockTax(0)).toBe(0);
    });

    it('손실(음수)이면 세금 0', () => {
      expect(calculateStockTax(-5000)).toBe(0);
    });

    it('소수점 반올림', () => {
      // 1000 * 0.22 = 220
      expect(calculateStockTax(1000)).toBe(220);
      // 1001 * 0.22 = 220.22 -> 220
      expect(calculateStockTax(1001)).toBe(220);
    });
  });

  // ========================================
  // validateBuy (매수 가능 여부)
  // ========================================
  describe('validateBuy', () => {
    it('충분한 현금으로 매수 가능', () => {
      // 10000원 * 10주 + 수수료 = 100300원 필요
      const result = validateBuy(200000, 10000, 10);
      expect(result.canBuy).toBe(true);
      expect(result.error).toBeNull();
    });

    it('딱 맞는 현금으로 매수 가능', () => {
      const result = validateBuy(100300, 10000, 10);
      expect(result.canBuy).toBe(true);
    });

    it('현금 부족', () => {
      const result = validateBuy(100000, 10000, 10);  // 100300원 필요
      expect(result.canBuy).toBe(false);
      expect(result.error).toBe('현금이 부족합니다.');
    });

    it('최대 매수 가능 수량 계산', () => {
      // 100000원으로 10000원짜리 몇 주?
      // 10000 * (1 + 0.003) = 10030원/주
      // 100000 / 10030 = 9.97 -> 9주
      const result = validateBuy(100000, 10000, 20);
      expect(result.maxQuantity).toBe(9);
    });

    it('유효하지 않은 수량', () => {
      expect(validateBuy(100000, 10000, 0).canBuy).toBe(false);
      expect(validateBuy(100000, 10000, -5).canBuy).toBe(false);
      expect(validateBuy(100000, 10000, 1.5).canBuy).toBe(false);  // 소수점 불가
    });

    it('유효하지 않은 가격', () => {
      expect(validateBuy(100000, 0, 10).canBuy).toBe(false);
      expect(validateBuy(100000, -1000, 10).canBuy).toBe(false);
    });

    it('현금 0원', () => {
      const result = validateBuy(0, 10000, 1);
      expect(result.canBuy).toBe(false);
      expect(result.maxQuantity).toBe(0);
    });
  });

  // ========================================
  // validateSellLock (매도 잠금 기간)
  // ========================================
  describe('validateSellLock', () => {
    it('잠금 기간 경과 후 매도 가능', () => {
      const lastBuyTime = Date.now() - (HOLDING_LOCK_PERIOD + 1000);  // 1시간 1초 전
      const result = validateSellLock(lastBuyTime);
      expect(result.canSell).toBe(true);
      expect(result.remainingTime).toBe(0);
    });

    it('잠금 기간 내 매도 불가', () => {
      const lastBuyTime = Date.now() - (30 * 60 * 1000);  // 30분 전
      const result = validateSellLock(lastBuyTime);
      expect(result.canSell).toBe(false);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThanOrEqual(30 * 60 * 1000);
    });

    it('방금 매수한 경우', () => {
      const lastBuyTime = Date.now();
      const result = validateSellLock(lastBuyTime);
      expect(result.canSell).toBe(false);
      expect(result.remainingTime).toBeGreaterThan(59 * 60 * 1000);  // 거의 1시간
    });

    it('lastBuyTime 없으면 매도 가능', () => {
      expect(validateSellLock(null).canSell).toBe(true);
      expect(validateSellLock(undefined).canSell).toBe(true);
    });

    it('Date 객체 지원', () => {
      const lastBuyTime = new Date(Date.now() - (HOLDING_LOCK_PERIOD + 1000));
      const result = validateSellLock(lastBuyTime);
      expect(result.canSell).toBe(true);
    });

    it('커스텀 잠금 기간', () => {
      const lastBuyTime = Date.now() - (10 * 60 * 1000);  // 10분 전
      const customLock = 5 * 60 * 1000;  // 5분 잠금
      const result = validateSellLock(lastBuyTime, customLock);
      expect(result.canSell).toBe(true);
    });
  });

  // ========================================
  // calculateNewAvgPrice (평균 매수가 계산)
  // ========================================
  describe('calculateNewAvgPrice', () => {
    it('추가 매수시 평균 매수가', () => {
      // 10주 * 10000원 = 100000원
      // 5주 * 12000원 = 60000원
      // 총: 15주, 160000원
      // 평균: 160000 / 15 = 10666.67 -> 10667원
      const result = calculateNewAvgPrice(10, 10000, 5, 12000);
      expect(result).toBe(10667);
    });

    it('첫 매수', () => {
      const result = calculateNewAvgPrice(0, 0, 10, 10000);
      expect(result).toBe(10000);
    });

    it('동일가 추가 매수', () => {
      const result = calculateNewAvgPrice(10, 10000, 5, 10000);
      expect(result).toBe(10000);
    });

    it('저가 추가 매수 (평단 낮아짐)', () => {
      const result = calculateNewAvgPrice(10, 10000, 10, 8000);
      // (100000 + 80000) / 20 = 9000
      expect(result).toBe(9000);
    });

    it('추가 매수 없으면 기존 평단 유지', () => {
      const result = calculateNewAvgPrice(10, 10000, 0, 12000);
      expect(result).toBe(10000);
    });
  });

  // ========================================
  // calculateReturnRate (수익률 계산)
  // ========================================
  describe('calculateReturnRate', () => {
    it('50% 수익', () => {
      const result = calculateReturnRate(15000, 10000);
      expect(result).toBe(50);
    });

    it('100% 수익 (2배)', () => {
      const result = calculateReturnRate(20000, 10000);
      expect(result).toBe(100);
    });

    it('50% 손실', () => {
      const result = calculateReturnRate(5000, 10000);
      expect(result).toBe(-50);
    });

    it('본전', () => {
      const result = calculateReturnRate(10000, 10000);
      expect(result).toBe(0);
    });

    it('매수가 0이면 0%', () => {
      const result = calculateReturnRate(10000, 0);
      expect(result).toBe(0);
    });
  });

  // ========================================
  // calculateMarketIndex (시장 지수)
  // ========================================
  describe('calculateMarketIndex', () => {
    it('기본 시장 지수 계산', () => {
      const stocks = [
        { price: 11000, initialPrice: 10000, isListed: true, productType: 'stock' },
        { price: 22000, initialPrice: 20000, isListed: true, productType: 'stock' },
      ];
      // 현재가 합: 33000, 초기가 합: 30000
      // 지수: (33000 / 30000) * 1000 = 1100
      const result = calculateMarketIndex(stocks);
      expect(result).toBe(1100);
    });

    it('하락장 지수', () => {
      const stocks = [
        { price: 9000, initialPrice: 10000, isListed: true, productType: 'stock' },
        { price: 18000, initialPrice: 20000, isListed: true, productType: 'stock' },
      ];
      // 현재가 합: 27000, 초기가 합: 30000
      // 지수: (27000 / 30000) * 1000 = 900
      const result = calculateMarketIndex(stocks);
      expect(result).toBe(900);
    });

    it('빈 배열이면 기본값 1000', () => {
      expect(calculateMarketIndex([])).toBe(1000);
    });

    it('상장 주식만 계산', () => {
      const stocks = [
        { price: 11000, initialPrice: 10000, isListed: true, productType: 'stock' },
        { price: 50000, initialPrice: 10000, isListed: false, productType: 'stock' },  // 비상장
      ];
      // 상장된 것만: 11000 / 10000 * 1000 = 1100
      const result = calculateMarketIndex(stocks);
      expect(result).toBe(1100);
    });

    it('ETF/채권 제외', () => {
      const stocks = [
        { price: 11000, initialPrice: 10000, isListed: true, productType: 'stock' },
        { price: 50000, initialPrice: 10000, isListed: true, productType: 'etf' },
        { price: 100000, initialPrice: 10000, isListed: true, productType: 'bond' },
      ];
      // 주식만: 11000 / 10000 * 1000 = 1100
      const result = calculateMarketIndex(stocks);
      expect(result).toBe(1100);
    });
  });

  // ========================================
  // 상수 확인
  // ========================================
  describe('상수 값 확인', () => {
    it('수수료율 0.3%', () => {
      expect(COMMISSION_RATE).toBe(0.003);
    });

    it('주식 세율 22%', () => {
      expect(STOCK_TAX_RATE).toBe(0.22);
    });

    it('채권 세율 15.4%', () => {
      expect(BOND_TAX_RATE).toBe(0.154);
    });

    it('보유 잠금 기간 1시간', () => {
      expect(HOLDING_LOCK_PERIOD).toBe(60 * 60 * 1000);
    });
  });
});
