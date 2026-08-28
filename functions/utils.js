/* eslint quotes: "off" */
// ⚠️ 통짜 `eslint-disable` 에서 좁혔다(2026-08-20). no-undef 를 살리기 위해서다.
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
    ADMIN_CASH_TAKE_SKIPPED: "관리자 회수 시도(잔액 없음)",
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

/**
 * 활동 기록(activity_logs) 한 줄.
 *
 * 🔴 **`ledger` 를 안 주면 학생 거래내역에 안 보인다** (2026-08-28 실측).
 *    「나의 자산」의 거래내역은 세 원장을 합치면서
 *    `.filter((tx) => tx.amount !== 0 || tx.couponAmount !== 0)` 로 거른다
 *    (src/pages/my-assets/MyAssets.js). 그런데 이 함수는 금액을 `metadata` **안에만** 넣어
 *    최상위 `amount`/`couponAmount` 가 늘 0 이었다 — 그래서 기록이 남아도 화면에서 사라진다.
 *    표본 3,000건 중 1,778건이 그 상태였다.
 *
 *    ⚠️ **아무 데나 붙이면 안 된다.** 같은 사건을 `users/{uid}/transactions` 나 루트
 *    `transactions` 에도 쓰는 경로(부동산 구매·주식·송금 등)에 이걸 붙이면 거래내역에
 *    **두 줄**로 뜬다. activity_logs 가 유일한 원장인 곳에만 준다.
 *
 * @param {{amount?: number, couponAmount?: number}} ledger 부호 있는 증감(받으면 +, 나가면 −).
 *   생략하면 0 — 돈이 움직이지 않은 기록(할일 승인 요청 등)은 그게 맞다.
 */
const logActivity = async (transaction, userId, type, description, metadata = {}, ledger = {}) => {
    if (!userId || userId === "system") {
      logger.info(`[System Log] ${type}: ${description}`, {metadata});
      return;
    }
    // 🔴 **읽기 실패가 기록까지 통째로 없애면 안 된다** (2026-08-28).
    //    종전엔 이 아래 전체가 하나의 try 안에 있어서, 이름/학급 조회가 실패하면
    //    `transaction.set` 까지 건너뛰었다 — 돈은 움직였는데 원장만 사라진다.
    //    이름은 표시용이라 몰라도 되지만 **기록의 존재 여부는 타협 대상이 아니다.**
    let userName = "알 수 없는 사용자";
    let classCode = "미지정";
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userName = userDoc.data().name || userName;
        classCode = userDoc.data().classCode || classCode;
      }
    } catch (error) {
      logger.error(`[logActivity 조회 실패] User: ${userId}, Type: ${type}`, error);
    }
    try {
      // TTL: 90일 후 만료
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 90);

      const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const logData = {
        userId,
        userName,
        classCode,
        // 최상위 금액 — 거래내역 화면이 보는 필드다(위 주석).
        amount: toNum(ledger.amount),
        couponAmount: toNum(ledger.couponAmount),
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
      // 🔴 여기까지 왔는데 실패했다면 **원장이 비었다는 뜻**이다. 삼키지 않는다.
      //    종전엔 조용히 넘어가서, 호출부가 `await` 를 빠뜨려 커밋 뒤에 쓰려다 난
      //    "Cannot modify a WriteBatch that has been committed" 가 30일간 28건 쌓이는 동안
      //    아무도 몰랐다(쿠폰 판매·기부·사용·송금·수신·부동산 구매가 거래내역에서 사라졌다).
      //    트랜잭션 경로에서는 던져서 **돈도 같이 되돌린다** — 기록 없는 이동을 남기지 않는다.
      logger.error(`[logActivity Error] User: ${userId}, Type: ${type}`, error);
      if (transaction) throw error;
    }
  };
  
  const checkAuthAndGetUserData = async (request, checkAdmin = false) => {
    // App Check 토큰 검증 — **의도적으로 소프트**(경고만, 차단 안 함).
    //
    // 2026-08-10 운영로그 60일 실측으로 강제 적용(enforceAppCheck)을 보류했다.
    //   · 누락률 평균 0.38%(180/46,948) 지만 **몰려서** 터진다 — 38일 중 31일은 0건,
    //     대신 7/17 하루는 15.1%.
    //   · 그 폭발이 산발이 아니라 **한 사람이 몇 시간 내리** 실패하는 모양이다
    //     (교사 계정 2개가 각각 59건 3시간41분 · 54건 8시간9분, 한 계정은 3주 뒤 재발).
    //     즉 "가끔 튀는 네트워크"가 아니라 특정 기기·환경이 토큰을 아예 못 받는다.
    //     강제로 켰다면 그날 그 교사의 앱이 통째로 멈춘다.
    //   · 게다가 막으려던 구멍을 못 막는다 — 학생이 앱 페이지에서 F12로 CF를 부르면
    //     App Check 토큰은 **정상 발급**된다. 차단되는 건 외부 스크립트뿐이다.
    //     실제 방어선은 이 아래의 인증·역할·학급코드 검증과 firestore.rules 다.
    //
    // 강제 적용을 다시 검토할 조건: 아래 경고에 찍히는 ua/origin 으로 원인(APK WebView·
    // 학교망 차단 등)을 특정해 없앤 뒤, 학기 중 2주 연속 누락 0건일 때.
    if (request.app === undefined && process.env.FUNCTIONS_EMULATOR !== 'true') {
      const h = request.rawRequest?.headers || {};
      logger.warn("App Check token missing for request from:", request.auth?.uid, {
        ua: h["user-agent"] || "?",
        origin: h["origin"] || h["referer"] || "?",
        // 안드로이드 래퍼는 UA 에 "AlchanApp/1.0 Android" 를 덧붙인다(MainActivity.kt).
        isAndroidApp: String(h["user-agent"] || "").includes("AlchanApp"),
      });
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

  // 🔥 카탈로그 버전 문서(catalogMeta/{classCode}) 갱신 — **상점 가격·목록을 바꾼 모든 경로가 부른다.**
  //
  //    학생 화면은 상점 카탈로그를 세션 캐시(27분)에 들고 있고, 이 문서의 버전 변경을
  //    리스너 하나로 감지해 캐시를 버린다(읽기 절감 2단계). 안 올리면 교사는 바꿨는데
  //    학생 화면은 최대 27분간 옛 값을 본다 — "바꿨는데 그대로다" 의 전형이다.
  //
  //    ⚠️ 여기 있는 이유: 2026-08-27 까지 이 5줄이 **두 벌**이었다(index.js 의 헬퍼 +
  //       economicEvents.js 의 인라인 사본). 지금은 같아도 한쪽만 고치면 조용히 어긋난다 —
  //       이 저장소는 "정본이 둘"로 이미 여러 번 데였다. 두 파일 다 ./utils 를 require 하므로
  //       순환참조 없이 여기가 유일 정본이 된다.
  //    비치명 실패로 둔다 — 값은 이미 바뀌었고 캐시는 늦어도 27분 뒤 스스로 만료된다.
  const bumpCatalogVersion = async (classCode) => {
    if (!classCode) return;
    try {
      await db.collection("catalogMeta").doc(classCode).set(
        { version: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (e) {
      logger.warn(`[bumpCatalogVersion] ${classCode} 갱신 실패(비치명):`, e);
    }
  };

  module.exports = {
      LOG_TYPES,
      bumpCatalogVersion,
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