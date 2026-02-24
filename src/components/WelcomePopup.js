// src/components/WelcomePopup.js
// 첫 접속 시 사용법 안내 팝업

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { WELCOME_GUIDE } from "../utils/helpContent";

const STORAGE_KEY_NEVER = "alchan_welcome_never_show";
const STORAGE_KEY_TODAY = "alchan_welcome_closed_date";

function shouldShowPopup() {
  try {
    // "다시 열지 않기" 체크
    if (localStorage.getItem(STORAGE_KEY_NEVER) === "true") return false;

    // "오늘은 닫기" 체크
    const closedDate = localStorage.getItem(STORAGE_KEY_TODAY);
    if (closedDate) {
      const today = new Date().toISOString().split("T")[0];
      if (closedDate === today) return false;
    }

    return true;
  } catch {
    return true;
  }
}

export default function WelcomePopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (shouldShowPopup()) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  const handleNeverShow = () => {
    try {
      localStorage.setItem(STORAGE_KEY_NEVER, "true");
    } catch {}
    setIsVisible(false);
  };

  const handleCloseToday = () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem(STORAGE_KEY_TODAY, today);
    } catch {}
    setIsVisible(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9998] p-4 animate-fadeIn"
      onClick={handleCloseToday}
    >
      <div
        className="bg-[#141423] border border-cyan-500/30 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-[0_0_40px_rgba(0,255,242,0.15)] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="relative px-6 pt-6 pb-4 border-b border-slate-700/50 shrink-0">
          <button
            onClick={handleCloseToday}
            className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold text-white pr-8">
            {WELCOME_GUIDE.title}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {WELCOME_GUIDE.subtitle}
          </p>
        </div>

        {/* 가이드 섹션 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 scrollbar-hide">
          {WELCOME_GUIDE.sections.map((section, index) => (
            <div
              key={index}
              className="flex items-start gap-3.5 bg-[#0a0a12]/60 rounded-xl px-4 py-3.5 border border-cyan-900/20 hover:border-cyan-500/30 transition-colors"
            >
              <span className="text-2xl shrink-0 mt-0.5">{section.icon}</span>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">
                  {section.title}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {section.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 하단 버튼 영역 */}
        <div className="px-6 py-4 border-t border-slate-700/50 space-y-2 shrink-0">
          <button
            onClick={handleCloseToday}
            className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 text-sm font-bold border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
          >
            오늘은 닫기
          </button>
          <button
            onClick={handleNeverShow}
            className="w-full py-2.5 rounded-xl bg-slate-800/50 text-slate-400 text-sm font-medium border border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-300 transition-colors"
          >
            다시 열지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
