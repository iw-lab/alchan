// src/utils/firestoreHelpers.js
// 공통 Firestore 헬퍼: 페이지네이션, 배치 조회(where __name__ in), 활동 로그, 유틸
import {
  getDocs,
  query as q,
  limit as qLimit,
  startAfter as qStartAfter,
  where,
  doc,
  getDoc,
  writeBatch,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

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
    console.warn('[logActivity] 필수 파라미터 누락:', { classCode, userId, type });
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
    console.log('[logActivity] 활동 로그 기록:', type, description);

    return { success: true, logId: docRef.id };
  } catch (error) {
    console.error('[logActivity] 로그 기록 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 배치로 여러 활동 로그를 한 번에 기록합니다.
 * 🔥 [최적화] 단일 배치 쓰기로 Firestore 비용 절감
 *
 * @param {object} db - Firestore 인스턴스
 * @param {string} classCode - 학급 코드
 * @param {Array} logs - 로그 배열
 * @returns {Promise<{success: boolean, count?: number, error?: string}>}
 */
export async function logActivitiesBatch(db, classCode, logs) {
  if (!classCode || !logs || logs.length === 0) {
    return { success: false, error: '파라미터 누락' };
  }

  try {
    const batch = writeBatch(db);
    const logsRef = collection(db, 'classes', classCode, 'activityLogs');

    logs.forEach((log) => {
      const docRef = doc(logsRef);
      batch.set(docRef, {
        userId: log.userId,
        userName: log.userName || '알 수 없음',
        type: log.type,
        description: log.description || log.type,
        amount: log.amount || 0,
        couponAmount: log.couponAmount || 0,
        metadata: log.metadata || {},
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    console.log('[logActivitiesBatch] 배치 로그 기록:', logs.length, '개');

    return { success: true, count: logs.length };
  } catch (error) {
    console.error('[logActivitiesBatch] 배치 로그 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * startAfter 기반 페이지네이션 로더를 만들어 줍니다.
 * @param {import('firebase/firestore').Query} baseQuery   orderBy 포함 필수
 * @param {number} pageSize
 * @returns {{loadFirst: function(): Promise<{items: any[], lastDoc: any}>, loadMore: function(lastDoc:any): Promise<{items:any[], lastDoc:any}>}}
 */
export function createPaginator(baseQuery, pageSize = 20) {
  if (!baseQuery) throw new Error("createPaginator: baseQuery가 필요합니다.");
  if (pageSize <= 0) pageSize = 20;

  const loadFirst = async () => {
    const pageQ = q(baseQuery, qLimit(pageSize));
    const snap = await getDocs(pageQ);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, lastDoc };
  };

  const loadMore = async (last) => {
    if (!last) return { items: [], lastDoc: null };
    const pageQ = q(baseQuery, qStartAfter(last), qLimit(pageSize));
    const snap = await getDocs(pageQ);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const newLast = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, lastDoc: newLast };
  };

  return { loadFirst, loadMore };
}

/**
 * where("__name__", "in", [...]) 기반 배치 조회. Firestore는 in 배열이 최대 10개.
 * 10개씩 청크로 나누어 병렬 조회 후 합칩니다.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} collectionPath
 * @param {string[]} ids
 * @returns {Promise<Record<string, any>>}  // id -> data
 */
export async function batchGetByIds(db, collectionPath, ids) {
  if (!ids || ids.length === 0) return {};
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const colRef = collection(db, collectionPath);
  const results = await Promise.all(chunks.map(async (chunk) => {
    const snap = await getDocs(q(colRef, where("__name__", "in", chunk)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));

  const flat = results.flat();
  const map = {};
  flat.forEach(doc => { map[doc.id] = doc; });
  return map;
}

/**
 * 집계 문서(예: stats/{classCode})를 배치/트랜잭션으로 업데이트하는 헬퍼
 * - 서버사이드(Functions) 권장. 클라이언트 대안으로 제공.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} statsDocPath  예: `stats/${classCode}`
 * @param {(prev:any)=>any} reducer   이전 값을 받아 업데이트할 객체 반환
 */
export async function updateAggregateDoc(db, statsDocPath, reducer) {
  const ref = doc(db, statsDocPath);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : {};
    const next = reducer(prev || {});
    tx.set(ref, next, { merge: true });
  });
}
