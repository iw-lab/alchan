// src/utils/firestoreHelpers.js
// 공통 Firestore 헬퍼: 페이지네이션, 배치 조회(where __name__ in), 활동 로그, 유틸
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

import { logger } from "../utils/logger";

// ============================================================
// 🔥 공통 유틸리티 함수
// ============================================================

/**
 * Firestore Timestamp, Date, ISO 문자열, 숫자 등 다양한 형태의 타임스탬프를 Date 객체로 변환
 * @param {any} timestamp - 변환할 타임스탬프
 * @returns {Date}
 */
export function safeTimestampToDate(timestamp) {
  try {
    if (!timestamp) return new Date();
    if (timestamp instanceof Date) {
      return isNaN(timestamp.getTime()) ? new Date() : timestamp;
    }
    if (typeof timestamp.toDate === 'function') {
      const date = timestamp.toDate();
      return isNaN(date.getTime()) ? new Date() : date;
    }
    if (timestamp.seconds) {
      const date = new Date(timestamp.seconds * 1000);
      return isNaN(date.getTime()) ? new Date() : date;
    }
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? new Date() : date;
    }
    return new Date();
  } catch {
    return new Date();
  }
}

/**
 * localStorage 기반 Firestore 데이터 캐시 읽기
 * @param {string} key - 캐시 키
 * @param {string} userId - 사용자 ID
 * @param {number} cacheDuration - 캐시 유효 시간(ms)
 * @returns {any|null}
 */
export function getCachedFirestoreData(key, userId, cacheDuration) {
  try {
    const cached = localStorage.getItem(`firestore_cache_${key}_${userId}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheDuration) {
        return data;
      }
    }
  } catch (error) {
    logger.warn('[Cache] getCachedFirestoreData failed:', error);
  }
  return null;
}

/**
 * localStorage 기반 Firestore 데이터 캐시 쓰기
 * @param {string} key - 캐시 키
 * @param {string} userId - 사용자 ID
 * @param {any} data - 캐시할 데이터
 */
export function setCachedFirestoreData(key, userId, data) {
  try {
    localStorage.setItem(
      `firestore_cache_${key}_${userId}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch (error) {
    logger.warn('[Cache] setCachedFirestoreData failed:', error);
  }
}


// ============================================================
// 🔥 활동 로그 (현금 흐름) 헬퍼 함수
// ============================================================

/**
 * 활동 로그 타입 상수
 */
export const ACTIVITY_TYPES = {
  // 현금 관련
  CASH_INCOME: '현금 입금',
  CASH_EXPENSE: '현금 출금',
  TRANSFER_SEND: '송금 발송',
  TRANSFER_RECEIVE: '송금 수신',

  // 주식 관련
  STOCK_BUY: '주식 매수',
  STOCK_SELL: '주식 매도',

  // 아이템 관련
  ITEM_PURCHASE: '아이템 구매',
  ITEM_SELL: '아이템 판매',
  ITEM_USE: '아이템 사용',
  ITEM_MARKET_LIST: '아이템 시장 등록',
  ITEM_MARKET_BUY: '아이템 시장 구매',

  // 예금/대출 관련
  DEPOSIT_CREATE: '예금 가입',
  DEPOSIT_WITHDRAW: '예금 출금',
  DEPOSIT_MATURITY: '예금 만기',
  LOAN_CREATE: '대출 실행',
  LOAN_REPAY: '대출 상환',
  PARKING_DEPOSIT: '파킹통장 입금',
  PARKING_WITHDRAW: '파킹통장 출금',
  PARKING_INTEREST: '파킹통장 이자',

  // 쿠폰 관련
  COUPON_EARN: '쿠폰 획득',
  COUPON_USE: '쿠폰 사용',
  COUPON_GIVE: '쿠폰 지급',
  COUPON_DONATE: '쿠폰 기부',
  COUPON_GIFT_SEND: '쿠폰 선물',
  COUPON_GIFT_RECEIVE: '쿠폰 수신',

  // 게임 관련
  GAME_WIN: '게임 승리',
  GAME_LOSE: '게임 패배',
  GAME_REWARD: '게임 보상',
  GAME_BET: '게임 베팅',

  // 경매 관련
  AUCTION_BID: '경매 입찰',
  AUCTION_WIN: '경매 낙찰',
  AUCTION_SOLD: '경매 판매',
  AUCTION_REFUND: '경매 환불',

  // 부동산 관련
  REALESTATE_BUY: '부동산 구매',
  REALESTATE_SELL: '부동산 판매',
  REALESTATE_RENT: '임대료 수입',

  // 세금/벌금
  TAX_PAYMENT: '세금 납부',
  FINE_PAYMENT: '벌금 납부',

  // 급여
  SALARY_RECEIVE: '급여 수령',

  // 관리자
  ADMIN_GIVE: '관리자 지급',
  ADMIN_TAKE: '관리자 회수',
};

/**
 * 활동 로그를 Firestore에 기록합니다.
 * 🔥 [최적화] 로컬 캐시에도 저장하여 즉시 UI 반영 가능
 *
 * @param {object} db - Firestore 인스턴스
 * @param {object} params - 로그 파라미터
 * @param {string} params.classCode - 학급 코드
 * @param {string} params.userId - 사용자 ID
 * @param {string} params.userName - 사용자 이름
 * @param {string} params.type - 활동 타입 (ACTIVITY_TYPES 사용)
 * @param {string} params.description - 활동 설명
 * @param {number} [params.amount] - 금액 (현금 변동량)
 * @param {number} [params.couponAmount] - 쿠폰 변동량
 * @param {object} [params.metadata] - 추가 메타데이터
 * @returns {Promise<{success: boolean, logId?: string, error?: string}>}
 */
export async function logActivity(dbInstance, {
  classCode,
  userId,
  userName,
  type,
  description,
  amount = 0,
  couponAmount = 0,
  metadata = {}
}) {
  if (!classCode || !userId || !type) {
    logger.warn('[logActivity] 필수 파라미터 누락:', { classCode, userId, type });
    return { success: false, error: '필수 파라미터 누락' };
  }

  // db 인스턴스가 전달되지 않으면 import된 db 사용
  const firestore = dbInstance || db;

  try {
    // 🔥 기존 시스템과 호환: activity_logs 루트 컬렉션에 저장
    const logsRef = collection(firestore, 'activity_logs');
    const logData = {
      classCode, // 🔥 classCode 필드 추가 (기존 시스템 호환)
      userId,
      userName: userName || '알 수 없음',
      type,
      description: description || type,
      amount: amount || 0,
      couponAmount: couponAmount || 0,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(), // 클라이언트 타임스탬프 (백업용)
      },
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(logsRef, logData);
    logger.log('[logActivity] 활동 로그 기록:', type, description);

    return { success: true, logId: docRef.id };
  } catch (error) {
    logger.error('[logActivity] 로그 기록 실패:', error);
    return { success: false, error: error.message };
  }
}


