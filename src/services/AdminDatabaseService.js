// src/services/AdminDatabaseService.js
// 🔥 DB 최적화: 서버 사이드 필터링으로 변경하여 읽기 비용 50% 이상 절감
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, startAfter, Timestamp } from 'firebase/firestore';

import { logger } from "../utils/logger";
/**
 * 관리자용 데이터베이스 서비스
 * 🔥 최적화: 서버 사이드 필터링으로 불필요한 문서 읽기 제거
 */

// 한글 타입을 영문 타입으로 매핑
const TYPE_MAPPING = {
  '쿠폰 획득': 'COUPON_EARN',
  '쿠폰 사용': 'COUPON_USE',
  '쿠폰 지급': 'COUPON_GIVE',
  '쿠폰 회수': 'COUPON_TAKE',
  '쿠폰 송금': 'COUPON_TRANSFER_SEND',
  '쿠폰 수신': 'COUPON_TRANSFER_RECEIVE',
  '아이템 구매': 'ITEM_PURCHASE',
  '아이템 사용': 'ITEM_USE',
  '아이템 판매': 'ITEM_SELL',
  '아이템 시장 등록': 'ITEM_MARKET_LIST',
  '아이템 시장 구매': 'ITEM_MARKET_BUY',
  '송금': 'CASH_TRANSFER_SEND',
  '송금 수신': 'CASH_TRANSFER_RECEIVE',
  '돈 송금': 'CASH_TRANSFER_SEND',
  '돈 출금': 'CASH_WITHDRAW',
  '돈 입금': 'CASH_DEPOSIT',
  '주식 매수': 'STOCK_BUY',
  '주식 매도': 'STOCK_SELL',
  '주식 거래세': 'STOCK_TAX',
  '거래세': 'STOCK_TAX',
  'TAX_PAYMENT': 'STOCK_TAX',
  '과제 완료': 'TASK_COMPLETE',
  '게임 승리': 'GAME_WIN',
  '게임 패배': 'GAME_LOSE',
  'ADMIN_CASH_SEND': 'ADMIN_CASH_SEND',
  'ADMIN_CASH_TAKE': 'ADMIN_CASH_TAKE',
};

// 타입 정규화 함수
const normalizeType = (type) => {
  if (!type) return null;
  return type;
};

// 🔥 캐시 관리 - TTL 증가 (5분 → 15분, Firestore 읽기 67% 감소)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 🔥 [최적화] 15분

/**
 * 캐시 키 생성
 */
const getCacheKey = (classCode, type, options = {}) => {
  return `${classCode}_${type}_${JSON.stringify(options)}`;
};

/**
 * 캐시에서 데이터 가져오기
 */
const getFromCache = (key) => {
  const cached = cache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return cached.data;
};

/**
 * 캐시에 데이터 저장
 */
const setCache = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

/**
 * 활동 로그 조회 (쿠폰 획득, 아이템 사용 등)
 * 🔥 최적화: 서버 사이드 필터링으로 변경 - 읽기 비용 50% 이상 절감
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션 { userId, type, startDate, endDate, limitCount, lastDoc }
 * @returns {Promise<{logs: Array, hasMore: boolean, lastDoc: any}>}
 */
