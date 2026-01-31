// src/utils/validation.js - 입력 검증 유틸리티

/**
 * 금액 검증 및 정규화
 * @param {number|string} amount - 검증할 금액
 * @param {object} options - 검증 옵션
 * @returns {number} - 검증된 금액
 * @throws {Error} - 검증 실패 시
 */
export const validateAmount = (amount, options = {}) => {
  const {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    allowZero = false,
    fieldName = '금액'
  } = options;

  // 숫자로 변환
  const numAmount = Number(amount);

  // NaN 체크
  if (isNaN(numAmount)) {
    throw new Error(`${fieldName}는 유효한 숫자여야 합니다.`);
  }

  // 무한대 체크
  if (!isFinite(numAmount)) {
    throw new Error(`${fieldName}는 유한한 숫자여야 합니다.`);
  }

  // 음수 체크
  if (numAmount < 0) {
    throw new Error(`${fieldName}는 음수일 수 없습니다.`);
  }

  // 0 체크
  if (!allowZero && numAmount === 0) {
    throw new Error(`${fieldName}는 0보다 커야 합니다.`);
  }

  // 범위 체크
  if (numAmount < min) {
    throw new Error(`${fieldName}는 최소 ${min.toLocaleString()}원 이상이어야 합니다.`);
  }

  if (numAmount > max) {
    throw new Error(`${fieldName}는 최대 ${max.toLocaleString()}원을 초과할 수 없습니다.`);
  }

  // 정수로 변환 (소수점 제거)
  return Math.floor(numAmount);
};

/**
 * 수량 검증
 * @param {number|string} quantity - 검증할 수량
 * @param {object} options - 검증 옵션
 * @returns {number} - 검증된 수량
 * @throws {Error} - 검증 실패 시
 */
export const validateQuantity = (quantity, options = {}) => {
  const {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
    fieldName = '수량'
  } = options;

  const numQuantity = Number(quantity);

  if (isNaN(numQuantity) || !isFinite(numQuantity)) {
    throw new Error(`${fieldName}는 유효한 숫자여야 합니다.`);
  }

  if (numQuantity < min) {
    throw new Error(`${fieldName}는 최소 ${min}개 이상이어야 합니다.`);
  }

  if (numQuantity > max) {
    throw new Error(`${fieldName}는 최대 ${max}개를 초과할 수 없습니다.`);
  }

  // 정수로 변환
  const intQuantity = Math.floor(numQuantity);

  if (intQuantity !== numQuantity) {
    throw new Error(`${fieldName}는 정수여야 합니다.`);
  }

  return intQuantity;
};

/**
 * 퍼센트 검증
 * @param {number|string} percent - 검증할 퍼센트
 * @param {object} options - 검증 옵션
 * @returns {number} - 검증된 퍼센트
 * @throws {Error} - 검증 실패 시
 */
export const validatePercent = (percent, options = {}) => {
  const {
    min = 0,
    max = 100,
    fieldName = '퍼센트'
  } = options;

  const numPercent = Number(percent);

  if (isNaN(numPercent) || !isFinite(numPercent)) {
    throw new Error(`${fieldName}는 유효한 숫자여야 합니다.`);
  }

  if (numPercent < min || numPercent > max) {
    throw new Error(`${fieldName}는 ${min}%에서 ${max}% 사이여야 합니다.`);
  }

  return numPercent;
};

/**
 * 잔액 충분 여부 확인
 * @param {number} currentBalance - 현재 잔액
 * @param {number} requiredAmount - 필요한 금액
 * @param {string} fieldName - 필드 이름
 * @throws {Error} - 잔액 부족 시
 */
export const validateSufficientBalance = (currentBalance, requiredAmount, fieldName = '잔액') => {
  const balance = Number(currentBalance);
  const required = Number(requiredAmount);

  if (isNaN(balance) || isNaN(required)) {
    throw new Error('잔액 검증에 실패했습니다.');
  }

  if (balance < required) {
    throw new Error(
      `${fieldName}이 부족합니다. (보유: ${balance.toLocaleString()}원, 필요: ${required.toLocaleString()}원)`
    );
  }
};

/**
 * 문자열 검증
 * @param {string} value - 검증할 문자열
 * @param {object} options - 검증 옵션
 * @returns {string} - 검증된 문자열
 * @throws {Error} - 검증 실패 시
 */
export const validateString = (value, options = {}) => {
  const {
    minLength = 0,
    maxLength = 1000,
    allowEmpty = false,
    fieldName = '입력값'
  } = options;

  if (typeof value !== 'string') {
    throw new Error(`${fieldName}는 문자열이어야 합니다.`);
  }

  const trimmed = value.trim();

  if (!allowEmpty && trimmed.length === 0) {
    throw new Error(`${fieldName}를 입력해주세요.`);
  }

  if (trimmed.length < minLength) {
    throw new Error(`${fieldName}는 최소 ${minLength}자 이상이어야 합니다.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName}는 최대 ${maxLength}자를 초과할 수 없습니다.`);
  }

  return trimmed;
};

/**
 * 배열 검증
 * @param {Array} value - 검증할 배열
 * @param {object} options - 검증 옵션
 * @returns {Array} - 검증된 배열
 * @throws {Error} - 검증 실패 시
 */
export const validateArray = (value, options = {}) => {
  const {
    minLength = 0,
    maxLength = Number.MAX_SAFE_INTEGER,
    allowEmpty = false,
    fieldName = '배열'
  } = options;

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName}는 배열이어야 합니다.`);
  }

  if (!allowEmpty && value.length === 0) {
    throw new Error(`${fieldName}가 비어있습니다.`);
  }

  if (value.length < minLength) {
    throw new Error(`${fieldName}는 최소 ${minLength}개 이상이어야 합니다.`);
  }

  if (value.length > maxLength) {
    throw new Error(`${fieldName}는 최대 ${maxLength}개를 초과할 수 없습니다.`);
  }

  return value;
};
