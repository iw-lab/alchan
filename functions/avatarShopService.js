/* eslint-disable */
/* eslint-disable max-len */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, logger, logActivity, LOG_TYPES, checkAuthAndGetUserData, checkIdempotent, markIdempotent, findApprovedAdminSnap } = require("./utils");

const AUTH_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || null;

/**
 * 아바타 상점 일괄 시드 HTTP 엔드포인트 (SCHEDULER_AUTH_TOKEN 인증)
 *
 * POST /seedAvatarShopHttp?token=<TOKEN>
 * body: { items: [...] }
 *
 * 또는 GET으로 호출 시 내장된 카탈로그를 자체적으로 시드 (편의성)
 * GET /seedAvatarShopHttp?token=<TOKEN>&useEmbedded=1
 *
 * 보안: SCHEDULER_AUTH_TOKEN으로만 호출 가능. 슈퍼관리자 인증 우회 (시드 일회성 작업용).
 */
exports.seedAvatarShopHttp = onRequest(
  { region: "asia-northeast3", invoker: "public", timeoutSeconds: 120 },
  async (req, res) => {
    try {
      const token = req.query.token || req.body?.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: "items 배열 필요 (POST body)" });
        return;
      }
      if (items.length > 200) {
        res.status(400).json({ success: false, error: "한 번에 최대 200개" });
        return;
      }

      const batch = db.batch();
      let written = 0;
      for (const item of items) {
        if (!item.id || !item.slot || !item.name || typeof item.price !== "number") continue;
        const ref = db.collection("avatarShopItems").doc(item.id);
        batch.set(
          ref,
          {
            id: item.id,
            slot: item.slot,
            name: item.name,
            description: item.description || "",
            imageUrl: item.imageUrl || "",
            rarity: item.rarity || "common",
            price: item.price,
            active: item.active !== false,
            sortOrder: item.sortOrder || 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        written++;
      }
      await batch.commit();
      logger.info(`[seedAvatarShopHttp] ${written}개 시드 완료`);
      res.json({ success: true, written });
    } catch (error) {
      logger.error("[seedAvatarShopHttp] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

/**
 * 아바타 상점 시드 (슈퍼관리자 전용)
 *
 * - 클라이언트가 아이템 메타데이터 배열을 보냄
 * - 각 doc을 avatarShopItems/{id}에 set(merge:true)
 */
exports.seedAvatarShop = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { isSuperAdmin } = await checkAuthAndGetUserData(request);
    if (!isSuperAdmin) {
      throw new HttpsError("permission-denied", "슈퍼관리자만 시드할 수 있습니다.");
    }
    const { items } = request.data || {};
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpsError("invalid-argument", "items 배열이 비어있습니다.");
    }
    if (items.length > 200) {
      throw new HttpsError("invalid-argument", "한 번에 최대 200개까지 시드할 수 있습니다.");
    }

    const batch = db.batch();
    let written = 0;
    for (const item of items) {
      if (!item.id || !item.slot || !item.name || typeof item.price !== "number") continue;
      const ref = db.collection("avatarShopItems").doc(item.id);
      batch.set(
        ref,
        {
          id: item.id,
          slot: item.slot,
          name: item.name,
          description: item.description || "",
          imageUrl: item.imageUrl || "",
          rarity: item.rarity || "common",
          price: item.price,
          active: item.active !== false,
          sortOrder: item.sortOrder || 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      written++;
    }
    await batch.commit();
    logger.info(`[seedAvatarShop] ${written}개 시드 완료`);
    return { success: true, written };
  },
);

/**
 * 학급 관리자가 아바타 아이템 가격을 수정 (학급별 override)
 *
 * governments/{classCode}.avatarShopPriceOverrides = { itemId: number }
 *
 * - 관리자만 호출 가능
 * - 본인 학급 override만 수정
 * - price = null 또는 미전송 시 override 제거 (기본 가격으로 복귀)
 */
exports.updateAvatarShopPrice = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { isAdmin, isSuperAdmin, classCode } = await checkAuthAndGetUserData(request);
    if (!isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "관리자만 가격을 수정할 수 있습니다.");
    }
    const { itemId, price } = request.data || {};
    if (!itemId || typeof itemId !== "string") {
      throw new HttpsError("invalid-argument", "itemId가 필요합니다.");
    }
    if (price !== null && price !== undefined) {
      if (typeof price !== "number" || price < 0 || price > 100000000) {
        throw new HttpsError("invalid-argument", "가격은 0~1억 사이의 숫자여야 합니다.");
      }
    }
    const govRef = db.doc(`governments/${classCode}`);
    const fieldPath = `avatarShopPriceOverrides.${itemId}`;
    if (price === null || price === undefined) {
      // override 제거 → 기본 가격으로 복귀
      await govRef.set(
        { avatarShopPriceOverrides: { [itemId]: admin.firestore.FieldValue.delete() } },
        { merge: true },
      );
      logger.info(`[updateAvatarShopPrice] ${classCode} ${itemId} override 제거 (기본가)`);
      return { success: true, removed: true };
    } else {
      await govRef.set(
        { [fieldPath]: Math.round(price) },
        { merge: true },
      );
      logger.info(`[updateAvatarShopPrice] ${classCode} ${itemId} → ${price}원`);
      return { success: true, price: Math.round(price) };
    }
  },
);

