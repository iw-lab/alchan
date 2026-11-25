// src/components/NicknameSetupPopup.js
// 첫 로그인 학생 별명 **고르기** 팝업
//
// 🔴 2026-09-17: 자유 입력칸을 없앴다.
//    이 팝업이 자유 입력이던 동안 학생 62명 중 28명이 자기 실명을 적어 넣었다.
//    "실명 쓰지 마세요" 안내로는 못 막는다 — 쓸 칸이 있으면 쓴다. 그래서 칸을 없앴다.
//    수집하지 않은 것은 샐 수 없고, 유출돼도 개인정보 유출이 아니다.
//    누가 누군지는 출석번호가 구분한다(반 안에서 유일, 반 밖에서는 무의미).

import React, { useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, doc, updateDoc } from "../firebase";
import { makeAliasChoices, buildDisplayName } from "../utils/alias";

const CHOICE_COUNT = 4;

export default function NicknameSetupPopup() {
  const { userDoc, setUserDoc } = useAuth();
  const [choices, setChoices] = useState(() => makeAliasChoices(CHOICE_COUNT));
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const reroll = useCallback(() => {
    setChoices(makeAliasChoices(CHOICE_COUNT));
    setPicked(null);
    setError("");
  }, []);

  // 학생만 + 아직 별명 설정 안 한 경우만 표시
  const isStudent =
    userDoc?.uid &&
    !userDoc?.isAdmin &&
    !userDoc?.isSuperAdmin &&
    !userDoc?.isTeacher;

  if (!isStudent || userDoc?.hasSetNickname) return null;

  const studentNumber = userDoc?.studentNumber;

  const handleSubmit = async () => {
    if (!picked) {
      setError("별명을 하나 골라주세요.");
      return;
    }
    // 🔴 화면에 쓰는 이름은 여기서 한 번만 합친다. 이름을 표시하는 곳이 329군데라
    //    표시 시점마다 번호를 붙이게 하면 그중 몇 곳은 반드시 빠진다.
    const displayName = buildDisplayName(studentNumber, picked);

    setIsLoading(true);
    setError("");
    try {
      const userRef = doc(db, "users", userDoc.uid);
      await updateDoc(userRef, {
        nickname: picked,
        name: displayName,
        hasSetNickname: true,
      });
      if (setUserDoc) {
        setUserDoc((prev) =>
          prev
            ? { ...prev, nickname: picked, name: displayName, hasSetNickname: true }
            : prev,
        );
      }
    } catch (err) {
      console.error("[NicknameSetup] 별명 설정 실패:", err);
      setError("별명 설정에 실패했습니다. 다시 시도해주세요.");
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm z-[10000] overflow-y-auto"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div
        className="w-full max-w-[400px] m-auto rounded-2xl overflow-hidden bg-white shadow-2xl"
        style={{
          animation: "slideUp 0.4s ease-out",
        }}
      >
        {/* 헤더 */}
        <div
          className="text-center pt-6 pb-4 px-5"
        >
          <div className="text-4xl mb-3">🎭</div>
          <h2
            className="text-xl font-bold text-slate-800 m-0"
          >
            별명을 골라주세요!
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            마음에 드는 게 없으면 다시 뽑을 수 있어요
          </p>
        </div>

        {/* 고르기 영역 */}
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 gap-2 mb-3">
            {choices.map((c) => {
              const isPicked = picked === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setPicked(c);
                    setError("");
                  }}
                  disabled={isLoading}
                  aria-pressed={isPicked}
                  className="w-full py-3 px-4 rounded-xl text-slate-800 text-base font-medium cursor-pointer transition-all text-left"
                  style={{
                    background: isPicked ? "#eef2ff" : "#f8fafc",
                    border: `2px solid ${isPicked ? "#4f46e5" : "#e2e8f0"}`,
                  }}
                >
                  <span className="mr-2">{isPicked ? "✅" : "⬜"}</span>
                  {buildDisplayName(studentNumber, c)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={reroll}
            disabled={isLoading}
            className="w-full min-h-[44px] rounded-xl border border-dashed border-indigo-300 bg-white text-indigo-700 text-sm font-medium cursor-pointer mb-4"
          >
            🎲 다시 뽑기
          </button>

          {error && (
            <div
              className="text-sm text-center py-2 px-3 rounded-lg mb-4"
              style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading || !picked}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-base cursor-pointer border-none disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            {isLoading ? "설정 중..." : "이걸로 할래요"}
          </button>

          <p className="text-center text-xs text-slate-500 mt-3">
            나중에 프로필에서 바꿀 수 있어요
          </p>
        </div>
      </div>
    </div>
  );
}
