// src/AppLayout.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import { useAuth } from "./contexts/AuthContext";

export default function AppLayout({ children }) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();

  const handleNavigate = (item) => {
    if (item.path) {
      navigate(item.path, { state: item.state });
    }
  };

  const menuItems = [
    { id: "dashboard", name: "내 자산", path: "/dashboard", icon: "💰" },
    {
      id: "myAssetsCategory",
      name: "자산 관리",
      isCategory: true,
      icon: "🏦",
    },
    {
      id: "banking",
      name: "은행",
      path: "/banking",
      icon: "🏦",
      categoryId: "myAssetsCategory",
    },
    {
      id: "investment",
      name: "투자",
      path: "/investment",
      icon: "📈",
      categoryId: "myAssetsCategory",
    },
    {
      id: "my-items",
      name: "내 아이템",
      path: "/my-items",
      icon: "🎁",
      categoryId: "myAssetsCategory",
    },
    {
      id: "shopping",
      name: "아이템 상점",
      path: "/shopping",
      icon: "🛒",
      categoryId: "myAssetsCategory",
    },
    {
      id: "learningBoard",
      name: "학습 게시판",
      path: "/learning-board",
      icon: "✍️",
    },
    {
      id: "learningGamesCategory",
      name: "학습 게임",
      isCategory: true,
      icon: "🎮",
    },
    {
      id: "omok-game",
      name: "오목",
      path: "/learning-games/omok",
      icon: "⚫️",
      categoryId: "learningGamesCategory",
    },
    {
      id: "typing-practice",
      name: "타자 연습",
      path: "/learning-games/typing-practice",
      icon: "⌨️",
      categoryId: "learningGamesCategory",
    },
    {
      id: "geography-game",
      name: "지리 게임",
      path: "/learning-games/geography",
      icon: "🌍",
      categoryId: "learningGamesCategory",
    },
    {
      id: "science-game",
      name: "과학 게임",
      path: "/learning-games/science",
      icon: "🔬",
      categoryId: "learningGamesCategory",
    },
    {
      id: "economic-activity",
      name: "경제 활동",
      path: "/economic-activity",
      icon: "💼",
    },
    {
      id: "government",
      name: "정부",
      path: "/government",
      icon: "🏛️",
      adminOnly: false,
    },
    {
      id: "admin",
      name: "관리자",
      isCategory: true,
      icon: "⚙️",
      adminOnly: true,
    },
    {
      id: "admin-home",
      name: "관리자 홈",
      path: "/admin",
      icon: "🏠",
      categoryId: "admin",
      adminOnly: true,
    },
    {
      id: "coupon-management",
      // --- 💡 수정된 부분 ---
      name: "쿠폰 보내기/가져오기",
      // --- 수정 끝 ---
      path: "/admin",
      icon: "🎟️",
      state: { defaultTab: "couponManagement" },
      categoryId: "admin",
      adminOnly: true,
    },
  ];

  return (
    <div className={`app-layout ${isSidebarOpen ? "sidebar-open" : ""}`}>
      <Header
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
        user={user}
        userDoc={userDoc}
      />
      <Sidebar
        isOpen={isSidebarOpen}
        menuItems={menuItems}
        onNavigate={handleNavigate}
      />
      <MainContent>{children}</MainContent>
    </div>
  );
}