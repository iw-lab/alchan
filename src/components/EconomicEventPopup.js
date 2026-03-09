// src/components/EconomicEventPopup.js
// 경제 이벤트 발생 시 학생에게 팝업으로 알려주는 모달
// 🔥 [최적화] onSnapshot 제거 → 공유 훅(useActiveEconomicEvent) 사용으로 리스너 1개 절감
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../contexts/AuthContext";
import { useActiveEconomicEvent } from "../hooks/useActiveEconomicEvent";
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
  const activeEventData = useActiveEconomicEvent();

  const [activeEvent, setActiveEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const lastEventIdRef = useRef(null);

  useEffect(() => {
    if (!activeEventData || !classCode) {
      setActiveEvent(null);
      return;
    }

    // 이미 확인한 이벤트인지 확인 (localStorage)
    const eventId = activeEventData.triggeredAt?.toMillis?.() || activeEventData.event?.id || "";
    const seenKey = `evePopup_${classCode}_${eventId}`;

    if (localStorage.getItem(seenKey)) return;

    // 새 이벤트
    if (lastEventIdRef.current !== eventId) {
      lastEventIdRef.current = eventId;
      setActiveEvent({ ...activeEventData, _seenKey: seenKey });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [activeEventData, classCode]);

  const handleClose = () => {
    if (activeEvent?._seenKey) {
      localStorage.setItem(activeEvent._seenKey, "1");
    }
    setVisible(false);
    setTimeout(() => {
      setActiveEvent(null);
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

  const positiveGrad = "from-emerald-600/90 via-emerald-700/95 to-teal-800/95";
  const negativeGrad = "from-red-600/90 via-red-700/95 to-rose-800/95";

  const popup = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 99999,
        background: visible ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(6px)" : "none",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 420,
          transform: visible
            ? "scale(1) translateY(0)"
            : "scale(0.85) translateY(30px)",
          opacity: visible ? 1 : 0,
          transition:
            "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
        }}
      >
        {/* 카드 */}
        <div
          className={`relative rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br ${isPositive ? positiveGrad : negativeGrad}`}
          style={{
            boxShadow: isPositive
              ? "0 0 60px rgba(16,185,129,0.3), 0 25px 50px rgba(0,0,0,0.5)"
              : "0 0 60px rgba(239,68,68,0.3), 0 25px 50px rgba(0,0,0,0.5)",
          }}
        >
          {/* 상단 글로우 라인 */}
          <div
            className={`h-1 ${isPositive ? "bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-300" : "bg-gradient-to-r from-red-300 via-orange-300 to-red-300"}`}
          />

          {/* 헤더 */}
          <div className="px-5 pt-5 pb-3 flex items-start gap-3">
            {/* 이모지 아이콘 */}
            <div
              className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
              style={{
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
              }}
            >
              {event.emoji || "⚡"}
            </div>

            <div className="flex-1 min-w-0">
              {/* 태그 */}
              <div className="flex items-center gap-1.5 mb-1">
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-200" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-200" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
                  경제 이벤트
                </span>
              </div>

              {/* 제목 */}
              <h2 className="text-lg font-bold text-white leading-tight font-jua">
                {event.title}
              </h2>

              {/* 날짜 */}
              <p className="text-xs text-white/50 mt-0.5">
                {dateStr} {timeStr} 발생
              </p>
            </div>

            {/* 닫기 버튼 */}
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white active:scale-90 transition-all"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 구분선 */}
          <div className="mx-5 h-px bg-white/15" />

          {/* 본문 */}
          <div className="px-5 py-4 space-y-3">
            {/* 이벤트 설명 */}
            {event.description && (
              <p className="text-sm text-white/80 leading-relaxed">
                {event.description}
              </p>
            )}

            {/* 영향 */}
            {detail.impact && (
              <div
                className="rounded-xl p-3"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-300" />
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    {detail.impact}
                  </p>
                </div>
              </div>
            )}

            {/* 팁 */}
            {detail.tip && (
              <p className="text-xs text-white/60 pl-1">💡 {detail.tip}</p>
            )}
          </div>

          {/* 확인 버튼 */}
          <div className="px-5 pb-5">
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] text-white font-jua"
              style={{
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
              }}
            >
              확인했어요 ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // portal로 렌더링하여 부모 요소의 overflow/transform에 영향받지 않음
  const portalTarget = document.getElementById("modal-root") || document.body;
  return ReactDOM.createPortal(popup, portalTarget);
}
