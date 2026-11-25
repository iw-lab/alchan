// src/components/SettingsPanel.js
// 사용자 설정 패널 — 글꼴 크기 (알림·소리·튜토리얼 토글은 아무 데서도 안 읽혀 2026-10-14 제거)

import { useTheme, FONT_SIZES } from "../contexts/ThemeContext";
import { X, Type, Smartphone } from "lucide-react";
import { useBackClose } from "../hooks/useBackClose";

function SettingsPanel({ isOpen, onClose }) {
  const { fontSize, setFontSize } = useTheme();
  // 뒤로가기 = 설정 패널 닫기
  useBackClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90dvh] overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">설정</h2>
          <button
            onClick={onClose}
            aria-label="설정 닫기"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* 설정 목록 */}
        <div className="overflow-y-auto p-4 space-y-6">
          {/* 화면 설정 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">
              화면
            </h3>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
              {/* 폰트 크기 */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Type size={20} className="text-blue-500" />
                  <div>
                    <p className="font-medium text-slate-800">글꼴 크기</p>
                    <p className="text-sm text-slate-600">
                      읽기 편한 크기를 선택하세요
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(FONT_SIZES).map(([key, { label }]) => (
                    <button
                      key={key}
                      onClick={() => setFontSize(key)}
                      aria-pressed={fontSize === key}
                      className={`min-h-[44px] py-2 rounded-xl text-sm font-medium transition-all ${
                        fontSize === key
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 기타 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">
              기타
            </h3>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200">
              {/* 앱 정보 */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <Smartphone size={20} className="text-slate-500" />
                  <div>
                    <p className="font-medium text-slate-800">앱 버전</p>
                    <p className="text-sm text-slate-600">v1.0.0</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
