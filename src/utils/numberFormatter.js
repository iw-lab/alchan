// src/utils/numberFormatter.js

/**
 * 숫자를 한국 단위 (만, 억, 조, 경, 단 등)로 포맷팅합니다.
 * @param {number|string} number - 포맷팅할 숫자 또는 숫자 문자열
 * @param {string} unit - 숫자 뒤에 붙일 단위 문자열 (예: '원', '개')
 * @returns {string} 한국 단위로 포맷팅된 문자열
 */
export const formatKoreanNumber = (number, unit = "") => {
  // null, undefined 처리
  if (number === null || number === undefined || number === "") {
    return "0" + unit;
  }

  // 문자열인 경우 숫자로 변환
  let num = number;
  if (typeof num === "string") {
    // 쉼표와 기존 단위 제거
    num = num.replace(/[,원개]/g, "").trim();
    num = parseFloat(num);
    if (isNaN(num)) {
      return "0" + unit;
    }
  }

  // 0인 경우
  if (num === 0) {
    return "0" + unit;
  }

  // 음수 처리
  const isNegative = num < 0;
  const absNumber = Math.abs(num);

  const units = [
    { value: 1e20, name: "단" },
    { value: 1e16, name: "경" },
    { value: 1e12, name: "조" },
    { value: 1e8, name: "억" },
    { value: 1e4, name: "만" },
  ];

  const resultParts = [];
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
      resultParts.push(Math.floor(remaining)); // 쉼표(,)를 추가하는 toLocaleString 제거
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
 * @param {number|string} amount - 포맷팅할 금액
 * @returns {string} 포맷팅된 통화 문자열
 */
export const formatKoreanCurrency = (amount) => {
  return formatKoreanNumber(amount, "원");
};

/**
 * 수량을 한국식 형식으로 포맷팅합니다
 * @param {number|string} quantity - 포맷팅할 수량
 * @returns {string} 포맷팅된 수량 문자열
 */
export const formatKoreanQuantity = (quantity) => {
  return formatKoreanNumber(quantity, "");
};

/**
 * 쿠폰 개수를 포맷팅합니다
 * @param {number|string} count - 포맷팅할 개수
 * @returns {string} 포맷팅된 개수 문자열
 */
export const formatCouponCount = (count) => {
  return formatKoreanNumber(count, "개");
};

// React 컴포넌트에서 사용 예제 (주석으로 참고용):
/*
import { formatKoreanCurrency, formatKoreanQuantity, formatCouponCount } from './utils/numberFormatter';

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
// console.log(formatKoreanCurrency(22766445));     // "2276만 6445원"
// console.log(formatKoreanCurrency(19508239));     // "1950만 8239원"
// console.log(formatKoreanCurrency(1500));         // "1500원"
// console.log(formatKoreanCurrency(1100));         // "1100원"
// console.log(formatKoreanCurrency(123456789012)); // "1234억 5678만 9012원"
// console.log(formatCouponCount(782));             // "782개"
// console.log(formatCouponCount(38));              // "38개"