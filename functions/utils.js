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
    // 🔒 관리자 권한은 '승인된' 교사에게만 (2026-07-14 Gemini 교차검증).
    //    교사 가입은 공개돼 있고 가입자가 isAdmin:true를 스스로 넣을 수 있는데(승인 대기 상태),
    //    승인 여부를 서버가 검사하지 않아 미승인 계정이 classCode만 바꾸면 남의 학급 관리자가 됐다.
    //    슈퍼관리자는 예외(운영 계정은 isApproved 필드 자체가 없다).
    const isSuperAdmin = userData.isSuperAdmin === true;
    const isAdmin = hasAdminPower(userData);
    if (checkAdmin && !isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    return {uid, classCode: userData.classCode, isAdmin, isSuperAdmin, userData};
  };

  /**
   * 서버측 Idempotency Key — Firestore 트랜잭션 read-before-write 룰 준수
   *
   * 두 단계로 분리: check(read) + mark(write).
   *
   * 사용 패턴:
   *   await db.runTransaction(async (transaction) => {
   *     const keyRef = await checkIdempotent(transaction, idempotencyKey);
   *     // ... 다른 모든 transaction.get 호출
   *     // ... 모든 transaction.set/update
   *     markIdempotent(transaction, keyRef);  // 마지막에 호출
   *   });
   *
   * - idempotencyKey 없으면 keyRef = null, mark도 no-op (옛 클라이언트 호환)
   * - 이미 있으면 already-exists throw (트랜잭션 abort)
   * - mark는 24h TTL로 등록 (Firestore TTL policy로 자동 청소)
   * - Firestore runTransaction ACID라 동일 key 동시 호출도 1번만 통과
   */
  const checkIdempotent = async (transaction, idempotencyKey) => {
    if (!idempotencyKey || typeof idempotencyKey !== "string") return null;
    if (idempotencyKey.length > 128) {
      throw new HttpsError("invalid-argument", "idempotencyKey가 너무 깁니다.");
    }
    // 🔒 2026-07-20 codex: '/' 경로 주입 차단 — doc(idempotencyKey)에 '/'가 있으면 중첩 경로
    //   (idempotencyKeys/a/b/…)로 기록돼 상위 컬렉션 TTL 정리에서 이탈한다. 정당한 키(UUID·
    //   doc id·`prefix_id` 조합)엔 '/'가 없으므로(Firestore doc id는 '/' 불가) 무해하게 봉인.
    if (idempotencyKey.includes("/")) {
      throw new HttpsError("invalid-argument", "idempotencyKey 형식이 올바르지 않습니다.");
    }
    const keyRef = db.collection("idempotencyKeys").doc(idempotencyKey);
    const keySnap = await transaction.get(keyRef);
    if (keySnap.exists) {
      throw new HttpsError(
        "already-exists",
        "이미 처리된 요청입니다. (중복 결제 차단)"
      );
    }
    return keyRef;
  };

  const markIdempotent = (transaction, keyRef, ttlHours = 24) => {
    if (!keyRef) return;
    const expireAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + ttlHours * 60 * 60 * 1000,
    );
    transaction.set(keyRef, {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt,
    });
  };

  // 옛 호출 호환 — 위치는 호출자가 모든 read 끝낸 후로 옮겨야
  const assertIdempotent = async (transaction, idempotencyKey, ttlHours = 24) => {
    const keyRef = await checkIdempotent(transaction, idempotencyKey);
    markIdempotent(transaction, keyRef, ttlHours);
    return keyRef;
  };

  // 권한 판정은 순수 함수로 분리(단위 테스트 대상) — functions/authUtils.js
  const { hasAdminPower, hasTeacherPower } = require("./authUtils");

  /**
   * 학급의 '승인된' 관리자(=국고 계정) 조회.
   *
   * 🔒 2026-07-14 codex 교차검증: 기존 코드는 `.where("isAdmin","==",true).limit(1)`로 뽑았는데,
   *    교사 공개가입(isAdmin:true·isApproved:false) 후 classCode를 남의 학급으로 바꾸면
   *    그 미승인 계정이 limit(1)에 걸려 국고가 될 수 있었다 — 세금·월세·판매대금이 공격자에게 흐른다.
   *    쿼리에 isApproved 조건을 더하면 복합 인덱스가 필요해지고(런타임 실패 위험) 슈퍼관리자
   *    (isApproved 필드 없음)도 탈락하므로, 후보를 넉넉히 받아 코드에서 hasAdminPower로 거른다.
   *
   * 반환값은 QuerySnapshot에서 실제로 쓰이는 표면(empty·docs·size)만 흉내낸 shim.
   */
  const findApprovedAdminSnap = async (classCode) => {
    // limit는 넉넉히 — 미승인 관리자 후보(자가가입 교사)가 앞자리를 채워 승인 관리자를 밀어내면
    // 국고 조회가 비어 세금·월세·판매대금 처리가 통째로 skip된다(DoS). 학급당 교사는 1~2명이라
    // 50이면 충분하고, 후보가 밀려날 만큼 쌓이면 아래 경고 로그로 탐지한다.
    const snap = await db
      .collection("users")
      .where("classCode", "==", classCode)
      .where("isAdmin", "==", true)
      .limit(50)
      .get();
    const docs = snap.docs.filter((d) => hasAdminPower(d.data()));
    const rejected = snap.size - docs.length;
    if (rejected > 0) {
      // 정상 학급에서는 0이어야 한다. 0이 아니면 미승인 관리자 계정이 이 학급에 들어와 있다는 뜻.
      logger.warn(
        `[findApprovedAdminSnap] classCode=${classCode}: 미승인 관리자 후보 ${rejected}명 제외됨 (승인 ${docs.length}명)`,
      );
    }
    return { empty: docs.length === 0, docs, size: docs.length };
  };

  module.exports = {
      LOG_TYPES,
      logActivity,
      checkAuthAndGetUserData,
      hasAdminPower,
      hasTeacherPower,
      findApprovedAdminSnap,
      sanitizeInput,
      sanitizeObject,
      assertIdempotent,
      checkIdempotent,
      markIdempotent,
      db,
      admin,
      logger
  }