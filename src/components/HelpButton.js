// src/components/HelpButton.js
// 플로팅 도움말 버튼 + 모달 컴포넌트 (모든 페이지에서 표시)

import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { HelpCircle, X } from "lucide-react";
import { getHelpContent } from "../utils/helpContent";

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const helpData = getHelpContent(location.pathname);

  // 도움말 데이터가 없는 페이지에서는 숨김
  if (!helpData) return null;

  return (
    <>
      {/* 플로팅 도움말 버튼 - 우측 하단 고정 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 z-40 w-11 h-11 rounded-full bg-indigo-600/90 border border-indigo-400/50 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 hover:shadow-indigo-500/50 hover:scale-110 transition-all duration-200 backdrop-blur-sm"
        title="도움말"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {/* 도움말 모달 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-[#141423] border border-cyan-500/30 rounded-2xl w-full max-w-md shadow-[0_0_30px_rgba(0,255,242,0.1)] animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{helpData.icon}</span>
                <h3 className="text-lg font-bold text-white">
                  {helpData.title}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 설명 */}
            <div className="px-5 py-4">
              <p className="text-slate-200 text-sm leading-relaxed mb-4">
                {helpData.description}
              </p>

              {/* 팁 목록 */}
              {helpData.tips && helpData.tips.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    사용 팁
                  </h4>
                  {helpData.tips.map((tip, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2.5 bg-[#0a0a12]/60 rounded-xl px-3.5 py-2.5 border border-cyan-900/20"
                    >
                      <span className="text-cyan-400 text-xs mt-0.5 font-bold shrink-0">
                        {index + 1}.
                      </span>
                      <p className="text-slate-200 text-sm leading-relaxed">
                        {tip}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 닫기 버튼 */}
            <div className="px-5 pb-4">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 text-sm font-bold border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
