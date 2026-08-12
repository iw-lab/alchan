// src/hooks/useAutoDepositMature.js
// 만기 도달 예금/적금 자동 지급 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
// 대출의 useAutoLoanRepay와 대칭: 선생님 → 학생 (원금+이자), 선생님 잔액 마이너스 허용

import { useEffect, useRef } from "react";
import { functions, httpsCallable } from "../firebase";
import { startOfDay } from "date-fns";
import { logger } from "../utils/logger";

/**
 * @param {Array|null} products `useStudentProducts` 가 읽어 온 상품 전량(형제 훅과 공유).
 *   종전엔 이 훅이 `type in [deposit, savings]` 로 따로 조회했는데, savings 는
 *   useAutoSavingsDeposit 의 쿼리와 겹쳐 **같은 문서를 두 번** 읽고 있었다.
 */
export const useAutoDepositMature = (
  userDoc,
  refreshUserDocument,
  products,
) => {
  const processedRef = useRef(new Set());
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userDoc?.uid) return;
    if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;
    if (!products) return;

    let cancelled = false;

    const checkAndPayout = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // 예금 + 적금 (대출은 useAutoLoanRepay 담당)
        const candidates = products.filter(
          (p) => p.type === "deposit" || p.type === "savings",
        );
        if (cancelled || candidates.length === 0) return;

        const today = startOfDay(new Date());
        const matured = [];
        candidates.forEach((data) => {
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

        // 🔒 만기 예적금 자동 수령을 redeemDepositSavings CF(mode:maturity)로 처리. 구 클라 runTransaction은
        //   본인·교사 cash 직접 write라 batch6 rules 잠금 대상 → CF 이관. 이자·적금 arrears·teacherId(누락 시
        //   findApprovedAdminSnap 폴백)·만기검증·활동로그 전부 서버 처리. 멱등키는 상품별 고정(automature_${id})
        //   으로 다중 탭/재진입 이중 지급 차단. CF 만기검증과 훅 만기필터가 동일 기준이라 정상 통과.
        const redeemFn = httpsCallable(functions, "redeemDepositSavings");
        for (const product of matured) {
          if (cancelled) break;
          processedRef.current.add(product.id); // 실패 시 아래에서 롤백

          try {
            await redeemFn({
              productId: String(product.id),
              mode: "maturity",
              idempotencyKey: `automature_${product.id}`,
            });
            logger.log(`[자동 만기 지급] ${product.name}: 서버 CF 처리 완료`);
          } catch (err) {
            // 이미 처리됨(already-exists)·상품 없음은 다른 탭 선처리로 정상 — 로그만.
            if (err?.code === "functions/already-exists") {
              logger.log(`[자동 만기 지급] ${product.name}: 이미 처리됨`);
            } else {
              logger.error(`[자동 만기 지급] ${product.name} CF 실패:`, err);
              processedRef.current.delete(product.id); // 다음 트리거에서 재시도 가능
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

    // 상품 목록이 새로 들어올 때마다 체크. "다음 날 진입" 재체크는 useStudentProducts 가
    // 날짜가 실제로 바뀐 경우에만 다시 읽어 주는 것으로 대신한다.
    checkAndPayout();

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
