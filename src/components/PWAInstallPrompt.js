// src/components/PWAInstallPrompt.js
// PWA 설치 프롬프트 컴포넌트

import React, { useState, useEffect } from 'react';
import { X, Download, Smartphone, Share, Plus } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // iOS 감지
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    // 이미 설치된 앱인지 확인
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // 이전에 닫았는지 확인
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // 7일 후에 다시 표시
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // beforeinstallprompt 이벤트 캡처
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // 2초 후 프롬프트 표시
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // iOS의 경우 3초 후 수동 안내 표시
    if (isIOSDevice && !window.matchMedia('(display-mode: standalone)').matches) {
      setTimeout(() => setShowPrompt(true), 3000);
    }

    // 설치 완료 이벤트
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('PWA 설치 수락');
    } else {
      console.log('PWA 설치 거절');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Smartphone size={20} />
            <span className="font-semibold">앱 설치하기</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="p-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-200/50">
              <span className="text-white text-2xl">✨</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-1">
                알찬 앱을 설치하세요!
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                홈 화면에 추가하면 더 빠르게 접속하고, 오프라인에서도 일부 기능을 사용할 수 있어요.
              </p>
            </div>
          </div>

          {/* iOS 안내 */}
          {isIOS ? (
            <div className="mt-4 p-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-600 mb-2 font-medium">
                iOS에서 설치하기:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Share size={16} className="text-indigo-500" />
                  <span>1. 하단의 공유 버튼 탭</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Plus size={16} className="text-indigo-500" />
                  <span>2. "홈 화면에 추가" 선택</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              >
                나중에
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 px-4 py-2.5 text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200/50"
              >
                <Download size={18} />
                설치하기
              </button>
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            설치해도 저장공간을 거의 차지하지 않아요
          </p>
        </div>
      </div>
    </div>
  );
}
