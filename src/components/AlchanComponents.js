// src/components/AlchanComponents.js
// 알찬 UI 공통 컴포넌트 모음

import React from 'react';
import { Star, ChevronRight, Gift } from 'lucide-react';

// 앱 이름 상수
export const APP_NAME_KR = "알찬";
export const APP_NAME_EN = "Alchan";

// --- 커스텀 아이콘 컴포넌트 ---
// Lucide 스타일의 Won 아이콘 직접 구현
export const WonIcon = ({ size = 24, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="6 3 10 21 12 15 14 21 18 3" />
    <line x1="4" x2="20" y1="10" y2="10" />
    <line x1="4" x2="20" y1="15" y2="15" />
  </svg>
);

// --- 로고 컴포넌트 ---
export const AlchanLogo = ({ size = 'default' }) => {
  const logoSize = size === 'small' ? 'w-8 h-8' : 'w-10 h-10';
  const titleSize = size === 'small' ? 'text-xl' : 'text-2xl';
  const subSize = size === 'small' ? 'text-[8px]' : 'text-[10px]';

  return (
    <div className="flex items-center gap-3 select-none pl-1">
      <div className={`relative ${logoSize} flex items-center justify-center`}>
        {/* 배경 글로우 효과 */}
        <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 rounded-full"></div>
        <div className={`relative ${logoSize} bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl shadow-lg flex items-center justify-center transform transition-transform hover:scale-110 hover:rotate-3`}>
          <Star size={size === 'small' ? 14 : 18} className="text-yellow-300 fill-yellow-300 drop-shadow-sm" />
        </div>
      </div>
      <div className="flex flex-col justify-center h-10">
        <span className={`${titleSize} text-slate-800 leading-none tracking-tight pt-1`} style={{ fontFamily: '"Gamja Flower", cursive' }}>
          {APP_NAME_KR}
        </span>
        <span className={`${subSize} text-indigo-500 tracking-[0.25em] font-bold leading-none mt-1 ml-0.5`} style={{ fontFamily: '"Dancing Script", cursive' }}>
          {APP_NAME_EN}
        </span>
      </div>
    </div>
  );
};

// --- 사이드바 메뉴 아이템 ---
export const SidebarItem = ({ item, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 font-medium group relative overflow-hidden ${
      isActive
        ? 'text-white shadow-lg shadow-indigo-200/50 scale-[1.02]'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    {/* Active State Background Gradient */}
    {isActive && (
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 z-0"></div>
    )}

    {/* Hover Effect for Inactive */}
    {!isActive && (
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full scale-y-0 group-hover:scale-y-75 transition-transform duration-300"></div>
    )}

    {/* Icon Container */}
    <div className={`relative z-10 p-1 rounded-lg transition-colors ${
      isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'
    }`}>
      {item.icon && <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />}
      {item.emoji && <span className="text-lg">{item.emoji}</span>}
    </div>
    <span className={`relative z-10 text-sm font-bold tracking-tight ${isActive ? 'text-white' : ''}`}>{item.label}</span>

    {isActive && <ChevronRight size={16} className="absolute right-3 text-white/50 z-10" />}
  </button>
);

// --- 유틸리티 함수 ---
// 중복 함수 제거 - numberFormatter.js의 formatKoreanCurrency/formatKoreanNumber 사용 권장
// 하위 호환성을 위해 re-export
export { formatKoreanNumber as formatMoney, formatKoreanCurrency as formatMoneyWithUnit } from '../utils/numberFormatter';

// --- 글로벌 스타일 ---
export const GlobalStyles = () => (
  <style>
    {`@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Gamja+Flower&display=swap');`}
    {`
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }

      .alchan-animate-in {
        animation: alchanFadeIn 0.5s ease-out;
      }

      @keyframes alchanFadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `}
  </style>
);

// default export - 하위 호환성 유지
// formatMoney/formatMoneyWithUnit은 numberFormatter.js에서 import
import { formatKoreanNumber, formatKoreanCurrency } from '../utils/numberFormatter';

export default {
  APP_NAME_KR,
  APP_NAME_EN,
  WonIcon,
  AlchanLogo,
  SidebarItem,
  formatMoney: formatKoreanNumber,
  formatMoneyWithUnit: formatKoreanCurrency,
  GlobalStyles
};
