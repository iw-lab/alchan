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
      <div className="bg-gray-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">설정</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* 설정 목록 */}
        <div className="overflow-y-auto p-4 space-y-6">
          {/* 화면 설정 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              화면
            </h3>

            {/* 다크 모드 */}
            <div className="bg-gray-700/50 rounded-2xl p-4 space-y-4">
              {/* 폰트 크기 */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Type size={20} className="text-blue-500" />
                  <div>
                    <p className="font-medium text-white">글꼴 크기</p>
                    <p className="text-sm text-slate-400">
                      읽기 편한 크기를 선택하세요
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(FONT_SIZES).map(([key, { label }]) => (
                    <button
                      key={key}
                      onClick={() => setFontSize(key)}
                      className={`py-2 rounded-xl text-sm font-medium transition-all ${
                        fontSize === key
                          ? "bg-indigo-500 text-white"
                          : "bg-gray-600 text-slate-300 hover:bg-gray-500"
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
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              기타
            </h3>

            <div className="bg-gray-700/50 rounded-2xl divide-y divide-gray-600">
              {/* 앱 정보 */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <Smartphone size={20} className="text-slate-400" />
                  <div>
                    <p className="font-medium text-white">앱 버전</p>
                    <p className="text-sm text-slate-400">v1.0.0</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
