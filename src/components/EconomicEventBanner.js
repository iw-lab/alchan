// src/components/EconomicEventBanner.js
// 활성 경제 이벤트를 모든 사용자에게 표시하는 배너 컴포넌트
// 🔥 [최적화] onSnapshot 제거 → 공유 훅(useActiveEconomicEvent) 사용으로 리스너 1개 절감
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useActiveEconomicEvent } from "../hooks/useActiveEconomicEvent";
import { X, Zap } from "lucide-react";

export default function EconomicEventBanner() {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;
  const activeEventData = useActiveEconomicEvent();

  const [activeEvent, setActiveEvent] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!activeEventData || !classCode) {
      setActiveEvent(null);
      return;
    }

    // localStorage로 닫기 상태 유지
    const eventId = activeEventData.triggeredAt?.toMillis?.() || activeEventData.event?.id || "";
    const dismissKey = `eveBanner_${classCode}_${eventId}`;
    if (localStorage.getItem(dismissKey)) {
      setDismissed(true);
      setActiveEvent(activeEventData);
      return;
    }

    setActiveEvent({ ...activeEventData, _dismissKey: dismissKey });
    setDismissed(false); // 새 이벤트 발생 시 배너 다시 표시
  }, [activeEventData, classCode]);

  if (!activeEvent || dismissed) return null;

  const event = activeEvent.event || {};
  const result = activeEvent.result || {};
  const triggeredAt = activeEvent.triggeredAt?.toDate?.() || new Date();

  // 결과 요약 텍스트 생성
  const getResultSummary = () => {
    const type = event.type;
    if (type === "REAL_ESTATE_PRICE_CHANGE") {
      const pct = event.params?.changePercent || 0;
      return `부동산 ${result.affectedCount || 0}개 ${pct > 0 ? "+" : ""}${pct}% 변동`;
    }
    if (type === "TAX_REFUND") {
      if (result.refundedAmount > 0) {
        return `총 ${result.refundedAmount.toLocaleString()}원 환급 (1인당 ${result.perStudent?.toLocaleString() || 0}원)`;
      }
      return "국고가 부족해 환급이 이루어지지 않았습니다";
    }
    if (type === "TAX_EXTRA") {
      return `총 ${result.collectedAmount?.toLocaleString() || 0}원 추가 징수 (${result.affectedCount || 0}명)`;
    }
    if (type === "CASH_BONUS") {
      return `1인당 ${result.perStudent?.toLocaleString() || 0}원 지급 (${result.affectedCount || 0}명)`;
    }
    if (type === "LOTTERY") {
      if (result.winnerNames?.length > 0) {
        return `🎉 당첨자: ${result.winnerNames.join(", ")} (${result.prizeAmount?.toLocaleString() || 0}원)`;
      }
      return "추첨 완료";
    }
    return "";
  };

  const isPositive =
    [
      "REAL_ESTATE_PRICE_CHANGE",
      "TAX_REFUND",
      "CASH_BONUS",
      "LOTTERY",
    ].includes(event.type) &&
    !(
      event.type === "REAL_ESTATE_PRICE_CHANGE" &&
      (event.params?.changePercent || 0) < 0
    );

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
      className={`relative flex items-start gap-3 px-4 py-3 rounded-xl mx-1 mb-2 ${
        isPositive
          ? "bg-gradient-to-r from-emerald-900/60 to-teal-900/40 border border-emerald-500/20"
          : "bg-gradient-to-r from-red-900/60 to-rose-900/40 border border-red-500/20"
      }`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {/* 애니메이션 배경 */}
      {/* 배경 장식 (미세) */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none rounded-xl"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 50%)",
        }}
      />

      {/* 아이콘 */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg ${isPositive ? "bg-emerald-500/20 shadow-emerald-500/10 shadow-lg" : "bg-red-500/20 shadow-red-500/10 shadow-lg"}`}
      >
        {event.emoji || "⚡"}
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Zap
            className={`w-3.5 h-3.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`}
          />
          <span
            className={`text-xs font-bold uppercase tracking-wide ${isPositive ? "text-emerald-400" : "text-red-400"}`}
          >
            경제 이벤트
          </span>
          <span className="text-xs text-gray-400">
            {dateStr} {timeStr}
          </span>
        </div>
        <p className="text-sm font-bold text-white mt-0.5">{event.title}</p>
        <p className="text-xs text-gray-300 mt-0.5">{event.description}</p>
        {getResultSummary() && (
          <p
            className={`text-xs mt-1 font-medium ${isPositive ? "text-emerald-300" : "text-red-300"}`}
          >
            → {getResultSummary()}
          </p>
        )}
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={() => {
          if (activeEvent?._dismissKey) {
            localStorage.setItem(activeEvent._dismissKey, "1");
          }
          setDismissed(true);
        }}
        className="relative z-10 flex-shrink-0 p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="배너 닫기"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
