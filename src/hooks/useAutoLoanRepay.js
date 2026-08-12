// src/hooks/useAutoLoanRepay.js
// 만기 도달 대출 자동 강제 상환 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
// 잔액 부족 시 마이너스 차감 허용 (강제 상환)

import { useEffect, useRef } from "react";
import { functions, httpsCallable } from "../firebase";
import { startOfDay } from "date-fns";
import { logger } from "../utils/logger";

/**
 * @param {object} userDoc
 * @param {function} refreshUserDocument
 * @param {Array|null} products `useStudentProducts` 가 읽어 온 상품 전량.
 *   null 이면 아직 안 읽은 것 — 아무 것도 하지 않는다.
 *   (예전엔 이 훅이 직접 `where(type==loan)` 으로 조회했다. 형제 훅 둘도 각자 조회해서
 *    같은 서브컬렉션을 세 번 읽었다 — useStudentProducts.js 헤더 참조.)
 */
export const useAutoLoanRepay = (userDoc, refreshUserDocument, products) => {
 // 같은 세션 내 동일 대출 중복 처리 방지
 const processedRef = useRef(new Set());
 // 동시 실행 방지
 const inFlightRef = useRef(false);

 useEffect(() => {
 if (!userDoc?.uid) return;
 // 학생만 대상 — 관리자/교사/슈퍼어드민 제외
 if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;
 if (!products) return; // 아직 안 읽음

 let cancelled = false;

 const checkAndForceRepay = async () => {
 if (inFlightRef.current) return;
 inFlightRef.current = true;
 try {
 const loans = products.filter((p) => p.type === "loan");
 if (cancelled || loans.length === 0) return;

 const today = startOfDay(new Date());
 const matured = [];
 loans.forEach((data) => {
 if (processedRef.current.has(data.id)) return;
 const maturity = data.maturityDate?.toDate
 ? data.maturityDate.toDate()
 : data.maturityDate
 ? new Date(data.maturityDate)
 : null;
 if (maturity && startOfDay(maturity) <= today) {
 matured.push(data);
 }
 });

 if (cancelled || matured.length === 0) return;

 // 🔒 만기 대출 강제 상환을 repayLoan CF(mode:maturity)로 처리. 구 클라 runTransaction은 본인·교사
 //   cash 직접 write라 batch6 rules 잠금 대상 → CF 이관. 이자·teacherId(누락 시 findApprovedAdminSnap
 //   폴백)·만기검증·활동로그 전부 서버 처리. 멱등키는 대출별 고정(autorepay_${id})으로 다중 탭/재진입
 //   이중 강제상환 차단. CF의 만기검증과 훅의 만기필터가 동일 기준(만기 도달)이라 정상 통과.
 const repayFn = httpsCallable(functions, "repayLoan");
 for (const loan of matured) {
 if (cancelled) break;
 processedRef.current.add(loan.id); // 실패 시 아래에서 롤백

 try {
 await repayFn({
 productId: String(loan.id),
 mode: "maturity",
 idempotencyKey: `autorepay_${loan.id}`,
 });
 logger.log(`[자동 강제 상환] ${loan.name}: 서버 CF 처리 완료`);
 } catch (err) {
 // 이미 처리됨(already-exists)·상품 없음은 다른 탭 선처리로 정상 — 로그만.
 if (err?.code === "functions/already-exists") {
 logger.log(`[자동 강제 상환] ${loan.name}: 이미 처리됨`);
 } else {
 logger.error(`[자동 강제 상환] ${loan.name} CF 실패:`, err);
 processedRef.current.delete(loan.id); // 다음 트리거에서 재시도 가능
 }
 }
 }

 if (refreshUserDocument && !cancelled) {
 await refreshUserDocument();
 }
 } finally {
 inFlightRef.current = false;
 }
 };

 // 상품 목록이 새로 들어올 때마다 체크한다. "다음 날 진입" 재체크는
 // useStudentProducts 가 **날짜가 실제로 바뀐 경우에만** 다시 읽어 주는 것으로 대신한다
 // (예전엔 탭 전환마다 재조회했다 — 목적은 같고 조회는 훨씬 적다).
 checkAndForceRepay();

 return () => {
 cancelled = true;
 };
 }, [
 products,
 userDoc?.uid,
 userDoc?.isAdmin,
 userDoc?.isSuperAdmin,
 userDoc?.isTeacher,
 refreshUserDocument,
 ]);
};
