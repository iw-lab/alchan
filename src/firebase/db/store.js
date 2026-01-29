// src/firebase/db/store.js - 상점/인벤토리/마켓 관련

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
  increment,
  runTransaction,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
  addDoc as originalFirebaseAddDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  logDbOperation,
  setCache,
  getCache,
  invalidateCache,
  invalidateCachePattern,
} from "../firebaseUtils";
import { addActivityLog } from "./users";
import { getGovernmentSettings } from "./settings";

// =================================================================
// 상점 아이템
// =================================================================
export const getStoreItems = async (classCode, useCache = true) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode) throw new Error("[firebase.js] classCode is required to get store items.");
  const cacheKey = `store_items_${classCode}`;
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const itemsColRef = collection(db, "storeItems");
  const q = originalFirebaseQuery(itemsColRef, originalFirebaseWhere("classCode", "==", classCode));
  const itemSnapshot = await getDocs(q);
  const result = itemSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (useCache) setCache(cacheKey, result);
  return result;
};

export const addStoreItem = async (itemData, classCode) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode) throw new Error("[firebase.js] classCode is required to add a store item.");
  if (!itemData || !itemData.name || typeof itemData.price !== "number" || typeof itemData.stock !== "number") {
    throw new Error("유효하지 않은 아이템 데이터 (name, price, stock 필수).");
  }
  invalidateCache(`store_items_${classCode}`);
  const itemsColRef = collection(db, "storeItems");
  const docRef = await originalFirebaseAddDoc(itemsColRef, {
    ...itemData,
    classCode: classCode,
    initialStock: itemData.initialStock ?? itemData.stock,
    available: itemData.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef;
};

export const updateStoreItem = async (itemId, updates) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId || !updates || Object.keys(updates).length === 0) {
    throw new Error("아이템 ID 또는 업데이트 데이터가 유효하지 않습니다.");
  }
  invalidateCachePattern('store_items_');
  const itemRef = doc(db, "storeItems", itemId);
  await updateDoc(itemRef, { ...updates, updatedAt: serverTimestamp() });
  return true;
};

export const deleteStoreItem = async (itemId) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!itemId) throw new Error("아이템 ID가 유효하지 않습니다.");
  invalidateCachePattern('store_items_');
  const itemRef = doc(db, "storeItems", itemId);
  await deleteDoc(itemRef);
  return true;
};

