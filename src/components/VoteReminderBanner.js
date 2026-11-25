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
import { Megaphone } from "lucide-react";
import { startBackgroundPoll } from "../utils/backgroundPoll";

const POLL_INTERVAL = 15 * 60 * 1000; // 15분
const RESUME_GAP = 5 * 60 * 1000; // 탭 복귀 재조회 최소 간격

export default function VoteReminderBanner() {
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const classCode = userDoc?.classCode;
  const userId = userDoc?.id || userDoc?.uid;
  // 🔥 [읽기최적화] isAdmin() 함수 대신 boolean 파생값 사용. isAdmin 함수는 useAuth에서
  //   deps [userDoc]라 cash 변동(onSnapshot)마다 identity가 바뀌어 아래 effect를 재실행→
  //   매번 checkUnvoted(getDocs+getDoc) 재호출하던 bug-class. boolean은 값이 같으면 effect 미실행.
  const isAdminBool = !!(
    userDoc &&
    (userDoc.isAdmin === true ||
      userDoc.role === "admin" ||
      userDoc.isSuperAdmin === true)
  );

  const [unvotedCount, setUnvotedCount] = useState(0);
  const mountedRef = useRef(true);
  const lastCheckRef = useRef(0); // 🔥 [읽기최적화] 탭 전환 재폴링 쿨다운용

  const checkUnvoted = useCallback(async () => {
    if (!classCode || !userId) {
      setUnvotedCount(0);
      return;
    }
    lastCheckRef.current = Date.now();
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
    if (!classCode || !userId || isAdminBool) {
      setUnvotedCount(0);
      return () => {
        mountedRef.current = false;
      };
    }

    checkUnvoted();
    // 🔥 [읽기최적화] 탭 숨김/무조작(idle) 중엔 tick 건너뜀 + 복귀 시 5분 경과했을 때만 1회 조회.
    //   (종전엔 tick에 가드가 없어 백그라운드 탭이 15분마다 계속 법안을 조회했다)
    const stopPoll = startBackgroundPoll(checkUnvoted, POLL_INTERVAL, {
      resumeGapMs: RESUME_GAP,
    });

    return () => {
      mountedRef.current = false;
      stopPoll();
    };
  }, [classCode, userId, isAdminBool, checkUnvoted]);

  // 국회 페이지에서는 이미 페이지 내부에 동일한 배너가 있으므로 숨김
  if (location.pathname === "/national-assembly") return null;
  if (!unvotedCount) return null;
  if (isAdminBool) return null;

  return (
    <div
      onClick={() => navigate("/national-assembly")}
      className="app-notice flex items-center gap-2.5 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-400 cursor-pointer transition-colors"
    >
      <Megaphone size={20} strokeWidth={2.2} className="flex-shrink-0 text-amber-700" aria-hidden="true" />
      <p className="flex-1 min-w-0 text-[13px] sm:text-sm text-slate-800 leading-snug">
        <strong className="text-amber-800">투표 안 한 법안 {unvotedCount}건</strong>
        <span className="hidden sm:inline"> · 심의 중인 법안에 찬반 투표해 주세요!</span>
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate("/national-assembly");
        }}
        className="flex-shrink-0 px-3 min-h-[40px] rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold whitespace-nowrap"
      >
        투표하러 가기
      </button>
    </div>
  );
}
