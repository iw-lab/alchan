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
    // 쉼표와 기존 단위 제거 (알찬, 원, 개 등)
    num = num
      .replace(/,/g, "")
      .replace(/알찬|원|개/g, "")
      .trim();
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
      resultParts.push(
        remaining.toLocaleString("ko-KR", { maximumFractionDigits: 2 }),
      );
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
 * @param {string} [unit] - 화폐 단위 (지정하지 않으면 getCurrencyUnit()의 값 사용)
 * @returns {string} 포맷팅된 통화 문자열
 */
export const formatKoreanCurrency = (amount, unit) => {
  const currencyUnit = unit !== undefined ? unit : getCurrencyUnit();
  return formatKoreanNumber(amount, currencyUnit);
};

// 전역 화폐 단위 저장소
let _globalCurrencyUnit = "알찬";

/**
 * 전역 화폐 단위를 설정합니다 (CurrencyContext에서 호출)
 * @param {string} unit - 새 화폐 단위
 */
export const setGlobalCurrencyUnit = (unit) => {
  _globalCurrencyUnit = unit || "알찬";
};

/**
 * 현재 전역 화폐 단위를 반환합니다
 * @returns {string} 현재 화폐 단위
 */
export const getCurrencyUnit = () => {
  return _globalCurrencyUnit;
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

/**
 * 법안 벌금 표시용 포맷 (2026-07-25 추가).
 * law.fine은 교사가 자유 입력하는 문자열이라 "1000만, 1억원"처럼 서술형일 수도, "1000000000"처럼
 * 숫자만일 수도 있다. 숫자만 들어온 경우에만 천단위 콤마 + 단위를 붙이고, 나머지는 원문을 보존한다.
 * (기존엔 문자열에 toLocaleString()을 호출해 사실상 no-op → "1000000000원"이 그대로 노출됐다)
 * @param {string|number|null|undefined} fine
 * @param {string} fallback 값이 없을 때 표시할 문자열
 * @returns {string}
 */
export const formatLawFine = (fine, fallback = "정보 없음") => {
  if (fine === null || fine === undefined) return fallback;
  const raw = String(fine).trim();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) {
    return `${Number(raw).toLocaleString()}${getCurrencyUnit()}`;
  }
  return raw;
};

/**
 * 콤마 구분 + 현재 화폐 단위로 금액을 포맷한다 (2026-07-25 추가).
 * 앱 전체 화폐 단위 통일용 — 페이지마다 "원"을 하드코딩하던 자리를 이걸로 대체한다.
 * (한글 큰 단위 표기가 필요하면 formatKoreanCurrency를 쓸 것)
 * @param {number|string} amount
 * @returns {string} 예: "197,916,192알찬"
 */
export const formatMoney = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `0${getCurrencyUnit()}`;
  return `${Math.round(n).toLocaleString()}${getCurrencyUnit()}`;
};

/**
 * 서버(Cloud Functions)가 만든 문구 속 화폐 단위를 현재 단위로 바꿔 표시한다 (2026-07-25 추가).
 *
 * 활동 로그·알림 문구는 CF가 문자열로 만들어 Firestore에 저장하는데(예: "파킹통장 입금 12,000원"),
 * functions 쪽엔 "원"이 하드코딩돼 있고 **이미 저장된 과거 로그는 서버를 고쳐도 바뀌지 않는다**.
 * 그래서 표시 시점에 치환한다 — 과거 기록까지 한 번에 정리된다.
 *
 * ⚠️ '원금'·'복원'·'지원'·'법원' 같은 단어의 '원'을 건드리면 안 되므로
 *    **숫자(또는 만/억/조) 바로 뒤에 오는 '원'만** 치환한다. 이 단어들의 '원'은 앞이 숫자가 아니다.
 *    예) "중도 해지: 예금 (원금 12,000원)" → "…(원금 12,000알찬)"  ← 앞의 '원금'은 그대로
 * @param {string|undefined|null} text
 * @returns {string}
 */
export const normalizeCurrencyText = (text) => {
  if (!text) return text === 0 ? "0" : text || "";
  const unit = getCurrencyUnit();
  if (unit === "원") return String(text);
  return String(text)
    .replace(/(\d)\s*원/g, `$1${unit}`)
    .replace(/([만억조])\s*원/g, `$1 ${unit}`);
};
