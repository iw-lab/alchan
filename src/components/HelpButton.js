// src/components/HelpButton.js
// 도움말 단추(헤더 안) + 모달.
// 예전에는 오른쪽 아래에 떠 있어서 폰·태블릿에서 구매·출금 버튼을 덮었다(2026-11-25) — 헤더로 옮겼다.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { HelpCircle, X } from "lucide-react";
import { getHelpContent } from "../utils/helpContent";
import { useBackClose } from "../hooks/useBackClose";

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const helpData = getHelpContent(location.pathname);

  // 뒤로가기 = 도움말 모달 닫기
  useBackClose(isOpen, () => setIsOpen(false));

  // 도움말 데이터가 없는 페이지에서는 숨김
  if (!helpData) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-11 h-11 rounded-xl flex items-center justify-center text-indigo-600 hover:bg-indigo-50 shrink-0"
        title="도움말"
        aria-label="이 화면 도움말"
      >
        <HelpCircle className="w-[22px] h-[22px]" />
      </button>

      {/* 도움말 모달 */}
      {/* 헤더는 backdrop-filter 가 있어 그 안의 fixed 는 헤더 크기에 갇힌다 → body 로 뺀다 */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{helpData.icon}</span>
                <h3 className="text-lg font-bold text-slate-800">
                  {helpData.title}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 설명 */}
            <div className="px-5 py-4">
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                {helpData.description}
              </p>

              {/* 팁 목록 */}
              {helpData.tips && helpData.tips.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    사용 팁
                  </h4>
                  {helpData.tips.map((tip, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2.5 bg-indigo-50 rounded-xl px-3.5 py-2.5 border border-indigo-100"
                    >
                      <span className="text-indigo-600 text-xs mt-0.5 font-bold shrink-0">
                        {index + 1}.
                      </span>
                      <p className="text-slate-700 text-sm leading-relaxed">
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
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold border border-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
