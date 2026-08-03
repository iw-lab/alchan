// src/components/MobileNav.js
// 모바일 하단 네비게이션 컴포넌트

import React, { useCallback, useMemo, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Wallet, Store, Users } from "lucide-react";

const tabs = [
  { id: "home", icon: Home, label: "홈", path: "/dashboard/tasks" },
  { id: "assets", icon: Wallet, label: "자산", path: "/my-assets" },
  // 게임 탭(2026-08-03 제거) 자리에 아이템 상점 — 경제 활동 동선으로 대체.
  { id: "shop", icon: Store, label: "상점", path: "/item-shop" },
  { id: "community", icon: Users, label: "커뮤니티", path: "/learning-board" },
];

const MobileNav = memo(function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // 2026-08-03: 게임 탭 전용이던 `tab.paths` 분기 제거(유일한 사용처가 /learning-games였고
  // 클릭 시 "/omok"을 덧붙였다). 이제 모든 탭이 단일 `path`를 쓴다.
  const isTabActive = useCallback(
    (tab) =>
      location.pathname === tab.path ||
      location.pathname.startsWith(tab.path + "/"),
    [location.pathname],
  );

  const handleTabClick = useCallback((tab) => navigate(tab.path), [navigate]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-md border-t pb-safe pt-2 px-6 z-50" style={{ backgroundColor: "rgba(15, 18, 37, 0.95)", borderColor: "rgba(100, 116, 139, 0.2)" }}>
      <div className="flex justify-between items-center max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = isTabActive(tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all duration-300 ${
                isActive ? "-translate-y-1" : ""
              }`}
              style={{ color: isActive ? "#60a5fa" : "#94a3b8" }}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 2}
                className={isActive ? "drop-shadow-md" : ""}
              />
              <span
                className={`text-[11px] font-medium ${isActive ? "opacity-100" : "opacity-80"}`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

export default MobileNav;
