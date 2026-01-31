// src/utils/numberFormatter.ts

/**
 * 한국 숫자 단위 정의
 */
interface KoreanUnit {
  /** 단위 값 (10의 거듭제곱) */
  value: number;
  /** 단위 이름 (만, 억, 조, 경, 단) */
  name: string;
}

/**
 * 숫자를 한국 단위 (만, 억, 조, 경, 단 등)로 포맷팅합니다.
 * @param number - 포맷팅할 숫자 또는 숫자 문자열
 * @param unit - 숫자 뒤에 붙일 단위 문자열 (예: '원', '개')
 * @returns 한국 단위로 포맷팅된 문자열
 *
 * @example
 * ```ts
 * formatKoreanNumber(22766445, '원')  // "2276만 6445원"
 * formatKoreanNumber(1234567890, '원') // "12억 3456만 7890원"
 * formatKoreanNumber(0, '원')          // "0원"
 * formatKoreanNumber(-1500, '원')      // "-1500원"
 * ```
 */
export const formatKoreanNumber = (number: number | string, unit: string = ""): string => {
  // null, undefined 처리
  if (number === null || number === undefined || number === "") {
    return "0" + unit;
  }

  // 문자열인 경우 숫자로 변환
  let num = number;
  if (typeof num === "string") {
    // 쉼표와 기존 단위 제거
    num = num.replace(/[,원개]/g, "").trim();
    const parsed = parseFloat(num);
    if (isNaN(parsed)) {
      return "0" + unit;
    }
    num = parsed;
  }

  // 0인 경우
  if (num === 0) {
    return "0" + unit;
  }

  // 음수 처리
  const isNegative = num < 0;
  const absNumber = Math.abs(num);

  const units: KoreanUnit[] = [
    { value: 1e20, name: "단" },
    { value: 1e16, name: "경" },
    { value: 1e12, name: "조" },
    { value: 1e8, name: "억" },
    { value: 1e4, name: "만" },
  ];

  const resultParts: string[] = [];
  let remaining = absNumber;

  // 큰 단위부터 처리
  for (const { value, name } of units) {
    if (remaining >= value) {
      const quotient = Math.floor(remaining / value);
      resultParts.push(`${quotient}${name}`); // 쉼표(,)를 추가하는 toLocaleString 제거
      remaining %= value;
    }
  }

  // 만 단위 미만 처리
  if (remaining > 0) {
    // 소수점 처리
    if (remaining % 1 !== 0) {
      resultParts.push(remaining.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
    } else {
      resultParts.push(Math.floor(remaining).toString()); // 쉼표(,)를 추가하는 toLocaleString 제거
    }
  }

  // 결과 조합
  let result = resultParts.join(" ");

  // 단위 추가
  if (unit) {
    result += unit;
  }

  // 음수 기호 추가
  if (isNegative) {
    result = "-" + result;
  }

  return result;
};

/**
 * 금액을 한국식 통화 형식으로 포맷팅합니다
 * @param amount - 포맷팅할 금액
 * @returns 포맷팅된 통화 문자열
 *
 * @example
 * ```ts
 * formatKoreanCurrency(22766445)     // "2276만 6445원"
 * formatKoreanCurrency(19508239)     // "1950만 8239원"
 * formatKoreanCurrency(1500)         // "1500원"
 * formatKoreanCurrency(123456789012) // "1234억 5678만 9012원"
 * ```
 */
export const formatKoreanCurrency = (amount: number | string): string => {
  return formatKoreanNumber(amount, "원");
};

/**
 * 수량을 한국식 형식으로 포맷팅합니다
 * @param quantity - 포맷팅할 수량
 * @returns 포맷팅된 수량 문자열
 *
 * @example
 * ```ts
 * formatKoreanQuantity(782)  // "782"
 * formatKoreanQuantity(38)   // "38"
 * formatKoreanQuantity(12345) // "1만 2345"
 * ```
 */
export const formatKoreanQuantity = (quantity: number | string): string => {
  return formatKoreanNumber(quantity, "");
};

/**
 * 쿠폰 개수를 포맷팅합니다
 * @param count - 포맷팅할 개수
 * @returns 포맷팅된 개수 문자열
 *
 * @example
 * ```ts
 * formatCouponCount(782)  // "782개"
 * formatCouponCount(38)   // "38개"
 * formatCouponCount(12345) // "1만 2345개"
 * ```
 */
export const formatCouponCount = (count: number | string): string => {
  return formatKoreanNumber(count, "개");
};

// React 컴포넌트에서 사용 예제 (주석으로 참고용):
/*
import { formatKoreanCurrency, formatKoreanQuantity, formatCouponCount } from './utils/numberFormatter';

import { logger } from "../utils/logger";
const data = {
  totalAssets: 22766445,
  couponRemaining: 38,
  targetAmount: 1500,
  currentCoupons: 782,
  deposit: 19508239,
  profit: 1100
};

// 사용법:
formatKoreanCurrency(data.totalAssets)     // "2276만 6445원"
formatCouponCount(data.couponRemaining)    // "38개"
formatKoreanCurrency(data.deposit)        // "1950만 8239원"
formatCouponCount(data.currentCoupons)     // "782개"
formatCouponCount(data.targetAmount)       // "1500개"
formatKoreanCurrency(data.profit)         // "1100원"
*/

// 테스트 예제 (주석 처리됨)
// logger.log(formatKoreanCurrency(22766445));     // "2276만 6445원"
// logger.log(formatKoreanCurrency(19508239));     // "1950만 8239원"
// logger.log(formatKoreanCurrency(1500));         // "1500원"
// logger.log(formatKoreanCurrency(1100));         // "1100원"
// logger.log(formatKoreanCurrency(123456789012)); // "1234억 5678만 9012원"
// logger.log(formatCouponCount(782));             // "782개"
// logger.log(formatCouponCount(38));              // "38개"