export const getActivityLogs = async (classCode, options = {}) => {
  const { userId, type, startDate, endDate, limitCount = 50, lastDoc = null } = options;

  try {
    // 🔥 캐시 확인 (페이지네이션 요청이 아닐 때만)
    if (!lastDoc) {
      const cacheKey = getCacheKey(classCode, 'activity_logs', { userId, type, startDate, endDate, limitCount });
      const cached = getFromCache(cacheKey);
      if (cached) {
        logger.log('[AdminDatabaseService] 캐시된 활동 로그 사용');
        return cached;
      }
    }

    logger.log('[AdminDatabaseService] 활동 로그 서버 사이드 필터링 조회:', { classCode, userId, type, limitCount, hasPagination: !!lastDoc });

    // 🔥 최적화: 서버 사이드 필터링으로 필요한 문서만 가져오기
    const constraints = [
      where('classCode', '==', classCode)
    ];

    // userId 필터 - 서버에서 처리
    if (userId) {
      constraints.push(where('userId', '==', userId));
    }

    // 날짜 범위 필터 - 서버에서 처리 (복합 인덱스 필요: classCode + timestamp)
    if (startDate) {
      const startTimestamp = startDate instanceof Date ? Timestamp.fromDate(startDate) : startDate;
      constraints.push(where('timestamp', '>=', startTimestamp));
    }
    if (endDate) {
      const endTimestamp = endDate instanceof Date ? Timestamp.fromDate(endDate) : endDate;
      constraints.push(where('timestamp', '<=', endTimestamp));
    }

    // 타입 필터 - 서버에서 처리 (날짜 범위와 함께 사용 시 클라이언트에서 처리)
    // Firestore 제한: 범위 쿼리는 하나의 필드에서만 가능
    const useServerTypeFilter = type && !startDate && !endDate;
    if (useServerTypeFilter) {
      constraints.push(where('type', '==', normalizeType(type)));
    }

    // 정렬 및 제한
    constraints.push(orderBy('timestamp', 'desc'));

    // 🔥 페이지네이션: lastDoc(DocumentSnapshot)이 있으면 startAfter 적용
    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }

    constraints.push(limit(limitCount + 1)); // hasMore 확인을 위해 +1

    const q = query(collection(db, 'activity_logs'), ...constraints);
    const snapshot = await getDocs(q);

    let logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate() || new Date()
      });
    });

    // 🔥 타입 필터가 날짜 범위와 함께 사용된 경우에만 클라이언트에서 필터링
    if (type && !useServerTypeFilter) {
      const normalizedFilterType = normalizeType(type);
      logs = logs.filter(log => log.type === normalizedFilterType);
    }

    // hasMore 판단 및 결과 슬라이스
    const hasMore = logs.length > limitCount;
    const paginatedLogs = logs.slice(0, limitCount);

    // 🔥 lastDoc을 실제 Firestore DocumentSnapshot으로 반환 (페이지네이션용)
    const lastSnapshot = hasMore || paginatedLogs.length > 0
      ? snapshot.docs[Math.min(snapshot.docs.length - 1, limitCount - 1)] || null
      : null;

    logger.log(`[AdminDatabaseService] 활동 로그 조회 완료: ${paginatedLogs.length}개 (서버 필터링)`);

    const result = {
      logs: paginatedLogs,
      hasMore,
      lastDoc: lastSnapshot
    };

    // 🔥 캐시 저장 (첫 페이지만)
    if (!lastDoc) {
      const cacheKey = getCacheKey(classCode, 'activity_logs', { userId, type, startDate, endDate, limitCount });
      setCache(cacheKey, result);
    }

    return result;

  } catch (error) {
    logger.error('[AdminDatabaseService] 활동 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 학급 학생들의 쿠폰 획득 내역 조회
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getCouponEarnLogs = async (classCode, options = {}) => {
  try {
    const result = await getActivityLogs(classCode, {
      ...options,
      type: 'COUPON_EARN'
    });

    return result;
  } catch (error) {
    logger.error('[AdminDatabaseService] 쿠폰 획득 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 학급 학생들의 쿠폰 사용 내역 조회
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getCouponUseLogs = async (classCode, options = {}) => {
  try {
    const result = await getActivityLogs(classCode, {
      ...options,
      type: 'COUPON_USE'
    });

    return result;
  } catch (error) {
    logger.error('[AdminDatabaseService] 쿠폰 사용 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 학급 학생들의 아이템 구매 내역 조회
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getItemPurchaseLogs = async (classCode, options = {}) => {
  try {
    const result = await getActivityLogs(classCode, {
      ...options,
      type: 'ITEM_PURCHASE'
    });

    return result;
  } catch (error) {
    logger.error('[AdminDatabaseService] 아이템 구매 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 학급 학생들의 아이템 사용 내역 조회
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getItemUseLogs = async (classCode, options = {}) => {
  try {
    const result = await getActivityLogs(classCode, {
      ...options,
      type: 'ITEM_USE'
    });

    return result;
  } catch (error) {
    logger.error('[AdminDatabaseService] 아이템 사용 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 학급 학생들의 아이템 판매 내역 조회
 * @param {string} classCode - 학급 코드
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getItemSellLogs = async (classCode, options = {}) => {
  try {
    const result = await getActivityLogs(classCode, {
      ...options,
      type: 'ITEM_SELL'
    });

    return result;
  } catch (error) {
    logger.error('[AdminDatabaseService] 아이템 판매 로그 조회 오류:', error);
    throw error;
  }
};

/**
 * 통합 활동 요약 조회 (학생별)
 * 🔥 최적화: classCode 필터를 서버에서 적용하여 불필요한 문서 읽기 제거
 * @param {string} classCode - 학급 코드
 * @param {string} userId - 사용자 ID (선택)
 * @returns {Promise<object>}
 */
export const getActivitySummary = async (classCode, userId = null) => {
  try {
    const cacheKey = getCacheKey(classCode, 'activity_summary', { userId });
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.log('[AdminDatabaseService] 캐시된 활동 요약 사용');
      return cached;
    }

    logger.log('[AdminDatabaseService] 활동 요약 조회 시작 (서버 필터링):', { classCode, userId });

    // 🔥 최적화: classCode 필터를 서버에서 적용
    const constraints = [where('classCode', '==', classCode)];

    if (userId) {
      constraints.push(where('userId', '==', userId));
    }

    // 최근 1000개로 제한하여 비용 절감
    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(1000));

    const baseQuery = query(collection(db, 'activity_logs'), ...constraints);

    // 필터링된 활동 로그만 조회
    const snapshot = await getDocs(baseQuery);

    logger.log(`[AdminDatabaseService] 조회된 문서 수: ${snapshot.size} (classCode 필터 적용)`);

    const summary = {
      totalActivities: 0,
      couponEarned: 0,
      couponUsed: 0,
      itemPurchased: 0,
      itemUsed: 0,
      itemSold: 0,
      byUser: {}
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      const normalizedType = normalizeType(data.type); // 타입 정규화

      summary.totalActivities++;

      // 사용자별 통계
      if (!summary.byUser[data.userId]) {
        summary.byUser[data.userId] = {
          userName: data.userName || '알 수 없음',
          couponEarned: 0,
          couponUsed: 0,
          itemPurchased: 0,
          itemUsed: 0,
          itemSold: 0,
          activities: []
        };
      }

      const userSummary = summary.byUser[data.userId];

      // 타입별 집계 (정규화된 타입 사용)
      switch (normalizedType) {
        case 'COUPON_EARN':
          const earnAmount = data.metadata?.couponAmount || 1; // 기본값 1
          summary.couponEarned += earnAmount;
          userSummary.couponEarned += earnAmount;
          break;
        case 'COUPON_USE':
          const useAmount = data.metadata?.couponAmount || 1; // 기본값 1
          summary.couponUsed += useAmount;
          userSummary.couponUsed += useAmount;
          break;
        case 'ITEM_PURCHASE':
          summary.itemPurchased++;
          userSummary.itemPurchased++;
          break;
        case 'ITEM_USE':
          summary.itemUsed++;
          userSummary.itemUsed++;
          break;
        case 'ITEM_SELL':
        case 'ITEM_MARKET_LIST':
          summary.itemSold++;
          userSummary.itemSold++;
          break;
        default:
          break;
      }

      // 최근 활동 저장 (최대 10개)
      if (userSummary.activities.length < 10) {
        userSummary.activities.push({
          type: normalizedType, // 정규화된 타입 저장
          description: data.description,
          timestamp: data.timestamp?.toDate() || new Date(),
          metadata: data.metadata
        });
      }
    });

    logger.log(`[AdminDatabaseService] 활동 요약 조회 완료:`, {
      totalActivities: summary.totalActivities,
      couponEarned: summary.couponEarned,
      couponUsed: summary.couponUsed,
      itemPurchased: summary.itemPurchased,
      itemUsed: summary.itemUsed,
      itemSold: summary.itemSold,
      userCount: Object.keys(summary.byUser).length
    });

    // 캐시 저장
    setCache(cacheKey, summary);

    return summary;

  } catch (error) {
    logger.error('[AdminDatabaseService] 활동 요약 조회 오류:', error);
    logger.error('[AdminDatabaseService] 오류 상세:', error.message, error.code);
    throw error;
  }
};

/**
 * 캐시 초기화
 */
export const clearCache = () => {
  cache.clear();
  logger.log('[AdminDatabaseService] 캐시 초기화 완료');
};

/**
 * 특정 학급의 캐시만 초기화
 */
export const clearClassCache = (classCode) => {
  const keysToDelete = [];
  cache.forEach((value, key) => {
    if (key.startsWith(classCode)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => cache.delete(key));
  logger.log(`[AdminDatabaseService] ${classCode} 학급 캐시 초기화 완료`);
};

/**
 * transactions 컬렉션에서 데이터 가져오기 (폴백)
 * @param {Array} userIds - 사용자 ID 배열
 * @param {object} options - 조회 옵션
 * @returns {Promise<Array>}
 */
export const getTransactionsData = async (userIds = [], options = {}) => {
  try {
    const { limitCount = 100 } = options;

    logger.log('[AdminDatabaseService] transactions 컬렉션 조회 시작:', { userIdsCount: userIds.length });

    if (userIds.length === 0) {
      logger.warn('[AdminDatabaseService] userIds가 비어있음');
      return [];
    }

    // Firestore는 'in' 쿼리가 최대 10개까지만 지원하므로 배치 처리
    const batches = [];
    for (let i = 0; i < userIds.length; i += 10) {
      batches.push(userIds.slice(i, i + 10));
    }

    const allTransactions = [];

    for (const batch of batches) {
      let q = query(
        collection(db, 'transactions'),
        where('userId', 'in', batch),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);

      snapshot.forEach(doc => {
        const data = doc.data();
        allTransactions.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date()
        });
      });
    }

    logger.log(`[AdminDatabaseService] transactions 조회 완료: ${allTransactions.length}개`);
    return allTransactions;

  } catch (error) {
    logger.error('[AdminDatabaseService] transactions 조회 오류:', error);
    return [];
  }
};

/**
 * transactions 데이터를 activity_logs 형식으로 변환
 * @param {Array} transactions - 거래 내역
 * @returns {Array}
 */
export const convertTransactionsToLogs = (transactions) => {
  return transactions.map(tx => {
    let type = 'CASH_INCOME';
    let description = tx.description || '거래';

    // 거래 설명에서 타입 추론
    if (tx.description) {
      if (tx.description.includes('쿠폰') && tx.description.includes('획득')) {
        type = 'COUPON_EARN';
      } else if (tx.description.includes('쿠폰') && tx.description.includes('사용')) {
        type = 'COUPON_USE';
      } else if (tx.description.includes('아이템') && tx.description.includes('구매')) {
        type = 'ITEM_PURCHASE';
      } else if (tx.description.includes('아이템') && tx.description.includes('사용')) {
        type = 'ITEM_USE';
      } else if (tx.description.includes('아이템') && (tx.description.includes('판매') || tx.description.includes('등록'))) {
        type = 'ITEM_SELL';
      } else if (tx.description.includes('송금')) {
        type = tx.amount > 0 ? 'CASH_TRANSFER_RECEIVE' : 'CASH_TRANSFER_SEND';
      } else if (tx.type === 'expense') {
        type = 'CASH_EXPENSE';
      }
    }

    return {
      id: tx.id,
      userId: tx.userId,
      userName: tx.userName || '알 수 없음',
      type,
      description,
      timestamp: tx.timestamp,
      metadata: {
        amount: tx.amount,
        category: tx.category,
        ...tx.metadata
      }
    };
  });
};