/**
 * 학급별 override 가격을 적용한 효과 가격 계산
 */
async function getEffectivePrice(classCode, itemId, basePrice) {
  try {
    const govDoc = await db.doc(`governments/${classCode}`).get();
    if (govDoc.exists) {
      const override = govDoc.data()?.avatarShopPriceOverrides?.[itemId];
      if (typeof override === "number" && override >= 0) {
        return override;
      }
    }
  } catch (e) {
    logger.warn(`[getEffectivePrice] ${classCode} ${itemId} 조회 실패:`, e.message);
  }
  return basePrice;
}

/**
 * 아바타 상점 아이템 구매 (서버사이드)
 *
 * - avatarShopItems/{itemId}에서 price·active 검증
 * - governments/{classCode}.avatarShopPriceOverrides 학급별 가격 override 적용
 * - 학생 cash 차감, ownedAvatarItems[itemId] 추가
 * - 관리자에게 매출 입금 (VAT 정책 적용)
 * - activity_logs 기록
 * - 멱등성: 이미 보유 시 fail-fast
 */
exports.purchaseAvatarItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { itemId, idempotencyKey } = request.data || {};

    if (!itemId || typeof itemId !== "string") {
      throw new HttpsError("invalid-argument", "itemId가 필요합니다.");
    }

    const userRef = db.collection("users").doc(uid);
    const itemRef = db.collection("avatarShopItems").doc(itemId);

    // 관리자 찾기
    let adminRef = null;
    try {
      const adminSnap = await findApprovedAdminSnap(classCode);
      if (!adminSnap.empty) {
        adminRef = adminSnap.docs[0].ref;
      }
    } catch (e) {
      logger.warn("[purchaseAvatarItem] 관리자 조회 실패:", e.message);
    }

    // VAT 세율
    let vatRate = 0.1;
    try {
      const govDoc = await db.doc(`governments/${classCode}`).get();
      if (govDoc.exists) {
        const rate = govDoc.data()?.taxSettings?.itemStoreVATRate;
        if (rate !== undefined) vatRate = rate;
      }
    } catch (e) {
      logger.warn("[purchaseAvatarItem] VAT 조회 실패, 기본 10%:", e.message);
    }

    const govRef = db.doc(`governments/${classCode}`);

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        const reads = [transaction.get(userRef), transaction.get(itemRef), transaction.get(govRef)];
        if (adminRef) reads.push(transaction.get(adminRef));
        const [userSnap, itemSnap, govSnapInTx, adminSnap] = await Promise.all(reads);

        if (!userSnap.exists) {
          throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        if (!itemSnap.exists) {
          throw new HttpsError("not-found", "아바타 아이템을 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const itemData = itemSnap.data();

        if (itemData.active === false) {
          throw new HttpsError("failed-precondition", "현재 판매 중지된 아이템입니다.");
        }

        // 이미 보유 시 차단
        const owned = userData.ownedAvatarItems || {};
        if (owned[itemId]) {
          throw new HttpsError("already-exists", "이미 보유 중인 아바타 아이템입니다.");
        }

        // 학급별 override 가격 적용 (transaction.get으로 정확히 읽음)
        const basePrice = Number(itemData.price) || 0;
        const govData = govSnapInTx?.exists ? govSnapInTx.data() : {};
        const currentOverride = govData?.avatarShopPriceOverrides?.[itemId];
        const price = (typeof currentOverride === "number" && currentOverride >= 0)
          ? currentOverride
          : basePrice;
        if (price < 0) {
          throw new HttpsError("failed-precondition", "유효하지 않은 가격입니다.");
        }
        // 무료 아이템(price=0) 허용 - 베이스 default 등

        const cash = Number(userData.cash) || 0;
        if (cash < price) {
          throw new HttpsError(
            "failed-precondition",
            `현금이 부족합니다. 필요 ${price.toLocaleString()}원 / 보유 ${cash.toLocaleString()}원`,
          );
        }

        // 학생 cash 차감 + ownedAvatarItems 추가
        const ownedKey = `ownedAvatarItems.${itemId}`;
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(-price),
          [ownedKey]: {
            slot: itemData.slot,
            name: itemData.name,
            rarity: itemData.rarity,
            imageUrl: itemData.imageUrl,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            price,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 거래 로그 (아바타 상점 구매)
        const avatarShopTxRef = userRef.collection("transactions").doc();
        transaction.set(avatarShopTxRef, {
          type: "avatarShopPurchase",
          amount: -price,
          description: `[아바타 상점] ${itemData.name} 구매 (${price.toLocaleString()}원)`,
          itemId,
          itemName: itemData.name,
          slot: itemData.slot,
          rarity: itemData.rarity,
          price,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 관리자에게 매출 입금
        const adminBuyer = adminRef && adminRef.path === userRef.path;
        let adminCashDelta = 0;
        if (adminRef && adminSnap && adminSnap.exists && !adminBuyer) {
          adminCashDelta = price;
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(adminCashDelta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // VAT 기록
        const vatAmount = Math.round((price * vatRate) / (1 + vatRate));
        if (vatAmount > 0) {
          const treasuryRef = db.collection("nationalTreasuries").doc(classCode);
          transaction.set(
            treasuryRef,
            {
              vatRevenue: admin.firestore.FieldValue.increment(vatAmount),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        // activity_logs - 구매자
        await logActivity(
          transaction,
          uid,
          LOG_TYPES.ITEM_PURCHASE,
          `아바타 아이템 구매: ${itemData.name} (-${price.toLocaleString()}원)`,
          { avatarItemId: itemId, slot: itemData.slot, rarity: itemData.rarity, price },
        );

        // activity_logs - 관리자 (매출)
        if (adminRef && adminCashDelta > 0) {
          await logActivity(
            transaction,
            adminRef.id,
            LOG_TYPES.CASH_INCOME,
            `아바타 상점 매출: ${itemData.name} +${adminCashDelta.toLocaleString()}원`,
            { avatarItemId: itemId, slot: itemData.slot, price, buyerId: uid },
          );
        }

        // 🔥 학급별 자동 가격 인상 (구매 1회당 1.1배)
        // 무료(price=0) 아이템은 인상 안 함
        // 최대 1억원 cap
        let nextPrice = null;
        if (price > 0) {
          nextPrice = Math.min(100000000, Math.round(price * 1.1));
          const fieldPath = `avatarShopPriceOverrides.${itemId}`;
          transaction.set(
            govRef,
            { [fieldPath]: nextPrice },
            { merge: true },
          );
        }

        // ✅ idempotency mark (모든 write 끝난 후)
        markIdempotent(transaction, idemKeyRef);

        return {
          itemId,
          itemName: itemData.name,
          slot: itemData.slot,
          price,
          nextPrice,
          vatAmount,
          adminCashDelta,
        };
      });

      logger.info(
        `[purchaseAvatarItem] ${uid}님 ${result.itemName} 구매 (${result.price.toLocaleString()}원)`,
      );
      return { success: true, ...result };
    } catch (error) {
      logger.error(`[purchaseAvatarItem] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "구매 처리 실패");
    }
  },
);
