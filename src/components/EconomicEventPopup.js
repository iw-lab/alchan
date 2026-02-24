// src/components/EconomicEventPopup.js
// 경제 이벤트 발생 시 학생에게 팝업으로 알려주는 모달
import React, { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { X, TrendingUp, TrendingDown, Zap } from "lucide-react";

// 이벤트 타입별 상세 설명
const EVENT_DETAILS = {
  REAL_ESTATE_PRICE_CHANGE: (params, result) => {
    const pct = params?.changePercent || 0;
    return {
      isPositive: pct > 0,
      impact: `부동산 ${result?.affectedCount || 0}개 가격이 ${pct > 0 ? "+" : ""}${pct}% 변동되었습니다.`,
      tip:
        pct > 0
          ? "부동산 자산 가치가 올라갔어요! 매도 타이밍을 고려해보세요."
          : "부동산 가격이 내려갔어요. 저렴하게 매수할 기회일 수 있어요.",
    };
  },
  TAX_REFUND: (params, result) => ({
    isPositive: true,
    impact:
      result?.refundedAmount > 0
        ? `1인당 ${result?.perStudent?.toLocaleString() || 0}원 세금이 환급되었습니다! (총 ${result?.refundedAmount?.toLocaleString() || 0}원)`
        : "국고가 부족해 세금 환급이 이루어지지 않았습니다.",
    tip:
      result?.refundedAmount > 0
        ? "내 계좌를 확인해보세요!"
        : "국고를 채워야 다음 환급이 가능해요.",
  }),
  TAX_EXTRA: (params, result) => ({
    isPositive: false,
    impact: `모든 시민에게 추가 세금이 부과되었습니다. (현금의 ${((params?.taxRate || 0) * 100).toFixed(0)}%)`,
    tip: `총 ${result?.collectedAmount?.toLocaleString() || 0}원이 국고로 이전되었습니다.`,
  }),
  CASH_BONUS: (params, result) => ({
    isPositive: true,
    impact: `1인당 ${result?.perStudent?.toLocaleString() || params?.amount?.toLocaleString() || 0}원 지원금이 지급되었습니다!`,
    tip: "내 계좌에 지원금이 입금되었어요! 확인해보세요.",
  }),
  CASH_PENALTY: (params, result) => ({
    isPositive: false,
    impact: `경제 위기로 모든 시민의 현금 ${((params?.penaltyRate || 0) * 100).toFixed(0)}%가 삭감되었습니다.`,
    tip: `총 ${result?.collectedAmount?.toLocaleString() || 0}원이 국고로 이전되었습니다.`,
  }),
  STORE_PRICE_CHANGE: (params, result) => {
    const mult = params?.multiplier || 1;
    return {
      isPositive: mult < 1,
      impact:
        mult >= 1
          ? `관리자 상점 모든 상품 가격이 ${mult}배로 인상되었습니다.`
          : `관리자 상점 모든 상품 가격이 절반으로 인하되었습니다!`,
      tip:
        mult >= 1
          ? `${result?.affectedCount || 0}개 상품 가격이 올랐어요. 구매를 서두르면 손해!`
          : `${result?.affectedCount || 0}개 상품이 할인 중! 지금이 구매 기회!`,
    };
  },
  STOCK_TAX_CHANGE: (params) => {
    const mult = params?.multiplier ?? 1;
    return {
      isPositive: mult === 0,
      impact:
        mult === 0
          ? "24시간 동안 주식 거래세·양도세가 완전 면제됩니다!"
          : `24시간 동안 주식 거래세·양도세가 ${mult}배로 인상됩니다!`,
      tip:
        mult === 0
          ? "지금 주식 거래하면 세금 0원! 적극 활용하세요!"
          : "주식 거래 비용이 늘었어요. 신중하게 거래하세요.",
    };
  },
  MARKET_FEE_CHANGE: (params) => {
    const mult = params?.multiplier ?? 1;
    return {
      isPositive: mult === 0,
      impact:
        mult === 0
          ? "24시간 동안 개인상점 거래 수수료가 0%입니다!"
          : `24시간 동안 개인상점 거래 수수료가 ${mult}배로 인상됩니다!`,
      tip:
        mult === 0
          ? "수수료 없이 자유롭게 거래하세요!"
          : "개인상점 거래 비용이 증가했어요. 주의하세요.",
    };
  },
};

export default function EconomicEventPopup() {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  const [activeEvent, setActiveEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const lastEventIdRef = useRef(null);

  useEffect(() => {
    if (!classCode) return;

    const ref = doc(db, "activeEconomicEvent", classCode);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setActiveEvent(null);
        return;
      }

      const data = snap.data();

      // 만료 확인
      const expires = data.expiresAt?.toDate?.();
      if (expires && expires < new Date()) {
        setActiveEvent(null);
        return;
      }

      // 이미 확인한 이벤트인지 확인 (localStorage)
      const eventId = data.triggeredAt?.toMillis?.() || data.event?.id || "";
      const seenKey = `evePopup_${classCode}_${eventId}`;

      if (localStorage.getItem(seenKey)) return; // 이미 확인함

      // 새 이벤트
      if (lastEventIdRef.current !== eventId) {
        lastEventIdRef.current = eventId;
        setActiveEvent({ ...data, _seenKey: seenKey });
        setAnimating(true);
        setTimeout(() => {
          setVisible(true);
          setAnimating(false);
        }, 50);
      }
    });

    return () => unsubscribe();
  }, [classCode]);

  const handleClose = () => {
    if (activeEvent?._seenKey) {
      localStorage.setItem(activeEvent._seenKey, "1");
    }
    setVisible(false);
    setTimeout(() => {
      setActiveEvent(null);
      setAnimating(false);
    }, 300);
  };

  if (!activeEvent) return null;

  const event = activeEvent.event || {};
  const result = activeEvent.result || {};
  const triggeredAt = activeEvent.triggeredAt?.toDate?.() || new Date();

  const detailFn = EVENT_DETAILS[event.type];
  const detail = detailFn
    ? detailFn(event.params, result)
    : { isPositive: true, impact: "", tip: "" };
  const isPositive = detail.isPositive;

  const timeStr = triggeredAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = triggeredAt.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          transform: visible
            ? "scale(1) translateY(0)"
            : "scale(0.9) translateY(20px)",
          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          maxWidth: 480,
          width: "100%",
        }}
      >
        {/* 카드 */}
        <div
          className={`relative rounded-2xl overflow-hidden shadow-2xl border ${
            isPositive
              ? "border-emerald-500/40 bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-900"
              : "border-red-500/40 bg-gradient-to-br from-slate-900 via-red-950/40 to-slate-900"
          }`}
        >
          {/* 상단 글로우 */}
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${isPositive ? "bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400" : "bg-gradient-to-r from-red-400 via-orange-400 to-red-400"}`}
          />

          {/* 배경 패턴 */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 50%, white 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* 헤더 */}
          <div className={`relative px-6 pt-6 pb-4 flex items-start gap-4`}>
            {/* 이모지 아이콘 */}
            <div
              className={`flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg ${
                isPositive
                  ? "bg-emerald-500/20 ring-1 ring-emerald-500/30"
                  : "bg-red-500/20 ring-1 ring-red-500/30"
              }`}
            >
              {event.emoji || "⚡"}
            </div>

            <div className="flex-1 min-w-0">
              {/* 태그 */}
              <div className="flex items-center gap-2 mb-1">
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                )}
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                >
                  오늘의 경제 이벤트
                </span>
              </div>

              {/* 제목 */}
              <h2 className="text-xl font-bold text-white leading-tight">
                {event.title}
              </h2>

              {/* 날짜 */}
              <p className="text-xs text-slate-500 mt-0.5">
                {dateStr} {timeStr} 발생
              </p>
            </div>

            {/* 닫기 버튼 */}
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 구분선 */}
          <div
            className={`mx-6 h-px ${isPositive ? "bg-emerald-500/20" : "bg-red-500/20"}`}
          />

          {/* 본문 */}
          <div className="relative px-6 py-4 space-y-3">
            {/* 이벤트 설명 */}
            <p className="text-sm text-slate-300 leading-relaxed">
              {event.description}
            </p>

            {/* 영향 */}
            {detail.impact && (
              <div
                className={`rounded-xl p-3 ${isPositive ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}
              >
                <div className="flex items-start gap-2">
                  <Zap
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                  />
                  <p
                    className={`text-sm font-medium ${isPositive ? "text-emerald-300" : "text-red-300"}`}
                  >
                    {detail.impact}
                  </p>
                </div>
              </div>
            )}

            {/* 팁 */}
            {detail.tip && (
              <p className="text-xs text-slate-300 pl-1">💡 {detail.tip}</p>
            )}
          </div>

          {/* 확인 버튼 */}
          <div className="px-6 pb-6">
            <button
              onClick={handleClose}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                isPositive
                  ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25"
                  : "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/25"
              }`}
            >
              확인했어요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
