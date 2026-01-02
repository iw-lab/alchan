// src/components/UpdateNotification.js
// 앱 업데이트 알림 컴포넌트

import React from 'react';
import { RefreshCw, X } from 'lucide-react';

export default function UpdateNotification({ onUpdate, onDismiss }) {
  return (
    <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <RefreshCw size={20} className="animate-spin-slow" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold mb-1">새 버전이 있어요!</h3>
            <p className="text-sm text-white/80 mb-3">
              더 나은 알찬을 위해 업데이트를 적용해주세요.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                나중에
              </button>
              <button
                onClick={onUpdate}
                className="px-3 py-1.5 text-sm bg-white text-emerald-600 font-semibold rounded-lg hover:bg-white/90 transition-colors flex items-center gap-1"
              >
                <RefreshCw size={14} />
                지금 업데이트
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
