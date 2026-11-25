// src/components/MobileNav.js
// 하단 탭 — 폰·세로 태블릿(1024px 미만)

import React, { useCallback, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Wallet, Landmark, Store, Menu } from "lucide-react";
import { useMenuLocks } from "../contexts/MenuLocksContext";

// 탭 구성은 실사용 순서다(2026-11 최근 30일: 파킹통장·아이템·송금이 상위, 게시판 글은 30일 5건).
// 「커뮤니티」 탭(학습 게시판으로 감)을 은행으로 바꾸고, 나머지 화면은 «메뉴» 로 모두 닿게 한다.
const tabs = [
  { id: "home", icon: Home, label: "홈", path: "/dashboard/tasks" },
  { id: "assets", icon: Wallet, label: "자산", path: "/my-assets", menuId: "myAssets" },
  { id: "bank", icon: Landmark, label: "은행", path: "/banking", menuId: "banking" },
  { id: "shop", icon: Store, label: "상점", path: "/item-shop", menuId: "itemStore" },
];

const MobileNav = memo(function MobileNav({ onOpenMenu, isTeacher = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lockedItemIds } = useMenuLocks();

  const isTabActive = useCallback(
    (tab) =>
      location.pathname === tab.path ||
      location.pathname.startsWith(tab.path + "/"),
    [location.pathname],
  );

  // 선생님이 잠근 메뉴는 탭에서도 뺀다(눌러도 홈으로 튕기기만 한다).
  const shown = tabs.filter(
    (t) => isTeacher || !t.menuId || !lockedItemIds.includes(t.menuId),
  );

  const tabClass =
    "flex-1 flex flex-col items-center justify-center gap-0.5 h-14 min-w-0";

  return (
    <nav
      aria-label="주요 메뉴"
      className="app-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 border-t pb-safe z-40 bg-white border-slate-200"
    >
      <div className="flex items-stretch max-w-2xl mx-auto">
        {shown.map((tab) => {
          const active = isTabActive(tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              aria-current={active ? "page" : undefined}
              className={tabClass}
              style={{ color: active ? "#4338ca" : "#475569" }}
            >
              <Icon size={22} strokeWidth={active ? 2.6 : 2} />
              <span className={`text-xs ${active ? "font-bold" : "font-medium"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
        <button onClick={onOpenMenu} className={tabClass} style={{ color: "#475569" }}>
          <Menu size={22} strokeWidth={2} />
          <span className="text-xs font-medium">메뉴</span>
        </button>
      </div>
    </nav>
  );
});

export default MobileNav;
