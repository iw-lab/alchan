// src/components/MobileNav.js
// 모바일 하단 네비게이션 컴포넌트

import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Wallet, Gamepad2, Users } from 'lucide-react';

const tabs = [
  { id: 'home', icon: Home, label: '홈', path: '/dashboard/tasks' },
  { id: 'assets', icon: Wallet, label: '자산', path: '/my-assets' },
  { id: 'game', icon: Gamepad2, label: '게임', paths: ['/learning-games'] },
  { id: 'community', icon: Users, label: '커뮤니티', path: '/learning-board' },
];

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isTabActive = useCallback((tab) => {
    if (tab.paths) {
      return tab.paths.some(p => location.pathname.startsWith(p));
    }
    return location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
  }, [location.pathname]);

  const handleTabClick = useCallback((tab) => {
    if (tab.paths) {
      navigate(tab.paths[0] + '/omok');
    } else {
      navigate(tab.path);
    }
  }, [navigate]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100/50 pb-safe pt-2 px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = isTabActive(tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all duration-300 ${
                isActive ? 'text-indigo-600 -translate-y-1' : 'text-gray-400'
              }`}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 2}
                className={isActive ? 'drop-shadow-md' : ''}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
