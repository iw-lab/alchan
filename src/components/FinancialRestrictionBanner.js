// src/components/FinancialRestrictionBanner.js
// 순자산 마이너스 또는 미상환 대출 보유 학생에게 제한 상태를 상단에 상시 알림.
import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getNetAssetsDetail } from "../utils/netAssets";
import { getIsIdle } from "../utils/idleManager";

// 🔥 [비용 최적화] 60초 → 5분. 제한 상태(순자산 마이너스/미상환 대출)는 천천히 변하고,
// 현금·쿠폰 변경은 아래 useEffect deps로 즉시 재평가되므로 5분 폴링으로 충분하다.
// 또한 탭 숨김/무조작 시엔 폴링을 건너뛴다(방치된 탭의 야간 읽기 차단).
const POLL_MS = 5 * 60 * 1000;

export default function FinancialRestrictionBanner() {
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ net: 0, loan: 0, ready: false });

  useEffect(() => {
    if (!userDoc?.id) return;
    if (userDoc?.isAdmin || userDoc?.isSuperAdmin || userDoc?.isTeacher) return;

    let cancelled = false;

    const load = async () => {
      try {
        // getNetAssetsDetail이 net·loan을 동일 (캐시 우선) 로드에서 함께 계산 →
        // loans 문서를 따로 또 읽지 않는다.
        const { net, loanTotal } = await getNetAssetsDetail({
          id: userDoc.id,
          cash: userDoc.cash,
          coupons: userDoc.coupons,
          name: userDoc.name,
          classCode: userDoc.classCode,
        });
        if (cancelled) return;
        setStatus({ net, loan: loanTotal, ready: true });
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, ready: true }));
      }
    };

    load();
    // 탭이 보이고 사용자가 활동 중일 때만 폴링(방치 탭은 건너뜀)
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || getIsIdle()) return;
      load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    userDoc?.id,
    userDoc?.cash,
    userDoc?.coupons,
    userDoc?.classCode,
    userDoc?.isAdmin,
    userDoc?.isSuperAdmin,
    userDoc?.isTeacher,
  ]);

  if (!status.ready) return null;
  if (userDoc?.isAdmin || userDoc?.isSuperAdmin || userDoc?.isTeacher)
    return null;

  const isNegative = status.net < 0;
  const hasLoan = status.loan > 0;
  if (!isNegative && !hasLoan) return null;

  const goBanking = () => navigate("/banking");

  return (
    <div
      className="relative flex items-start gap-3 px-4 py-3 rounded-xl mx-1 mb-2 bg-gradient-to-r from-red-50 to-rose-50 border border-red-300"
      role="alert"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/20 text-red-700">
        <AlertTriangle size={20} strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-red-600">
          이용 제한 안내
        </div>
        <p className="text-sm font-bold text-slate-800 mt-0.5">
          {isNegative
            ? `순자산이 마이너스입니다 (${Number(status.net).toLocaleString()}원)`
            : `미상환 대출이 남아있습니다 (${Number(status.loan).toLocaleString()}원)`}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          {isNegative
            ? hasLoan
              ? "상점 구매·주식/부동산 투자·대출 신청·경매·함께구매가 제한됩니다. 대출 상환으로 자산을 회복해주세요."
              : "상점 구매·주식/부동산 투자·대출 신청·경매·함께구매가 제한됩니다. 과제·급여로 현금을 모으거나 보유 주식·부동산을 매각해 회복해주세요."
            : "기존 대출을 전부 상환하기 전까지 추가 대출을 신청할 수 없습니다."}
        </p>
      </div>
      <button
        onClick={goBanking}
        className="flex-shrink-0 self-center px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm"
      >
        은행으로 가기
      </button>
    </div>
  );
}
