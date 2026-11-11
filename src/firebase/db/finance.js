// src/firebase/db/finance.js — 재난 보험·신용 기록(2026-11-11). 화면은 읽기만 하고, 돈이 움직이는 일은 CF 가 한다.
//   insurancePolicies/{classCode}_{uid} · creditRecords/{uid} = 서버만 쓴다(rules write:false).
//   학급 스위치 = bankingSettings/{classCode}.insurance.enabled / .creditLink.enabled (없으면 켜짐).
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";
import { invalidateCache } from "../firebaseUtils";

/** 내 보험 정책(없으면 null). */
export async function fetchInsurancePolicy(classCode, userId) {
  if (!classCode || !userId) return null;
  const snap = await getDoc(doc(db, "insurancePolicies", `${classCode}_${userId}`));
  return snap.exists() ? snap.data() : null;
}

/** 내 신용 기록(없으면 null). */
export async function fetchCreditRecord(userId) {
  if (!userId) return null;
  const snap = await getDoc(doc(db, "creditRecords", userId));
  return snap.exists() ? snap.data() : null;
}

/** 학급 스위치. 문서·필드가 없으면 둘 다 켜짐. */
export async function fetchFinanceSwitches(classCode) {
  if (!classCode) return { insurance: true, creditLink: true };
  const snap = await getDoc(doc(db, "bankingSettings", classCode));
  const d = snap.exists() ? snap.data() : {};
  return { insurance: d?.insurance?.enabled !== false, creditLink: d?.creditLink?.enabled !== false };
}

/** 교사: 스위치 저장. key = "insurance" | "creditLink" */
export async function saveFinanceSwitch(classCode, key, enabled) {
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  if (key !== "insurance" && key !== "creditLink") throw new Error("알 수 없는 설정입니다.");
  await setDoc(doc(db, "bankingSettings", classCode), { [key]: { enabled: !!enabled }, updatedAt: serverTimestamp() }, { merge: true });
  invalidateCache(`banking_${classCode}`);
}

/** 보험 가입 — 보험료·한도는 서버가 정한다(화면이 보낸 값은 없다). */
export async function buyInsurance() {
  const res = await httpsCallable(functions, "buyInsurance")({ idempotencyKey: crypto.randomUUID() });
  return res.data;
}
