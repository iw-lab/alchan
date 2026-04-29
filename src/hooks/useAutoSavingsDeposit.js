// src/hooks/useAutoSavingsDeposit.js
// 적금 일일 자동 납입 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
//
// 가입일 기준으로 경과한 일수만큼 dailyAmount를 학생→선생님으로 이체하고
// depositsCount / totalDeposited 갱신. 만기 도달 후에는 useAutoDepositMature가 처리.
//
// 멱등성: 트랜잭션에서 product의 depositsCount를 읽고 필요한 만큼만 추가 납입.
// 학생 잔액 부족 시 그 회차에 대해 자동 납입 중단 (다음 진입 시 재시도).

import { useEffect, useRef } from "react";
import {
  db,
  doc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  increment,
  serverTimestamp,
} from "../firebase";
import { startOfDay, differenceInCalendarDays } from "date-fns";
import { logActivity, ACTIVITY_TYPES } from "../utils/firestoreHelpers";
import { logger } from "../utils/logger";

const toDate = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  return new Date(v);
};

export const useAutoSavingsDeposit = (userDoc, refreshUserDocument) => {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userDoc?.uid) return;
    if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;

    let cancelled = false;

    const checkAndDeposit = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const userId = userDoc.uid;

        const productsSnap = await getDocs(
          query(
            collection(db, "users", userId, "products"),
            where("type", "==", "savings"),
          ),
        );
        if (cancelled || productsSnap.empty) return;

        const today = startOfDay(new Date());

        for (const docSnap of productsSnap.docs) {
          if (cancelled) break;
          const data = docSnap.data();
          const dailyAmount = Number(data.dailyAmount || 0);
          const termInDays = Number(data.termInDays || 0);
          if (dailyAmount <= 0 || termInDays <= 0) continue;

          const startDate = toDate(data.startDate);
          if (!startDate) continue;

          // 가입일부터 오늘까지의 경과일 = 납입해야 할 누적 횟수
          // 가입 당일이 1회차 (가입 시 즉시 1회 납입됨)
          const daysSinceStart = differenceInCalendarDays(today, startOfDay(startDate));
          const expectedDeposits = Math.min(
            Math.max(1, daysSinceStart + 1),
            termInDays,
          );
          const currentDeposits = Number(data.depositsCount || 0);

          if (expectedDeposits <= currentDeposits) continue;

          const teacherId = data.teacherId;
          if (!teacherId) {
            logger.warn(
              `[자동 적금 납입] ${data.name}: teacherId 누락 - 스킵`,
            );
            continue;
          }

          const productRef = doc(db, "users", userId, "products", docSnap.id);
          const userRef = doc(db, "users", userId);
          const teacherRef = doc(db, "users", teacherId);

          try {
            const result = await runTransaction(db, async (transaction) => {
              const productSnapTx = await transaction.get(productRef);
              if (!productSnapTx.exists()) return { added: 0 };

              const pdata = productSnapTx.data();
              const curCount = Number(pdata.depositsCount || 0);
              const cap = Math.min(
                Math.max(1, daysSinceStart + 1),
                termInDays,
              );
              const need = cap - curCount;
              if (need <= 0) return { added: 0 };

              const userSnap = await transaction.get(userRef);
              const teacherSnap = await transaction.get(teacherRef);
              if (!userSnap.exists() || !teacherSnap.exists()) {
                return { added: 0 };
              }

              const userCash = Number(userSnap.data()?.cash ?? 0);
              // 학생 잔액 한도 내에서만 자동 납입 (마이너스 차감 X)
              const affordable = Math.min(
                need,
                Math.floor(userCash / dailyAmount),
              );
              if (affordable <= 0) {
                return { added: 0, reason: "insufficient_cash" };
              }

              const amount = dailyAmount * affordable;
              transaction.update(userRef, { cash: increment(-amount) });
              transaction.update(teacherRef, { cash: increment(amount) });
              transaction.update(productRef, {
                depositsCount: increment(affordable),
                totalDeposited: increment(amount),
                lastAutoDepositDate: serverTimestamp(),
              });
              return { added: affordable, amount };
            });

            if (result.added > 0) {
              logger.log(
                `[자동 적금 납입] ${data.name}: ${result.added}회차 +${result.amount} 납입 (학생→선생님)`,
              );
              logActivity(db, {
                classCode: userDoc.classCode,
                userId,
                userName: userDoc.name || "사용자",
                type: ACTIVITY_TYPES.DEPOSIT_CREATE,
                description: `${data.name} 적금 자동 납입 (${result.added}회차 × ${dailyAmount} = ${result.amount}) - 선생님 계정으로`,
                amount: -result.amount,
                metadata: {
                  productName: data.name,
                  productType: "savings",
                  dailyAmount,
                  installmentCount: result.added,
                  teacherId,
                  depositType: "auto",
                },
              });
            } else if (result.reason === "insufficient_cash") {
              logger.log(
                `[자동 적금 납입] ${data.name}: 잔액 부족으로 자동 납입 스킵`,
              );
            }
          } catch (txErr) {
            logger.error(
              `[자동 적금 납입] ${data.name} 트랜잭션 실패:`,
              txErr,
            );
          }
        }

        if (refreshUserDocument && !cancelled) {
          await refreshUserDocument();
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    checkAndDeposit();

    const onVisible = () => {
      if (document.visibilityState === "visible") checkAndDeposit();
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
