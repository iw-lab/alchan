// src/hooks/useAutoLoanRepay.js
// 만기 도달 대출 자동 강제 상환 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
// 잔액 부족 시 마이너스 차감 허용 (강제 상환)

import { useEffect, useRef } from "react";
import {
 db,
 doc,
 collection,
 query,
 where,
 getDocs,
 limit,
 runTransaction,
 increment,
} from "../firebase";
import { startOfDay } from "date-fns";
import { logActivity, ACTIVITY_TYPES } from "../utils/firestoreHelpers";
import { logger } from "../utils/logger";

// 만기 시 총 상환금 계산 (복리: balance * (1 + dailyRate/100)^termInDays)
const calculateMaturityTotal = (principal, dailyRate, days) => {
 if (!principal || principal <= 0 || !dailyRate || !days || days <= 0) {
 return { total: principal || 0, interest: 0 };
 }
 const total = Math.round(principal * Math.pow(1 + dailyRate / 100, days));
 return { total, interest: total - principal };
};

const findTeacherAccountId = async (classCode) => {
 if (!classCode) return null;
 try {
 const q = query(
 collection(db, "users"),
 where("classCode", "==", classCode),
 where("isAdmin", "==", true),
 limit(1),
 );
 const snap = await getDocs(q);
 return snap.empty ? null : snap.docs[0].id;
 } catch (e) {
 logger.error("[자동 강제 상환] 선생님 계정 조회 오류:", e);
 return null;
 }
};

export const useAutoLoanRepay = (userDoc, refreshUserDocument) => {
 // 같은 세션 내 동일 대출 중복 처리 방지
 const processedRef = useRef(new Set());
 // 동시 실행 방지
 const inFlightRef = useRef(false);

 useEffect(() => {
 if (!userDoc?.uid) return;
 // 학생만 대상 — 관리자/교사/슈퍼어드민 제외
 if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;

 let cancelled = false;

 const checkAndForceRepay = async () => {
 if (inFlightRef.current) return;
 inFlightRef.current = true;
 try {
 const userId = userDoc.uid;

 // 학생의 대출 상품만 조회
 const productsSnap = await getDocs(
 query(
 collection(db, "users", userId, "products"),
 where("type", "==", "loan"),
 ),
 );
 if (cancelled || productsSnap.empty) return;

 const today = startOfDay(new Date());
 const matured = [];
 productsSnap.forEach((docSnap) => {
 const data = docSnap.data();
 if (processedRef.current.has(docSnap.id)) return;
 const maturity = data.maturityDate?.toDate
 ? data.maturityDate.toDate()
 : data.maturityDate
 ? new Date(data.maturityDate)
 : null;
 if (maturity && startOfDay(maturity) <= today) {
 matured.push({ id: docSnap.id, ...data });
 }
 });

 if (cancelled || matured.length === 0) return;

 // 선생님 계정 조회 (대출에 teacherId가 저장돼 있으면 우선 사용)
 const fallbackTeacherId = await findTeacherAccountId(userDoc.classCode);

 for (const loan of matured) {
 if (cancelled) break;

 const teacherId = loan.teacherId || fallbackTeacherId;
 if (!teacherId) {
 logger.error(
 `[자동 강제 상환] 선생님 계정을 찾을 수 없음 - ${loan.name} 처리 스킵`,
 );
 continue;
 }

 // 처리 시도 마킹 (실패 시 아래에서 롤백)
 processedRef.current.add(loan.id);

 const { total, interest } = calculateMaturityTotal(
 loan.balance,
 loan.rate,
 loan.termInDays,
 );
 if (!total || total <= 0) continue;

 const productRef = doc(
 db,
 "users",
 userId,
 "products",
 String(loan.id),
 );
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherId);

 try {
 await runTransaction(db, async (transaction) => {
 // 다른 디바이스/탭이 먼저 처리했으면 noop
 const productSnap = await transaction.get(productRef);
 if (!productSnap.exists()) return;

 transaction.update(userRef, { cash: increment(-total) });
 transaction.update(teacherRef, { cash: increment(total) });
 transaction.delete(productRef);
 });

 logger.log(
 `[자동 강제 상환] ${loan.name}: 학생 -${total}, 선생님 +${total} (이자 ${interest})`,
 );

 logActivity(db, {
 classCode: userDoc.classCode,
 userId,
 userName: userDoc.name || "사용자",
 type: ACTIVITY_TYPES.LOAN_REPAY,
 description: `대출 만기 자동 강제 상환: ${loan.name} (원금: ${loan.balance}, 이자: ${interest}, 총: ${total})`,
 amount: -total,
 metadata: {
 productName: loan.name,
 principal: loan.balance,
 interest,
 total,
 teacherId,
 repaymentType: "auto_force",
 },
 });
 } catch (txErr) {
 logger.error(
 `[자동 강제 상환] ${loan.name} 트랜잭션 실패:`,
 txErr,
 );
 // 다음 트리거에서 재시도 가능하도록 롤백
 processedRef.current.delete(loan.id);
 }
 }

 if (refreshUserDocument && !cancelled) {
 await refreshUserDocument();
 }
 } finally {
 inFlightRef.current = false;
 }
 };

 // 1) 마운트/로그인 시 1회 체크
 checkAndForceRepay();

 // 2) 탭이 백그라운드에서 활성으로 돌아올 때 재체크 (다음 날 진입 케이스 커버)
 const onVisible = () => {
 if (document.visibilityState === "visible") checkAndForceRepay();
 };
 document.addEventListener("visibilitychange", onVisible);

 return () => {
 cancelled = true;
 document.removeEventListener("visibilitychange", onVisible);
 };
 }, [
 userDoc?.uid,
 userDoc?.isAdmin,
 userDoc?.isSuperAdmin,
 userDoc?.isTeacher,
 userDoc?.classCode,
 userDoc?.name,
 refreshUserDocument,
 ]);
};
