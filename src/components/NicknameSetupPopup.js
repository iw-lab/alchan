// src/components/NicknameSetupPopup.js
// 첫 로그인 학생 닉네임 설정 팝업

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db, doc, updateDoc } from "../firebase";

export default function NicknameSetupPopup() {
  const { userDoc, setUserDoc } = useAuth();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 학생만 + 아직 닉네임 설정 안 한 경우만 표시
  const isStudent =
    userDoc?.uid &&
    !userDoc?.isAdmin &&
    !userDoc?.isSuperAdmin &&
    !userDoc?.isTeacher;

  if (!isStudent || userDoc?.hasSetNickname) return null;

  const handleSubmit = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 10) {
      setError("닉네임은 2~10자 사이여야 합니다.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const userRef = doc(db, "users", userDoc.uid);
      await updateDoc(userRef, {
        nickname: trimmed,
        name: trimmed,
        hasSetNickname: true,
      });
      if (setUserDoc) {
        setUserDoc((prev) =>
          prev
            ? { ...prev, nickname: trimmed, name: trimmed, hasSetNickname: true }
            : prev,
        );
      }
    } catch (err) {
      console.error("[NicknameSetup] 닉네임 설정 실패:", err);
      setError("닉네임 설정에 실패했습니다. 다시 시도해주세요.");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !isLoading) {
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-5 bg-black/80 backdrop-blur-sm z-[10000]"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div
        className="w-full max-w-[380px] rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          border: "1px solid rgba(0, 212, 255, 0.3)",
          boxShadow: "0 0 40px rgba(0, 212, 255, 0.15), 0 20px 60px rgba(0, 0, 0, 0.5)",
          animation: "slideUp 0.4s ease-out",
        }}
      >
        {/* 헤더 */}
        <div
          className="text-center py-6 px-5"
          style={{
            background: "linear-gradient(180deg, rgba(0, 212, 255, 0.15) 0%, transparent 100%)",
          }}
        >
          <div className="text-4xl mb-3">👋</div>
          <h2
            className="text-xl font-bold text-slate-800 dark:text-white m-0"
            style={{ fontFamily: "'Orbitron', 'Rajdhani', sans-serif" }}
          >
            환영합니다!
          </h2>
          <p className="text-sm text-slate-800 dark:text-white/60 mt-2">
            수업에서 사용할 닉네임을 설정해주세요
          </p>
        </div>

        {/* 입력 영역 */}
        <div className="px-6 pb-6">
          <div className="mb-4">
            <label className="block text-xs text-cyan-300/80 mb-2 font-medium">
              닉네임 (2~10자)
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="닉네임을 입력하세요"
              maxLength={10}
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-slate-800 dark:text-white text-base outline-none transition-all"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: error
                  ? "1px solid rgba(255, 80, 80, 0.6)"
                  : "1px solid rgba(0, 212, 255, 0.2)",
                boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(0, 212, 255, 0.5)";
                e.target.style.boxShadow =
                  "inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 10px rgba(0, 212, 255, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error
                  ? "rgba(255, 80, 80, 0.6)"
                  : "rgba(0, 212, 255, 0.2)";
                e.target.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.2)";
              }}
            />
            {nickname.length > 0 && (
              <div className="text-right text-xs text-slate-800 dark:text-white/40 mt-1">
                {nickname.length}/10
              </div>
            )}
          </div>

          {error && (
            <div
              className="text-sm text-center py-2 px-3 rounded-lg mb-4"
              style={{
                background: "rgba(255, 80, 80, 0.1)",
                color: "#ff6b6b",
                border: "1px solid rgba(255, 80, 80, 0.2)",
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading || !nickname.trim()}
            className="w-full py-3 rounded-xl text-slate-800 dark:text-white font-bold text-base cursor-pointer transition-all border-none"
            style={{
              background:
                isLoading || !nickname.trim()
                  ? "rgba(100, 100, 100, 0.3)"
                  : "linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)",
              boxShadow:
                isLoading || !nickname.trim()
                  ? "none"
                  : "0 4px 15px rgba(0, 212, 255, 0.3)",
              opacity: isLoading || !nickname.trim() ? 0.5 : 1,
            }}
          >
            {isLoading ? "설정 중..." : "닉네임 설정하기"}
          </button>

          <p className="text-center text-xs text-slate-800 dark:text-white/40 mt-3">
            나중에 프로필에서 변경할 수 있어요
          </p>
        </div>
      </div>
    </div>
  );
}
