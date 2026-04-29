// src/hooks/useAutoDepositMature.js
// 만기 도달 예금/적금 자동 지급 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
// 대출의 useAutoLoanRepay와 대칭: 선생님 → 학생 (원금+이자), 선생님 잔액 마이너스 허용

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

// 예금 만기 총액 (일복리: balance * (1 + dailyRate/100)^termInDays)
const calculateDepositMaturity = (principal, dailyRate, days) => {
  if (!principal || principal <= 0 || !dailyRate || !days || days <= 0) {
    return { total: principal || 0, interest: 0 };
  }
  const total = Math.round(principal * Math.pow(1 + dailyRate / 100, days));
  return { total, interest: total - principal };
};

// 적금 만기 총액: 매일 dailyAmount 납입 시 각 납입금이 남은 기간만큼 복리
// 만기 시점엔 termInDays 전체를 납입한 것으로 가정 (부족분은 만기 처리 트랜잭션에서 일괄 차감)
const calculateSavingsMaturity = (dailyAmount, dailyRate, termInDays) => {
  if (!dailyAmount || dailyAmount <= 0 || !dailyRate || termInDays <= 0) {
    return { total: 0, interest: 0, totalDeposited: 0 };
  }
  const r = dailyRate / 100;
  let total = 0;
  for (let i = 0; i < termInDays; i++) {
    const daysOfInterest = termInDays - i;
    total += dailyAmount * Math.pow(1 + r, daysOfInterest);
  }
  const totalDeposited = dailyAmount * termInDays;
  return {
    total: Math.round(total),
    interest: Math.round(total - totalDeposited),
    totalDeposited,
  };
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
    logger.error("[자동 만기 지급] 선생님 계정 조회 오류:", e);
    return null;
  }
};

export const useAutoDepositMature = (userDoc, refreshUserDocument) => {
  const processedRef = useRef(new Set());
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userDoc?.uid) return;
    if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;

    let cancelled = false;

    const checkAndPayout = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const userId = userDoc.uid;

        // 학생의 예금 + 적금 상품 조회
        const productsSnap = await getDocs(
          query(
            collection(db, "users", userId, "products"),
            where("type", "in", ["deposit", "savings"]),
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

        const fallbackTeacherId = await findTeacherAccountId(userDoc.classCode);

        for (const product of matured) {
          if (cancelled) break;

          const teacherId = product.teacherId || fallbackTeacherId;
          if (!teacherId) {
            logger.error(
              `[자동 만기 지급] 선생님 계정을 찾을 수 없음 - ${product.name} 처리 스킵`,
            );
            continue;
          }

          processedRef.current.add(product.id);

          const isSavings = product.type === "savings" && product.dailyAmount > 0;
          let total, interest, principal;
          if (isSavings) {
            const result = calculateSavingsMaturity(
              product.dailyAmount,
              product.rate,
              product.termInDays,
            );
            total = result.total;
            interest = result.interest;
            principal = result.totalDeposited;
          } else {
            const result = calculateDepositMaturity(
              product.balance,
              product.rate,
              product.termInDays,
            );
            total = result.total;
            interest = result.interest;
            principal = product.balance;
          }
          if (!total || total <= 0) continue;

          const productRef = doc(
            db,
            "users",
            userId,
            "products",
            String(product.id),
          );
          const userRef = doc(db, "users", userId);
          const teacherRef = doc(db, "users", teacherId);

          try {
            const txResult = await runTransaction(db, async (transaction) => {
              // 다른 디바이스/탭이 먼저 처리했으면 noop
              const productSnap = await transaction.get(productRef);
              if (!productSnap.exists()) return { skipped: true };

              const pdata = productSnap.data();

              // 적금: 만기 시점에 미납 회차가 있으면 일괄 차감 (잔액 마이너스 허용)
              // 그 후 만기 총액(termInDays 전체 납입 기준) 지급
              let arrearsAmount = 0;
              if (isSavings) {
                const curDeposits = Number(pdata.depositsCount || 0);
                const missing = Math.max(0, product.termInDays - curDeposits);
                arrearsAmount = missing * Number(pdata.dailyAmount || product.dailyAmount);
              }

              const studentDelta = total - arrearsAmount;
              const teacherDelta = -total + arrearsAmount;

              transaction.update(userRef, { cash: increment(studentDelta) });
              transaction.update(teacherRef, { cash: increment(teacherDelta) });
              transaction.delete(productRef);
              return { skipped: false, arrearsAmount, studentDelta };
            });

            if (txResult?.skipped) continue;

            logger.log(
              `[자동 만기 지급] ${product.name}: 학생 순지급 ${txResult.studentDelta} (만기 +${total}, 적금 미납 차감 -${txResult.arrearsAmount}), 원금 ${principal}, 이자 ${interest}`,
            );

            logActivity(db, {
              classCode: userDoc.classCode,
              userId,
              userName: userDoc.name || "사용자",
              type: ACTIVITY_TYPES.DEPOSIT_MATURITY,
              description: `${product.name} 만기 자동 수령 (원금: ${principal}, 이자: ${interest}, 총: ${total}${isSavings && txResult.arrearsAmount > 0 ? `, 미납 일괄 ${txResult.arrearsAmount}` : ""}) - 선생님 계정에서`,
              amount: txResult.studentDelta,
              metadata: {
                productName: product.name,
                productType: product.type,
                principal,
                interest,
                total,
                arrearsAmount: txResult.arrearsAmount,
                teacherId,
                payoutType: "auto",
              },
            });
          } catch (txErr) {
            logger.error(
              `[자동 만기 지급] ${product.name} 트랜잭션 실패:`,
              txErr,
            );
            processedRef.current.delete(product.id);
          }
        }

        if (refreshUserDocument && !cancelled) {
          await refreshUserDocument();
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    checkAndPayout();

    const onVisible = () => {
      if (document.visibilityState === "visible") checkAndPayout();
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
