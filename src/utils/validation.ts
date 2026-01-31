// src/utils/validation.ts - 입력 검증 유틸리티

/**
 * 금액 검증 옵션 인터페이스
 */
export interface AmountValidationOptions {
  /** 최소값 (기본: 0) */
  min?: number;
  /** 최대값 (기본: Number.MAX_SAFE_INTEGER) */
  max?: number;
  /** 0 허용 여부 (기본: false) */
  allowZero?: boolean;
  /** 필드 이름 (에러 메시지용, 기본: '금액') */
  fieldName?: string;
}

/**
 * 수량 검증 옵션 인터페이스
 */
export interface QuantityValidationOptions {
  /** 최소값 (기본: 1) */
  min?: number;
  /** 최대값 (기본: Number.MAX_SAFE_INTEGER) */
  max?: number;
  /** 필드 이름 (에러 메시지용, 기본: '수량') */
  fieldName?: string;
}

/**
 * 퍼센트 검증 옵션 인터페이스
 */
export interface PercentValidationOptions {
  /** 최소값 (기본: 0) */
  min?: number;
  /** 최대값 (기본: 100) */
  max?: number;
  /** 필드 이름 (에러 메시지용, 기본: '퍼센트') */
  fieldName?: string;
}

/**
 * 문자열 검증 옵션 인터페이스
 */
export interface StringValidationOptions {
  /** 최소 길이 (기본: 0) */
  minLength?: number;
  /** 최대 길이 (기본: 1000) */
  maxLength?: number;
  /** 빈 문자열 허용 여부 (기본: false) */
  allowEmpty?: boolean;
  /** 필드 이름 (에러 메시지용, 기본: '입력값') */
  fieldName?: string;
}

/**
 * 배열 검증 옵션 인터페이스
 */
export interface ArrayValidationOptions {
  /** 최소 길이 (기본: 0) */
  minLength?: number;
  /** 최대 길이 (기본: Number.MAX_SAFE_INTEGER) */
  maxLength?: number;
  /** 빈 배열 허용 여부 (기본: false) */
  allowEmpty?: boolean;
  /** 필드 이름 (에러 메시지용, 기본: '배열') */
  fieldName?: string;
}

/**
 * 금액 검증 및 정규화
 * @param amount - 검증할 금액
 * @param options - 검증 옵션
 * @returns 검증된 금액 (정수)
 * @throws {Error} 검증 실패 시
 */
export const validateAmount = (
  amount: number | string,
  options: AmountValidationOptions = {}
): number => {
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
 * @param quantity - 검증할 수량
 * @param options - 검증 옵션
 * @returns 검증된 수량 (정수)
 * @throws {Error} 검증 실패 시
 */
export const validateQuantity = (
  quantity: number | string,
  options: QuantityValidationOptions = {}
): number => {
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
 * @param percent - 검증할 퍼센트
 * @param options - 검증 옵션
 * @returns 검증된 퍼센트
 * @throws {Error} 검증 실패 시
 */
export const validatePercent = (
  percent: number | string,
  options: PercentValidationOptions = {}
): number => {
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
 * @param currentBalance - 현재 잔액
 * @param requiredAmount - 필요한 금액
 * @param fieldName - 필드 이름 (에러 메시지용, 기본: '잔액')
 * @throws {Error} 잔액 부족 시
 */
export const validateSufficientBalance = (
  currentBalance: number | string,
  requiredAmount: number | string,
  fieldName: string = '잔액'
): void => {
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
 * @param value - 검증할 문자열
 * @param options - 검증 옵션
 * @returns 검증된 문자열 (trim 적용)
 * @throws {Error} 검증 실패 시
 */
export const validateString = (
  value: string,
  options: StringValidationOptions = {}
): string => {
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
 * @param value - 검증할 배열
 * @param options - 검증 옵션
 * @returns 검증된 배열
 * @throws {Error} 검증 실패 시
 */
export const validateArray = <T = unknown>(
  value: T[],
  options: ArrayValidationOptions = {}
): T[] => {
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