// =================================================================
// 인벤토리
// =================================================================
export const addItemToInventory = async (userId, storeItemId, quantity, itemDetails = {}) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!userId || !storeItemId || typeof quantity !== "number" || quantity <= 0) {
    throw new Error("사용자 ID, 아이템 ID 또는 수량이 유효하지 않습니다.");
  }
  const inventoryColRef = collection(db, "users", userId, "inventory");
  const q = originalFirebaseQuery(inventoryColRef, originalFirebaseWhere("itemId", "==", storeItemId));
  const querySnapshot = await getDocs(q);
  const itemName = itemDetails.name || "Unknown Item";
  if (!querySnapshot.empty) {
    const inventoryDoc = querySnapshot.docs[0];
    const inventoryItemRef = doc(db, "users", userId, "inventory", inventoryDoc.id);
    await updateDoc(inventoryItemRef, { quantity: increment(quantity), updatedAt: serverTimestamp() });
  } else {
    const newItemRef = doc(inventoryColRef);
    await setDoc(newItemRef, {
      itemId: storeItemId,
      quantity: quantity,
      name: itemName,
      icon: itemDetails.icon || "\u{2753}",
      type: itemDetails.type || "item",
      purchasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await addActivityLog(userId, "아이템 획득", `${itemName} ${quantity}개를 획득했습니다.`);
  return true;
};

export const purchaseItemTransaction = async (userId, storeItemId, userClassCode, quantityToPurchase = 1, skipCashDeduction = false) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId || !storeItemId || !userClassCode || typeof quantityToPurchase !== "number" || quantityToPurchase <= 0) {
    throw new Error("[firebase.js] 사용자 ID, 아이템 ID, 학급 코드 또는 구매 수량이 유효하지 않습니다.");
  }
  invalidateCache(`user_${userId}`);
  const storeItemRef = doc(db, "storeItems", storeItemId);
  const userRef = doc(db, "users", userId);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", userClassCode);

  let totalItemPrice = 0;
  let vatAmount = 0;
  let finalPriceWithVAT = 0;
  let autoRestockOccurred = false;
  let purchasedItemName = "알 수 없는 아이템";

  try {
    const governmentSettings = await getGovernmentSettings(userClassCode);
    let itemStoreVATRate = 0.1;
    if (governmentSettings?.taxSettings?.itemStoreVATRate !== undefined) {
      itemStoreVATRate = governmentSettings.taxSettings.itemStoreVATRate;
    }

    const inventoryColRef = collection(db, "users", userId, "inventory");
    const inventoryQuery = originalFirebaseQuery(inventoryColRef, originalFirebaseWhere("itemId", "==", storeItemId));
    const inventoryQuerySnapshot = await getDocs(inventoryQuery);

    await runTransaction(db, async (transaction) => {
      const [storeItemSnap, userSnap, treasurySnap] = await Promise.all([
        transaction.get(storeItemRef),
        skipCashDeduction ? Promise.resolve(null) : transaction.get(userRef),
        transaction.get(nationalTreasuryRef)
      ]);

      if (!storeItemSnap.exists()) {
        throw new Error(`[firebase.js] 상점 아이템 (ID: ${storeItemId})을 찾을 수 없습니다.`);
      }
      const storeItemData = storeItemSnap.data();
      purchasedItemName = storeItemData.name || "알 수 없는 아이템";

      let userData = null;
      if (!skipCashDeduction && userSnap) {
        if (!userSnap.exists()) {
          throw new Error(`[firebase.js] 사용자 (ID: ${userId})를 찾을 수 없습니다.`);
        }
        userData = userSnap.data();
      }

      if (storeItemData.classCode !== userClassCode) {
        throw new Error(`[firebase.js] 아이템 '${storeItemData.name}'(ID: ${storeItemId})은 현재 학급(${userClassCode})의 상품이 아닙니다.`);
      }
      if (!storeItemData.available) {
        throw new Error(`[firebase.js] 아이템 '${storeItemData.name}'은 현재 구매할 수 없습니다.`);
      }
      if (storeItemData.stock < quantityToPurchase) {
        throw new Error(`[firebase.js] 아이템 '${storeItemData.name}'의 재고가 부족합니다.`);
      }

      const itemPricePerUnit = storeItemData.price;
      totalItemPrice = itemPricePerUnit * quantityToPurchase;
      vatAmount = Math.round(totalItemPrice * itemStoreVATRate);
      finalPriceWithVAT = totalItemPrice + vatAmount;

      if (!skipCashDeduction && userData) {
        if ((userData.cash || 0) < finalPriceWithVAT) {
          throw new Error(`[firebase.js] 현금이 부족합니다. (필요: ${finalPriceWithVAT})`);
        }
      }

      const currentStock = storeItemData.stock || 0;
      const newStock = currentStock - quantityToPurchase;
      let itemUpdate = { updatedAt: serverTimestamp() };

      if (newStock <= 0 && storeItemData.initialStock > 0) {
        autoRestockOccurred = true;
        const priceIncreaseRate = storeItemData.outOfStockPriceIncreaseRate || 10;
        const newPrice = Math.round(storeItemData.price * (1 + priceIncreaseRate / 100));
        const restockAmount = storeItemData.initialStock || 10;
        itemUpdate = { ...itemUpdate, stock: restockAmount, price: newPrice };
      } else {
        itemUpdate = { ...itemUpdate, stock: newStock };
      }
      transaction.update(storeItemRef, itemUpdate);

      if (!skipCashDeduction && userData) {
        transaction.update(userRef, { cash: increment(-finalPriceWithVAT), updatedAt: serverTimestamp() });
      }

      if (!inventoryQuerySnapshot.empty) {
        const inventoryDoc = inventoryQuerySnapshot.docs[0];
        const inventoryItemRef = doc(inventoryColRef, inventoryDoc.id);
        transaction.update(inventoryItemRef, { quantity: increment(quantityToPurchase), updatedAt: serverTimestamp() });
      } else {
        const newInventoryItemRef = doc(inventoryColRef);
        transaction.set(newInventoryItemRef, {
          itemId: storeItemId,
          quantity: quantityToPurchase,
          name: storeItemData.name || "Unknown Item",
          icon: storeItemData.icon || "\u{2753}",
          type: storeItemData.type || "item",
          purchasedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (vatAmount > 0) {
        if (treasurySnap.exists()) {
          transaction.update(nationalTreasuryRef, {
            totalAmount: increment(vatAmount),
            vatRevenue: increment(vatAmount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          transaction.set(nationalTreasuryRef, {
            totalAmount: vatAmount,
            vatRevenue: vatAmount,
            stockTaxRevenue: 0,
            realEstateTransactionTaxRevenue: 0,
            auctionTaxRevenue: 0,
            propertyHoldingTaxRevenue: 0,
            itemMarketTaxRevenue: 0,
            incomeTaxRevenue: 0,
            corporateTaxRevenue: 0,
            otherTaxRevenue: 0,
            lastUpdated: serverTimestamp(),
          });
        }
      }
    });

    const logDescription = `상점에서 ${purchasedItemName} ${quantityToPurchase}개를 ${finalPriceWithVAT}원에 구매했습니다. (부가세 ${vatAmount}원 포함)`;
    await addActivityLog(userId, '아이템 구매', logDescription);
    return { success: true, itemPrice: totalItemPrice, vat: vatAmount, autoRestocked: autoRestockOccurred };
  } catch (error) {
    console.error(`[firebase.js] purchaseItemTransaction 오류:`, error);
    throw error;
  }
};

export const getUserInventory = async (userId, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("사용자 ID가 필요합니다.");
  const cacheKey = `inventory_${userId}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const inventoryRef = collection(db, "users", userId, "inventory");
    const inventorySnapshot = await getDocs(inventoryRef);
    const inventory = inventorySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    logDbOperation('READ', `users/${userId}/inventory`, null, { tab, extra: `${inventory.length}개 아이템` });
    if (useCache) setCache(cacheKey, inventory);
    return inventory;
  } catch (error) {
    console.error(`[firebase.js] 인벤토리 조회 오류 (사용자: ${userId}):`, error);
    throw error;
  }
};

export const updateUserInventoryItemQuantity = async (userId, inventoryItemId, quantityChange, logMessage, context = '') => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!userId || !inventoryItemId || typeof quantityChange !== "number") {
    throw new Error("사용자 ID, 인벤토리 아이템 ID 또는 수량 변경 값이 유효하지 않습니다.");
  }
  const itemRef = doc(db, "users", userId, "inventory", inventoryItemId);
  try {
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) {
      if (quantityChange > 0) {
        return { success: false, error: "아이템을 찾을 수 없습니다.", deleted: false };
      }
      return { success: true, newQuantity: 0, deleted: true, message: "아이템이 이미 존재하지 않습니다." };
    }
    const itemData = itemSnap.data();
    const currentQuantity = itemData.quantity || 0;
    const newQuantity = currentQuantity + quantityChange;
    const itemName = itemData.name || '알 수 없는 아이템';
    if (newQuantity < 0) throw new Error("아이템 수량이 0보다 작아질 수 없습니다.");
    if (newQuantity === 0) {
      await deleteDoc(itemRef);
      if (quantityChange < 0) {
        const usedQuantity = Math.abs(quantityChange);
        const contextText = context ? ` (${context})` : '';
        const effect = itemData.effect || '효과 없음';
        await addActivityLog(userId, '아이템 사용', `${itemName} ${usedQuantity}개를 사용했습니다.${contextText} 효과: ${effect}`);
      }
      return { success: true, newQuantity: 0, deleted: true };
    } else {
      await updateDoc(itemRef, { quantity: newQuantity, updatedAt: serverTimestamp() });
      if (quantityChange < 0) {
        const usedQuantity = Math.abs(quantityChange);
        const contextText = context ? ` (${context})` : '';
        const effect = itemData.effect || '효과 없음';
        await addActivityLog(userId, '아이템 사용', `${itemName} ${usedQuantity}개를 사용했습니다.${contextText} 효과: ${effect} (잔여: ${newQuantity}개)`);
      } else if (quantityChange > 0) {
        await addActivityLog(userId, '아이템 획득', `${itemName} ${quantityChange}개를 획득했습니다. (총 ${newQuantity}개)`);
      }
      return { success: true, newQuantity, deleted: false };
    }
  } catch (error) {
    console.error(`[firebase.js] 인벤토리 아이템 수량 변경 오류 (ID: ${inventoryItemId}):`, error);
    throw error;
  }
};

// =================================================================
// 아이템 마켓
// =================================================================
export const addMarketListing = async (listingData, classCode) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!classCode) throw new Error("[firebase.js] classCode is required for market listing.");
  if (!listingData || !listingData.sellerId || !listingData.inventoryItemId || !listingData.originalStoreItemId ||
      !listingData.name || typeof listingData.quantity !== "number" || listingData.quantity <= 0 ||
      typeof listingData.pricePerItem !== "number" || listingData.pricePerItem <= 0) {
    throw new Error("유효하지 않은 시장 등록 데이터입니다.");
  }
  invalidateCachePattern(`market_${classCode}`);
  const marketColRef = collection(db, "marketItems");
  try {
    const docRef = await originalFirebaseAddDoc(marketColRef, {
      ...listingData,
      classCode: classCode,
      status: "active",
      listedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const logDescription = `${listingData.name} ${listingData.quantity}개를 개당 ${listingData.pricePerItem}원에 판매 등록했습니다.`;
    await addActivityLog(listingData.sellerId, '아이템 시장 등록', logDescription);
    return { success: true, listingId: docRef.id, data: { ...listingData, classCode } };
  } catch (error) {
    console.error("[firebase.js] 아이템 시장 등록 실패:", error);
    throw error;
  }
};

export const getMarketItems = async (classCode, status = "active", useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  const cacheKey = `market_${classCode}_${status}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const marketRef = collection(db, "marketItems");
    let q = originalFirebaseQuery(marketRef, originalFirebaseWhere("classCode", "==", classCode));
    if (status) {
      q = originalFirebaseQuery(marketRef,
        originalFirebaseWhere("classCode", "==", classCode),
        originalFirebaseWhere("status", "==", status)
      );
    }
    const marketSnapshot = await getDocs(q);
    const marketItems = marketSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    logDbOperation('READ', 'marketItems', null, { tab, extra: `${classCode}: ${marketItems.length}개` });
    if (useCache) setCache(cacheKey, marketItems);
    return marketItems;
  } catch (error) {
    console.error(`[firebase.js] 마켓 아이템 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

export const updateMarketListing = async (listingId, updates, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!listingId || !updates) throw new Error("리스팅 ID와 업데이트 데이터가 필요합니다.");
  invalidateCachePattern('market_');
  logDbOperation('UPDATE', 'marketItems', listingId, { tab });
  try {
    const listingRef = doc(db, "marketItems", listingId);
    await updateDoc(listingRef, { ...updates, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.error(`[firebase.js] 마켓 리스팅 업데이트 오류 (ID: ${listingId}):`, error);
    throw error;
  }
};
