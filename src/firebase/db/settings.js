// src/firebase/db/settings.js - 설정/정부/뱅킹/국고 관련

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
  getDocFromCache,
  onSnapshot,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  logDbOperation,
  setCache,
  getCache,
  invalidateCache,
} from "../firebaseUtils";

// =================================================================
// 정부 설정
// =================================================================
export const getGovernmentSettings = async (classCode, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  const cacheKey = `gov_settings_${classCode}`;
  if (useCache) {
    const cachedSettings = getCache(cacheKey, tab);
    if (cachedSettings) return cachedSettings;
  }
  try {
    const settingsRef = doc(db, "governmentSettings", classCode);
    let settingsSnap;
    let source = 'server';
    try {
      settingsSnap = await getDocFromCache(settingsRef);
      source = 'firestore-cache';
    } catch {
      settingsSnap = await getDoc(settingsRef);
      source = 'server';
    }
    logDbOperation('READ', 'governmentSettings', classCode, { tab, extra: `(${source})` });
    const result = settingsSnap.exists() ? settingsSnap.data() : null;
    if (result && useCache) setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[firebase.js] 정부 설정 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

export const updateGovernmentSettings = async (classCode, settings, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode || !settings) throw new Error("학급 코드와 설정 데이터가 필요합니다.");
  try {
    invalidateCache(`gov_settings_${classCode}`);
    logDbOperation('WRITE', 'governmentSettings', classCode, { tab });
    const settingsRef = doc(db, "governmentSettings", classCode);
    await setDoc(settingsRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error(`[firebase.js] 정부 설정 업데이트 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// =================================================================
// 국고
// =================================================================
export const getNationalTreasury = async (classCode, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  const cacheKey = `treasury_${classCode}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    const treasurySnap = await getDoc(treasuryRef);
    const result = treasurySnap.exists() ? treasurySnap.data() : null;
    logDbOperation('READ', 'nationalTreasuries', classCode, { tab });
    if (result && useCache) setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[firebase.js] 국고 조회 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// =================================================================
// 뱅킹 상품
// =================================================================
export const getBankingProducts = async (classCode, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  const cacheKey = `banking_${classCode}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  const docRef = doc(db, "bankingSettings", classCode);
  const docSnap = await getDoc(docRef);
  logDbOperation('READ', 'bankingSettings', classCode, { tab });
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (useCache) setCache(cacheKey, data);
    return data;
  } else {
    const defaultProducts = {
      deposits: [
        { id: 1, name: "일복리예금 90일", annualRate: 0.01, termInDays: 90, minAmount: 500000 },
        { id: 2, name: "일복리예금 180일", annualRate: 0.012, termInDays: 180, minAmount: 1000000 },
        { id: 3, name: "일복리예금 365일", annualRate: 0.015, termInDays: 365, minAmount: 2000000 },
      ],
      savings: [
        { id: 1, name: "일복리적금 180일", annualRate: 0.011, termInDays: 180, minAmount: 100000 },
        { id: 2, name: "일복리적금 365일", annualRate: 0.014, termInDays: 365, minAmount: 100000 },
        { id: 3, name: "일복리적금 730일", annualRate: 0.018, termInDays: 730, minAmount: 50000 },
      ],
      loans: [
        { id: 1, name: "일복리대출 90일", annualRate: 0.05, termInDays: 90, maxAmount: 3000000 },
        { id: 2, name: "일복리대출 365일", annualRate: 0.08, termInDays: 365, maxAmount: 10000000 },
        { id: 3, name: "일복리대출 730일", annualRate: 0.1, termInDays: 730, maxAmount: 50000000 },
      ]
    };
    logDbOperation('WRITE', 'bankingSettings', classCode, { tab, extra: '기본값 생성' });
    await setDoc(docRef, { ...defaultProducts, updatedAt: serverTimestamp() });
    if (useCache) setCache(cacheKey, defaultProducts);
    return defaultProducts;
  }
};

export const updateBankingProducts = async (classCode, productType, products, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  if (!['deposits', 'savings', 'loans'].includes(productType)) {
    throw new Error("유효하지 않은 상품 유형입니다.");
  }
  invalidateCache(`banking_${classCode}`);
  logDbOperation('WRITE', 'bankingSettings', classCode, { tab, extra: productType });
  const docRef = doc(db, "bankingSettings", classCode);
  await setDoc(docRef, { [productType]: products, updatedAt: serverTimestamp() }, { merge: true });
};

// =================================================================
// 마켓 요약 구독
// =================================================================
export const subscribeToMarketSummary = (classCode, callback, tab = 'unknown') => {
  if (!db) {
    console.error("Firestore가 초기화되지 않아 구독할 수 없습니다.");
    return () => {};
  }
  if (!classCode) {
    console.error("학급 코드가 없어 마켓 요약 데이터를 구독할 수 없습니다.");
    return () => {};
  }
  const summaryRef = doc(db, "classes", classCode, "marketSummary", "summary");
  logDbOperation('SUBSCRIBE', `classes/${classCode}/marketSummary`, 'summary', { tab });
  const unsubscribe = onSnapshot(
    summaryRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const summaryData = docSnap.data();
        logDbOperation('READ', `classes/${classCode}/marketSummary`, 'summary', { tab, extra: 'onSnapshot' });
        callback(summaryData);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error("[Market] 마켓 요약 데이터 구독 중 오류 발생:", error);
      callback(null);
    }
  );
  return unsubscribe;
};

// =================================================================
// 학급 기본 데이터 복사
// =================================================================
const SOURCE_CLASS_CODE = "CLASS2025";

export const copyDefaultDataToNewClass = async (newClassCode) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!newClassCode) throw new Error("새 학급 코드가 필요합니다.");
  const results = { jobs: { copied: 0, errors: 0 }, storeItems: { copied: 0, errors: 0 } };
  try {
    const batch = writeBatch(db);
    let batchCount = 0;
    const MAX_BATCH_SIZE = 400;

    const jobsQuery = originalFirebaseQuery(collection(db, "jobs"), originalFirebaseWhere("classCode", "==", SOURCE_CLASS_CODE));
    const jobsSnapshot = await getDocs(jobsQuery);
    for (const jobDoc of jobsSnapshot.docs) {
      const jobData = jobDoc.data();
      const newJobRef = doc(collection(db, "jobs"));
      batch.set(newJobRef, { ...jobData, classCode: newClassCode, createdAt: serverTimestamp(), copiedFrom: SOURCE_CLASS_CODE });
      results.jobs.copied++;
      batchCount++;
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
      }
    }

    const storeItemsQuery = originalFirebaseQuery(collection(db, "storeItems"), originalFirebaseWhere("classCode", "==", SOURCE_CLASS_CODE));
    const storeItemsSnapshot = await getDocs(storeItemsQuery);
    for (const itemDoc of storeItemsSnapshot.docs) {
      const itemData = itemDoc.data();
      const newItemRef = doc(collection(db, "storeItems"));
      batch.set(newItemRef, { ...itemData, classCode: newClassCode, createdAt: serverTimestamp(), copiedFrom: SOURCE_CLASS_CODE, stock: itemData.stock || 10 });
      results.storeItems.copied++;
      batchCount++;
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
    return { success: true, results, message: `직업 ${results.jobs.copied}개, 상점 아이템 ${results.storeItems.copied}개 복사 완료` };
  } catch (error) {
    console.error(`[firebase.js] 기본 데이터 복사 오류:`, error);
    return { success: false, results, error: error.message };
  }
};
