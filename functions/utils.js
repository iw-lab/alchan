/* eslint-disable */
const {HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Admin이 이미 초기화되어 있지 않으면 초기화
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

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
      const logData = {
        userId,
        userName,
        classCode,
        type,
        description,
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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

  module.exports = {
      LOG_TYPES,
      logActivity,
      checkAuthAndGetUserData,
      db,
      admin,
      logger
  }