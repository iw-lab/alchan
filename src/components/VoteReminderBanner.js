// src/components/VoteReminderBanner.js
// 투표 미참여 법안이 있을 때 모든 페이지 상단에 표시되는 전역 배너
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const POLL_INTERVAL = 15 * 60 * 1000; // 15분

export default function VoteReminderBanner() {
  const { userDoc, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const classCode = userDoc?.classCode;
  const userId = userDoc?.id || userDoc?.uid;

  const [unvotedCount, setUnvotedCount] = useState(0);
  const mountedRef = useRef(true);

  const checkUnvoted = useCallback(async () => {
    if (!classCode || !userId) {
      setUnvotedCount(0);
      return;
    }
    try {
      const lawsRef = collection(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
      );
      const q = query(lawsRef, where("status", "==", "pending"));
      const snapshot = await getDocs(q);

      let userVotesData = {};
      try {
        const userVotesRef = doc(
          db,
          "classes",
          classCode,
          "userVotes",
          userId,
        );
        const userVotesSnap = await getDoc(userVotesRef);
        if (userVotesSnap.exists()) {
          userVotesData = userVotesSnap.data() || {};
        }
      } catch {
        /* ignore */
      }

      let count = 0;
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.voters && data.voters[userId]) return;
        if (userVotesData[d.id]) return;
        count += 1;
      });

      if (mountedRef.current) setUnvotedCount(count);
    } catch {
      /* ignore */
    }
  }, [classCode, userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!classCode || !userId || (isAdmin && isAdmin())) {
      setUnvotedCount(0);
      return () => {
        mountedRef.current = false;
      };
    }

    checkUnvoted();
    const interval = setInterval(checkUnvoted, POLL_INTERVAL);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkUnvoted();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [classCode, userId, isAdmin, checkUnvoted]);

  // 국회 페이지에서는 이미 페이지 내부에 동일한 배너가 있으므로 숨김
  if (location.pathname === "/national-assembly") return null;
  if (!unvotedCount) return null;
  if (isAdmin && isAdmin()) return null;

  return (
    <div
      onClick={() => navigate("/national-assembly")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fffbeb",
        border: "1px solid #fbbf24",
        borderRadius: 10,
        padding: "12px 16px",
        margin: "12px 16px 0",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#fef3c7";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#fffbeb";
      }}
    >
      <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>📢</span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flex: 1,
          minWidth: 0,
          fontSize: "0.95rem",
          color: "#1e293b",
          fontWeight: 500,
        }}
      >
        <strong style={{ color: "#b45309", fontSize: "1rem" }}>
          투표 참여 안내
        </strong>
        <span>
          아직 투표하지 않은 심의중 법안이{" "}
          <strong style={{ color: "#b45309" }}>{unvotedCount}건</strong>{" "}
          있습니다. 찬반 투표에 참여해주세요!
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate("/national-assembly");
        }}
        style={{
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          border: "none",
          borderRadius: 8,
          color: "#ffffff",
          cursor: "pointer",
          fontSize: "0.85rem",
          fontWeight: 600,
          padding: "8px 16px",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        투표하러 가기
      </button>
    </div>
  );
}
