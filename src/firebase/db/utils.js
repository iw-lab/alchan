// src/firebase/db/utils.js - 유틸리티 및 배치 함수

import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";
import { logger } from '../../utils/logger';
import { setCache, getCache, CACHE_TTL } from "../firebaseUtils";


export const getCachedDocument = async (collectionName, docId, ttl = CACHE_TTL) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다");
  if (!collectionName || !docId) return null;
  const cacheKey = `doc_${collectionName}_${docId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  setCache(cacheKey, data);
  return data;
};

// =================================================================
// Cloud Functions
// =================================================================
export const processSettlement = async (settlementData) => {
  if (!functions) throw new Error("Firebase Functions가 초기화되지 않았습니다.");
  const processSettlementFunction = httpsCallable(functions, 'processSettlement');
  try {
    const result = await processSettlementFunction(settlementData);
    return result.data;
  } catch (error) {
    logger.error("[firebase.js] processSettlement Cloud Function 호출 오류:", error);
    throw new Error(error.message || "서버 함수 호출에 실패했습니다.");
  }
};

// 주간 세금(순자산세 + 부동산 보유세) 수동 징수 — 금요일 자동 징수와 동일 로직(클라우드)
export const collectWeeklyTaxes = async () => {
  if (!functions) throw new Error("Firebase Functions가 초기화되지 않았습니다.");
  const fn = httpsCallable(functions, 'collectWeeklyTaxesManual');
  try {
    const result = await fn({});
    return result.data;
  } catch (error) {
    logger.error("[firebase.js] collectWeeklyTaxesManual 호출 오류:", error);
    throw new Error(error.message || "세금 징수에 실패했습니다.");
  }
};

// 국세청장(교사 임명 국세청 직원) 학생용 주간 세금 징수 — 주 1회 쿨다운.
//   권한·쿨다운은 서버(collectWeeklyTaxesByOfficer)가 재검증한다. 반환: { success, skipped, weekKey, ... }
export const collectWeeklyTaxesAsOfficer = async () => {
  if (!functions) throw new Error("Firebase Functions가 초기화되지 않았습니다.");
  const fn = httpsCallable(functions, 'collectWeeklyTaxesByOfficer');
  try {
    const result = await fn({});
    return result.data;
  } catch (error) {
    logger.error("[firebase.js] collectWeeklyTaxesByOfficer 호출 오류:", error);
    throw new Error(error.message || "세금 징수에 실패했습니다.");
  }
};

