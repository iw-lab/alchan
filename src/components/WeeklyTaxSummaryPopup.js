// src/components/WeeklyTaxSummaryPopup.js
// 매주 금요일 세금 징수 후 학생에게 "어떤 세금이 얼마 나갔는지" 알려주는 팝업
// userDoc.pendingTaxSummary가 있을 때만 표시 → "확인" 클릭 시 필드 삭제 (dismiss)

import React, { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { logger } from "../utils/logger";

const formatPct = (rate) => `${(rate * 100).toFixed(2)}%`;
const formatWon = (n) => `${Number(n || 0).toLocaleString()}원`;

export default function WeeklyTaxSummaryPopup({ userDoc, userId }) {
  const [closing, setClosing] = useState(false);
  const summary = userDoc?.pendingTaxSummary;

  if (!summary || !Array.isArray(summary.items)) return null;

  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        pendingTaxSummary: deleteField(),
      });
    } catch (err) {
      logger.error("[WeeklyTaxSummary] dismiss 실패:", err);
    }
  };

  const totalAmount = Number(summary.total) || 0;
  const isTaxFree = totalAmount === 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5 animate-fadeIn"
      style={{ background: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(6px)" }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl overflow-hidden shadow-2xl animate-slideUp"
        style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="px-6 py-5 border-b"
          style={{
            background: isTaxFree
              ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
              : "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
            borderColor: "#e2e8f0",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{isTaxFree ? "🎁" : "📊"}</span>
            <div>
              <h2 className="text-lg font-bold m-0" style={{ color: "#0f172a" }}>
                {isTaxFree ? "이번 주 세금 없음!" : "이번 주 세금 안내"}
              </h2>
              <p className="text-xs mt-1" style={{ color: "#475569" }}>
                {summary.weekKey} · 금요일 자동 징수
              </p>
            </div>
          </div>
        </div>

        {/* 학급 거시지표 정보 */}
        <div
          className="px-6 py-3 border-b text-xs"
          style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span>
              🏫 우리 학급 평균 순자산:{" "}
              <strong style={{ color: "#0f172a" }}>{formatWon(summary.avgClassNet)}</strong>
            </span>
            <span>
              기본세율 <strong style={{ color: "#4338ca" }}>{formatPct(summary.classBaseRate)}</strong>
            </span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
            <span>
              👤 내 순자산:{" "}
              <strong style={{ color: "#0f172a" }}>{formatWon(summary.personalNetAssets)}</strong>
            </span>
            <span>
              내 누진 배율{" "}
              <strong
                style={{
                  color:
                    summary.personalMultiplier === 0
                      ? "#15803d"
                      : summary.personalMultiplier >= 2
                        ? "#dc2626"
                        : "#0f172a",
                }}
              >
                {summary.personalMultiplier}×
              </strong>
            </span>
          </div>
        </div>

        {/* 세금 항목 리스트 */}
        <div className="px-6 py-5 space-y-3">
          {summary.items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl p-4 border"
              style={{
                background: item.amount > 0 ? "#fef2f2" : "#f0fdf4",
                borderColor: item.amount > 0 ? "#fecaca" : "#bbf7d0",
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-bold" style={{ color: "#0f172a" }}>
                    {item.label}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                    {item.basisLabel} {formatWon(item.basis)} × {formatPct(item.rate)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-lg font-bold tabular-nums"
                    style={{ color: item.amount > 0 ? "#dc2626" : "#15803d" }}
                  >
                    {item.amount > 0 ? "-" : ""}
                    {formatWon(item.amount)}
                  </p>
                </div>
              </div>
              {/* 계산식 / 비고 */}
              <div className="text-[11px] mt-1" style={{ color: "#64748b" }}>
                {item.note ? (
                  <span style={{ color: item.amount > 0 ? "#b91c1c" : "#15803d" }}>
                    ℹ️ {item.note}
                  </span>
                ) : (
                  <span>
                    학급 기본 {formatPct(item.classBaseRate)} × 내 배율 {item.multiplier}× ={" "}
                    <strong>{formatPct(item.rate)}</strong>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 총합 */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between"
          style={{ background: "#fafbfc", borderColor: "#e2e8f0" }}
        >
          <span className="text-sm font-semibold" style={{ color: "#475569" }}>
            이번 주 총 세금
          </span>
          <span
            className="text-xl font-bold tabular-nums"
            style={{ color: totalAmount > 0 ? "#dc2626" : "#15803d" }}
          >
            {totalAmount > 0 ? "-" : ""}
            {formatWon(totalAmount)}
          </span>
        </div>

        {/* 확인 버튼 */}
        <div className="px-6 py-4">
          <button
            onClick={handleClose}
            disabled={closing}
            className="w-full py-3 rounded-xl text-sm font-bold transition disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "#ffffff",
              boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
            }}
          >
            {closing ? "확인 중..." : "확인했어요 ✓"}
          </button>
          <p className="text-center text-[11px] mt-2" style={{ color: "#94a3b8" }}>
            왜 이런 세금이 부과되는지 궁금하면 선생님께 물어보세요!
          </p>
        </div>
      </div>
    </div>
  );
}
