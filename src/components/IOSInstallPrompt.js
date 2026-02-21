// src/components/IOSInstallPrompt.js
// iOS Safari에서 홈 화면 추가 안내 배너
import React, { useState, useEffect } from "react";
import { X, Share, Plus } from "lucide-react";

// iOS Safari인지 감지
const isIOS = () => {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
};

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isSafari = () => {
  const ua = window.navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
};

const isAndroidApp = () => window.navigator.userAgent.includes("AlchanApp");

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 이미 설치됐거나, Android 앱이거나, iOS가 아니면 표시 안 함
    if (isInStandaloneMode() || isAndroidApp()) return;
    if (!isIOS() || !isSafari()) return;

    // 이미 닫은 경우 7일간 안 보임
    const dismissed = localStorage.getItem("ios_install_dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < sevenDays) return;
    }

    // 2초 후 표시 (페이지 로드 후)
    const timer = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("ios_install_dismissed", Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9990] p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
    >
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-indigo-500/30"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #111128 100%)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* 상단 글로우 */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* 앱 아이콘 */}
            <div
              className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border border-indigo-500/30"
              style={{
                background: "linear-gradient(135deg, #1e1e3a, #14142a)",
              }}
            >
              <svg viewBox="0 0 100 100" width="36" height="36" fill="none">
                <path
                  d="M25 52 L42 69 L75 31"
                  stroke="#818cf8"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M78 22 L80 27 L85 27 L81 31 L82 36 L78 33 L74 36 L75 31 L71 27 L76 27 Z"
                  fill="#FCD34D"
                />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base">앱으로 설치하기</p>
              <p className="text-slate-400 text-sm mt-0.5">
                홈 화면에 추가하면 앱처럼 사용할 수 있어요!
              </p>

              {/* 설치 방법 */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-xs">1</span>
                  </div>
                  <span>
                    하단{" "}
                    <span className="inline-flex items-center gap-1 bg-slate-700/60 px-1.5 py-0.5 rounded-md text-blue-300 font-medium">
                      <Share className="w-3 h-3" />
                      공유
                    </span>{" "}
                    버튼 탭
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-400 font-bold text-xs">2</span>
                  </div>
                  <span>
                    <span className="inline-flex items-center gap-1 bg-slate-700/60 px-1.5 py-0.5 rounded-md text-slate-200 font-medium">
                      <Plus className="w-3 h-3" />홈 화면에 추가
                    </span>{" "}
                    선택
                  </span>
                </div>
              </div>
            </div>

            {/* 닫기 */}
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
