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
          maxWidth: 440,
          width: "100%",
        }}
      >
        {/* 카드 */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-amber-500/40 bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900">
          {/* 상단 글로우 */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400" />

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
          <div className="relative px-6 pt-6 pb-4 flex items-start gap-4">
            {/* 아이콘 */}
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg bg-amber-500/20 ring-1 ring-amber-500/30">
              <ScrollText className="w-8 h-8 text-amber-400" />
            </div>

            <div className="flex-1 min-w-0">
              {/* 태그 */}
              <div className="flex items-center gap-2 mb-1">
                <Vote className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  새 법안 제안
                </span>
              </div>

              {/* 제목 */}
              <h2 className="text-xl font-bold text-white leading-tight">
                {pendingBill.title}
              </h2>

              {/* 제안자 */}
              <p className="text-xs text-slate-500 mt-0.5">
                제안자: {pendingBill.proposerName || "익명"}
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
          <div className="mx-6 h-px bg-amber-500/20" />

          {/* 본문 */}
          <div className="relative px-6 py-4 space-y-3">
            {/* 메시지 */}
            <p className="text-sm text-slate-300 leading-relaxed">
              새 법안이 제안되었습니다! 찬반 투표에 참여해주세요.
            </p>

            {/* 법안 정보 */}
            <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/20">
              {pendingBill.purpose && (
                <p className="text-sm text-amber-200 mb-1">
                  <span className="font-semibold text-amber-300">취지:</span>{" "}
                  {pendingBill.purpose}
                </p>
              )}
              {pendingBill.description && (
                <p className="text-sm text-amber-200 mb-1">
                  <span className="font-semibold text-amber-300">설명:</span>{" "}
                  {pendingBill.description.length > 80
                    ? pendingBill.description.substring(0, 80) + "..."
                    : pendingBill.description}
                </p>
              )}
              {pendingBill.fine && (
                <p className="text-sm text-amber-200">
                  <span className="font-semibold text-amber-300">벌금:</span>{" "}
                  {pendingBill.fine}
                </p>
              )}
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] bg-slate-700 hover:bg-slate-600 text-slate-300"
            >
              나중에
            </button>
            <button
              onClick={handleGoVote}
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/25"
            >
              투표하러 가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
