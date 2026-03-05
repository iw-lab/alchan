// src/components/NewBillPopup.js
// 새 법안 제안 시 투표 미참여 학생에게 팝업으로 알려주는 모달
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { X, ScrollText, Vote } from "lucide-react";

export default function NewBillPopup() {
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const classCode = userDoc?.classCode;
  const userId = userDoc?.id || userDoc?.uid;

  const [pendingBill, setPendingBill] = useState(null);
  const [visible, setVisible] = useState(false);
  const lastSeenBillIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!classCode || !userId) return;

    const lawsRef = collection(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws",
    );
    const q = query(lawsRef, where("status", "==", "pending"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // 초기 로드 시: 현재 존재하는 법안 ID를 기록만 해두고, 팝업은 표시하지 않음
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        const currentIds = new Set();
        snapshot.docs.forEach((d) => currentIds.add(d.id));
        lastSeenBillIdsRef.current = currentIds;
        return;
      }

      // 새로 추가된 법안 찾기
      const currentIds = new Set();
      snapshot.docs.forEach((d) => currentIds.add(d.id));

      let newBill = null;
      for (const docSnap of snapshot.docs) {
        const billId = docSnap.id;
        if (!lastSeenBillIdsRef.current.has(billId)) {
          // 새 법안 발견
          const billData = docSnap.data();

          // localStorage로 이미 확인한 법안인지 체크
          const seenKey = `billPopup_${classCode}_${billId}`;
          if (localStorage.getItem(seenKey)) continue;

          // 이미 투표했는지 확인
          if (billData.voters && billData.voters[userId]) continue;

          // userVotes 컬렉션에서도 확인
          try {
            const userVotesRef = doc(
              db,
              "classes",
              classCode,
              "userVotes",
              userId,
            );
            const userVotesSnap = await getDoc(userVotesRef);
            if (userVotesSnap.exists() && userVotesSnap.data()[billId])
              continue;
          } catch {
            // 에러 시 그냥 팝업 표시
          }

          newBill = { id: billId, ...billData, _seenKey: seenKey };
          break; // 가장 최근 새 법안 하나만
        }
      }

      lastSeenBillIdsRef.current = currentIds;

      if (newBill) {
        setPendingBill(newBill);
        setTimeout(() => setVisible(true), 50);
      }
    });

    return () => unsubscribe();
  }, [classCode, userId]);

  const handleClose = useCallback(() => {
    if (pendingBill?._seenKey) {
      localStorage.setItem(pendingBill._seenKey, "1");
    }
    setVisible(false);
    setTimeout(() => setPendingBill(null), 300);
  }, [pendingBill]);

  const handleGoVote = useCallback(() => {
    if (pendingBill?._seenKey) {
      localStorage.setItem(pendingBill._seenKey, "1");
    }
    setVisible(false);
    setTimeout(() => {
      setPendingBill(null);
      navigate("/national-assembly");
    }, 300);
  }, [pendingBill, navigate]);

  if (!pendingBill) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(6px)",
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
          maxWidth: 440,
          width: "100%",
          pointerEvents: "auto",
        }}
      >
        {/* 카드 */}
        <div
          style={{
            position: "relative",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            border: "1px solid rgba(245,158,11,0.4)",
            background: "linear-gradient(135deg, #0f172a 0%, #1c1917 50%, #0f172a 100%)",
          }}
        >
          {/* 상단 글로우 */}
          <div style={{ height: 3, background: "linear-gradient(90deg, #f59e0b, #eab308, #f59e0b)" }} />

          {/* 헤더 */}
          <div style={{ padding: "24px 24px 16px", display: "flex", alignItems: "flex-start", gap: "16px" }}>
            {/* 아이콘 */}
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <ScrollText style={{ width: 28, height: 28, color: "#f59e0b" }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 태그 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Vote style={{ width: 14, height: 14, color: "#f59e0b" }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#f59e0b", textTransform: "uppercase" }}>
                  새 법안 제안
                </span>
              </div>

              {/* 제목 */}
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", lineHeight: 1.3, margin: 0 }}>
                {pendingBill.title}
              </h2>

              {/* 제안자 */}
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                제안자: {pendingBill.proposerName || "익명"}
              </p>
            </div>

            {/* 닫기 버튼 */}
            <button
              onClick={handleClose}
              style={{ flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#1e293b", border: "none", color: "#94a3b8", cursor: "pointer", pointerEvents: "auto" }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* 구분선 */}
          <div style={{ margin: "0 24px", height: 1, background: "rgba(245,158,11,0.2)" }} />

          {/* 본문 */}
          <div style={{ padding: "16px 24px" }}>
            {/* 메시지 */}
            <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 12 }}>
              새 법안이 제안되었습니다! 찬반 투표에 참여해주세요.
            </p>

            {/* 법안 정보 */}
            <div style={{ borderRadius: 12, padding: 14, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
              {pendingBill.purpose && (
                <p style={{ fontSize: 14, color: "#fde68a", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "#fbbf24" }}>취지:</span>{" "}
                  {pendingBill.purpose}
                </p>
              )}
              {pendingBill.description && (
                <p style={{ fontSize: 14, color: "#fde68a", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: "#fbbf24" }}>설명:</span>{" "}
                  {pendingBill.description.length > 80
                    ? pendingBill.description.substring(0, 80) + "..."
                    : pendingBill.description}
                </p>
              )}
              {pendingBill.fine != null && (
                <p style={{ fontSize: 14, color: "#fde68a" }}>
                  <span style={{ fontWeight: 700, color: "#fbbf24" }}>벌금:</span>{" "}
                  {typeof pendingBill.fine === "number"
                    ? `${pendingBill.fine.toLocaleString()}알찬`
                    : pendingBill.fine}
                </p>
              )}
            </div>
          </div>

          {/* 버튼 영역 */}
          <div style={{ padding: "8px 24px 24px", display: "flex", gap: 12 }}>
            <button
              onClick={handleClose}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", pointerEvents: "auto", background: "#334155", color: "#e2e8f0", transition: "background 0.2s" }}
              onMouseEnter={(e) => { e.target.style.background = "#475569"; }}
              onMouseLeave={(e) => { e.target.style.background = "#334155"; }}
            >
              나중에
            </button>
            <button
              onClick={handleGoVote}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", pointerEvents: "auto", background: "#f59e0b", color: "#ffffff", boxShadow: "0 4px 15px rgba(245,158,11,0.3)", transition: "background 0.2s" }}
              onMouseEnter={(e) => { e.target.style.background = "#d97706"; }}
              onMouseLeave={(e) => { e.target.style.background = "#f59e0b"; }}
            >
              투표하러 가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
