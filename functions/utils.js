/* eslint-disable */
const {HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Admin이 이미 초기화되어 있지 않으면 초기화
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

/**
 * 서버사이드 입력 새니타이징 - HTML 태그 및 위험 패턴 제거
 */
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/data:\s*text\/html/gi, "")
    .trim();
};

/**
 * 객체 내 모든 문자열 필드를 새니타이징
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === "string" ? sanitizeInput(value) : value;
  }
  return result;
};

const LOG_TYPES = {
    CASH_INCOME: "현금 입금",
    CASH_EXPENSE: "현금 출금",
    CASH_TRANSFER_SEND: "송금",
    CASH_TRANSFER_RECEIVE: "송금 수신",
    ADMIN_CASH_SEND: "관리자 지급",
    ADMIN_CASH_TAKE: "관리자 회수",
    COUPON_EARN: "쿠폰 획득",
    COUPON_USE: "쿠폰 사용",
    COUPON_GIVE: "쿠폰 지급",
    COUPON_TAKE: "쿠폰 회수",
    COUPON_TRANSFER_SEND: "쿠폰 송금",
    COUPON_TRANSFER_RECEIVE: "쿠폰 수신",
    COUPON_DONATE: "쿠폰 기부",
    COUPON_SELL: "쿠폰 판매",
    ITEM_PURCHASE: "아이템 구매",
    ITEM_USE: "아이템 사용",
    ITEM_SELL: "아이템 판매",
    ITEM_MARKET_LIST: "아이템 시장 등록",
    ITEM_MARKET_BUY: "아이템 시장 구매",
    ITEM_OBTAIN: "아이템 획득",
    ITEM_MOVE: "아이템 이동",
    TASK_COMPLETE: "과제 완료",
    TASK_REWARD: "과제 보상",
    TASK_APPROVAL_REQUEST: "할일 승인 요청",
    TASK_APPROVAL_APPROVED: "할일 승인 완료",
    TASK_APPROVAL_REJECTED: "할일 승인 거절",
    SYSTEM: "시스템",
    ADMIN_ACTION: "관리자 조치",
  };

const logActivity = async (transaction, userId, type, description, metadata = {}) => {
    if (!userId || userId === "system") {
      logger.info(`[System Log] ${type}: ${description}`, {metadata});
      return;
    }
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userName = userDoc.exists ? userDoc.data().name : "알 수 없는 사용자";
      const classCode = userDoc.exists ? userDoc.data().classCode : "미지정";
      // TTL: 90일 후 만료
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 90);

      const logData = {
        userId,
        userName,
        classCode,
        type,
        description: sanitizeInput(description),
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: admin.firestore.Timestamp.fromDate(expireAt),
      };
      const logRef = db.collection("activity_logs").doc();
      if (transaction) {
        transaction.set(logRef, logData);
      } else {
        await logRef.set(logData);
      }
    } catch (error) {
      logger.error(`[logActivity Error] User: ${userId}, Type: ${type}`, error);
    }
  };
  
  const checkAuthAndGetUserData = async (request, checkAdmin = false) => {
    // App Check 토큰 검증 (소프트 적용 - 경고만, 차단 안함)
    if (request.app === undefined && process.env.FUNCTIONS_EMULATOR !== 'true') {
      logger.warn('App Check token missing for request from:', request.auth?.uid);
    }

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증된 사용자만 함수를 호출할 수 있습니다.");
    }
    const uid = request.auth.uid;
    if (!uid || uid.trim() === "") {
      throw new HttpsError("unauthenticated", "유효한 사용자 ID를 찾을 수 없습니다.");
    }
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
    }
    const userData = userDoc.data();
    const isAdmin = userData.isAdmin || false;
    const isSuperAdmin = userData.isSuperAdmin || false;
    if (checkAdmin && !isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    return {uid, classCode: userData.classCode, isAdmin, isSuperAdmin, userData};
  };

  /**
   * 서버측 Idempotency Key 보장
   *
   * 사용 패턴: runTransaction의 *첫 번째 get* 직후 호출.
   *   await db.runTransaction(async (transaction) => {
   *     await assertIdempotent(transaction, idempotencyKey);
   *     // ... 나머지 거래 로직
   *   });
   *
   * - idempotencyKey가 없거나 빈 문자열이면 무시 (옛 클라이언트 호환)
   * - idempotencyKeys/{key} 문서가 이미 있으면 already-exists 에러 → 클라이언트는 무시
   * - 없으면 새로 등록 (24시간 TTL — Firestore TTL policy로 자동 청소)
   *
   * Firestore runTransaction은 ACID라 동일 key로 동시 호출되어도 한 트랜잭션만 통과.
   */
  const assertIdempotent = async (transaction, idempotencyKey, ttlHours = 24) => {
    if (!idempotencyKey || typeof idempotencyKey !== "string") return;
    if (idempotencyKey.length > 128) {
      throw new HttpsError("invalid-argument", "idempotencyKey가 너무 깁니다.");
    }
    const keyRef = db.collection("idempotencyKeys").doc(idempotencyKey);
    const keySnap = await transaction.get(keyRef);
    if (keySnap.exists) {
      throw new HttpsError(
        "already-exists",
        "이미 처리된 요청입니다. (중복 결제 차단)"
      );
    }
    const expireAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + ttlHours * 60 * 60 * 1000,
    );
    transaction.set(keyRef, {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt,
    });
  };

  module.exports = {
      LOG_TYPES,
      logActivity,
      checkAuthAndGetUserData,
      sanitizeInput,
      sanitizeObject,
      assertIdempotent,
      db,
      admin,
      logger
  }