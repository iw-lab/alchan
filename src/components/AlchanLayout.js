// src/components/AlchanLayout.js
// 알찬 UI 메인 레이아웃 컴포넌트 - Tailwind CSS 버전
// 🔥 성능 최적화: 게임/관리자 페이지 lazy loading 적용

import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";

// 🔥 ChunkLoadError 방지 - lazy import 실패 시 캐시/SW 삭제 후 1회 리로드
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(async () => {
      const reloaded = sessionStorage.getItem("chunk_reload");
      if (reloaded) {
        sessionStorage.removeItem("chunk_reload");
        return importFn();
      }
      sessionStorage.setItem("chunk_reload", "1");
      // 🔥 캐시·SW를 모두 삭제해야 새 번들이 잡힘 (v1 SW가 옛 index.html 잡고 있을 때)
      try {
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (e) {
        // 무시 - 그래도 리로드 시도
      }
      window.location.reload();
      return new Promise(() => {});
    }),
  );
}
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ItemProvider } from "../contexts/ItemContext"; // 🔥 [최적화] 로그인 후에만 마운트
import AlchanSidebar from "./AlchanSidebar";
import AlchanHeader from "./AlchanHeader";
import MobileNav from "./MobileNav";
import PWAInstallPrompt from "./PWAInstallPrompt";
import UpdateNotification from "./UpdateNotification";
import { useServiceWorker } from "../hooks/useServiceWorker";
import { AlchanLoadingScreen } from "./ui/Skeleton";
import { WifiOff } from "lucide-react";
import { getStreakInfo } from "./DailyReward";
import EconomicEventBanner from "./EconomicEventBanner";
import { EconomicEventProvider } from "../hooks/useActiveEconomicEvent";
const EconomicEventPopup = lazyWithRetry(() => import("./EconomicEventPopup"));
const NewBillPopup = lazyWithRetry(() => import("./NewBillPopup"));
const VoteReminderBanner = lazyWithRetry(() =>
  import("./VoteReminderBanner"),
);
const DailyRewardBanner = lazyWithRetry(() =>
  import("./DailyReward").then((m) => ({ default: m.DailyRewardBanner })),
);
const WelcomePopup = lazyWithRetry(() => import("./WelcomePopup"));
const HelpButton = lazyWithRetry(() => import("./HelpButton"));
const IOSInstallPrompt = lazyWithRetry(() => import("./IOSInstallPrompt"));
const AppUpdateChecker = lazyWithRetry(() => import("./AppUpdateChecker"));
const NicknameSetupPopup = lazyWithRetry(() => import("./NicknameSetupPopup"));
import { db, doc, updateDoc, increment } from "../firebase";
import globalCacheService from "../services/globalCacheService";
import { logger } from "../utils/logger";

// 🔥 핵심 페이지 - Dashboard도 lazy로 전환
const Dashboard = lazyWithRetry(() => import("../pages/dashboard/Dashboard"));

// 🔥 [최적화] 자주 사용하지만 초기 로드 불필요한 페이지 - 동적 로딩
const ItemStore = lazyWithRetry(() => import("../pages/market/ItemStore"));
const MyItems = lazyWithRetry(() => import("../pages/my-items/MyItems"));

// 🔥 [최적화] 자주 사용하지만 초기 로드 불필요한 페이지 - 동적 로딩
const PersonalShop = lazyWithRetry(
  () => import("../pages/market/PersonalShop"),
);
const GroupPurchase = lazyWithRetry(
  () => import("../pages/market/GroupPurchase"),
);
const Banking = lazyWithRetry(() => import("../pages/banking/Banking"));
const MyProfile = lazyWithRetry(() => import("../pages/my-profile/MyProfile"));
const MyAssets = lazyWithRetry(() => import("../pages/my-assets/MyAssets"));

// 🔥 게임 페이지 - 동적 로딩 (번들 크기 절감)
const OmokGame = lazyWithRetry(() => import("../pages/games/OmokGame"));
const ChessGame = lazyWithRetry(() => import("../pages/games/ChessGame"));
const TypingPracticeGame = lazyWithRetry(
  () => import("../pages/games/TypingPracticeGame"),
);

// 🔥 관리자/선생님 페이지 - 동적 로딩
const AdminApprovalPanel = lazyWithRetry(
  () => import("../pages/admin/AdminApprovalPanel"),
);
const AdminItemPage = lazyWithRetry(
  () => import("../pages/admin/AdminItemPage"),
);
const AdminDatabase = lazyWithRetry(
  () => import("../pages/admin/AdminDatabase"),
);
const AdminEconomicEvents = lazyWithRetry(
  () => import("../pages/admin/AdminEconomicEvents"),
);
const AdminPermissionManager = lazyWithRetry(
  () => import("../pages/admin/AdminPermissionManager"),
);
const FirestoreDoctor = lazyWithRetry(
  () => import("../pages/admin/FirestoreDoctor"),
);
const RecoverDonations = lazyWithRetry(
  () => import("../pages/admin/RecoverDonations"),
);
const StudentManager = lazyWithRetry(() => import("./StudentManager"));

// 🔥 앱 관리자(SuperAdmin) 전용 대시보드
const SuperAdminDashboard = lazyWithRetry(
  () => import("../pages/superadmin/SuperAdminDashboard"),
);

// 🔥 덜 자주 사용하는 페이지 - 동적 로딩
const LearningBoard = lazyWithRetry(
  () => import("../pages/learning/LearningBoard"),
);
const MusicRequest = lazyWithRetry(() => import("../pages/music/MusicRequest"));
const MusicRoom = lazyWithRetry(() => import("../pages/music/MusicRoom"));
const StudentRequest = lazyWithRetry(
  () => import("../pages/student/StudentRequest"),
);
const StockExchange = lazyWithRetry(
  () => import("../pages/banking/StockExchange"),
);
const RealEstateRegistry = lazyWithRetry(
  () => import("../pages/real-estate/RealEstateRegistry"),
);
const NationalAssembly = lazyWithRetry(
  () => import("../pages/government/NationalAssembly"),
);
const NationalTaxService = lazyWithRetry(
  () => import("../pages/government/NationalTaxService"),
);
const Court = lazyWithRetry(() => import("../pages/government/Court"));
const PoliceStation = lazyWithRetry(
  () => import("../pages/government/PoliceStation"),
);
const OrganizationChart = lazyWithRetry(
  () => import("../pages/organization/OrganizationChart"),
);
const Auction = lazyWithRetry(() => import("../pages/market/Auction"));
const MoneyTransfer = lazyWithRetry(
  () => import("../pages/banking/MoneyTransfer"),
);
const CouponTransfer = lazyWithRetry(
  () => import("../pages/banking/CouponTransfer"),
);
const CouponGoalPage = lazyWithRetry(
  () => import("../pages/coupon/CouponGoalPage"),
);

// 전체 화면이 필요한 페이지 경로 (자동으로 사이드바 접기)
const FULLSCREEN_PAGES = [
  "/music-room",
];

// 공통 로딩 컴포넌트 - 항상 통일된 보라색 전체화면 로딩 사용
const AlchanLoading = ({ message = "로딩 중..." }) => {
  return <AlchanLoadingScreen message={message} />;
};

// Protected Route 컴포넌트
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// Admin Route 컴포넌트
const AdminRoute = ({ children }) => {
  const { user, userDoc, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin =
    userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
  if (!isAdmin) {
    return <Navigate to="/dashboard/tasks" replace />;
  }

  return children;
};

// 선생님/관리자 Route 컴포넌트
const TeacherRoute = ({ children }) => {
  const { user, userDoc, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isTeacher =
    userDoc?.isTeacher || userDoc?.isAdmin || userDoc?.isSuperAdmin;
  if (!isTeacher) {
    return <Navigate to="/dashboard/tasks" replace />;
  }

  return children;
};

// 🔥 앱 관리자(SuperAdmin) 전용 Route 컴포넌트
const SuperAdminRoute = ({ children }) => {
  const { user, userDoc, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!userDoc?.isSuperAdmin) {
    return <Navigate to="/dashboard/tasks" replace />;
  }

  return children;
};

// 메인 레이아웃 컴포넌트
export default function AlchanLayout() {
  const location = useLocation();
  const { user, userDoc, loading, logout } = useAuth();
  const isImmersiveMusicRoom = location.pathname.startsWith("/music-room/");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showUpdateDismissed, setShowUpdateDismissed] = useState(() => {
    try {
      const dismissed = localStorage.getItem("alchan_update_dismissed");
      if (!dismissed) return false;
      // 24시간 이내에 닫았으면 계속 숨김
      return Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });
  const [showDailyRewardPopup, setShowDailyRewardPopup] = useState(false);

  // PWA 서비스 워커 훅
  const { updateAvailable, updateServiceWorker, isOnline } = useServiceWorker();

  // 🎁 출석 보상 팝업 - 앱 진입(탭 열기) 시 자동 표시
  useEffect(() => {
    if (
      userDoc?.uid &&
      !userDoc?.isAdmin &&
      !userDoc?.isSuperAdmin &&
      !userDoc?.isTeacher
    ) {
      let cancelled = false;
      getStreakInfo(userDoc.uid).then((streakInfo) => {
        if (!cancelled && streakInfo.canClaim) {
          setTimeout(() => setShowDailyRewardPopup(true), 500);
        }
      });
      return () => { cancelled = true; };
    }
  }, [
    userDoc?.uid,
    userDoc?.isAdmin,
    userDoc?.isSuperAdmin,
    userDoc?.isTeacher,
  ]);

  // 🎁 출석 보상 수령 처리
  const handleDailyRewardClaim = useCallback(
    async (rewardAmount) => {
      if (!userDoc?.uid || !rewardAmount) return;
      try {
        const userRef = doc(db, "users", userDoc.uid);
        await updateDoc(userRef, { cash: increment(rewardAmount) });
        globalCacheService.invalidate(`user_${userDoc.uid}`);
        setTimeout(() => setShowDailyRewardPopup(false), 3000);
      } catch (error) {
        logger.error("출석 보상 지급 실패:", error);
      }
    },
    [userDoc?.uid],
  );

  // Jua 폰트는 index.html에서 preload로 로드됨 (중복 제거)

  // 🔥 페이지 이동 시 스크롤 최상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // 전체 화면 페이지에서 자동으로 사이드바 접기
  useEffect(() => {
    const isFullscreenPage = FULLSCREEN_PAGES.some((page) =>
      location.pathname.startsWith(page),
    );
    if (isFullscreenPage && !isMobile) {
      setIsSidebarCollapsed(true);
    }
  }, [location.pathname, isMobile]);

  // 화면 크기 감지 (디바운스 적용)
  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const mobile = window.innerWidth < 768;
        setIsMobile(mobile);
        if (mobile) {
          setIsSidebarOpen(false);
        }
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // 🔥 비로그인 상태면 즉시 로그인 페이지로 리다이렉트 (흰화면 방지)
  if (!loading && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 로딩 상태 (loading 중이거나, 로그인했는데 userDoc 아직 없음)
  if (loading || (user && !userDoc)) {
    return <AlchanLoading />;
  }

  // 로그인 페이지 (이미 로그인했으면 대시보드로)
  if (location.pathname === "/login") {
    return <Navigate to={user ? "/dashboard/tasks" : "/login"} replace />;
  }

  // 🔥 선생님 승인 대기 중 (isApproved === false인 경우만 차단)
  if (
    (userDoc.isTeacher || userDoc.isAdmin) &&
    !userDoc.isSuperAdmin &&
    userDoc.isApproved === false
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            ⏳
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">승인 대기 중</h2>
          <p className="text-gray-500 mb-2">
            앱 관리자의 승인을 기다리고 있습니다.
          </p>
          <p className="text-slate-500 dark:text-gray-400 text-sm mb-6">
            승인이 완료되면 모든 기능을 사용할 수 있습니다.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-colors"
            >
              새로고침
            </button>
            <button
              onClick={() => logout()}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 학급 코드 없음
  if (!userDoc.classCode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            학급 코드가 필요합니다
          </h2>
          <p className="text-gray-500 mb-6">
            선생님께 학급 코드를 받아 입력해주세요.
          </p>
          <button
            onClick={() => logout()}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  return (
    // 🔥 [최적화] ItemProvider를 여기에 배치 - 로그인 후에만 마운트되어 불필요한 Firestore 읽기 방지
    <ItemProvider>
      <EconomicEventProvider>
      <div className="min-h-screen text-slate-800 font-sans selection:bg-indigo-500/30 selection:text-indigo-800 flex flex-col md:flex-row">
        {/* PC 사이드바 */}
        <AlchanSidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          isCollapsed={isSidebarCollapsed}
        />

        {/* 메인 콘텐츠 영역 - 스크롤 문제 수정 */}
        <main
          className={`flex-1 min-w-0 md:min-h-screen relative ${
            isImmersiveMusicRoom ? "overflow-hidden" : ""
          }`}
        >
          {/* 헤더 */}
          {!isImmersiveMusicRoom && (
            <AlchanHeader
              toggleSidebar={toggleSidebar}
              isMobile={isMobile}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebarCollapse={toggleSidebarCollapse}
            />
          )}

          {/* 경제 이벤트 배너 */}
          {!isImmersiveMusicRoom && <EconomicEventBanner />}

          {/* 📢 투표 미참여 법안 전역 배너 */}
          {!isImmersiveMusicRoom && (
            <Suspense fallback={null}>
              <VoteReminderBanner />
            </Suspense>
          )}

          {/* 콘텐츠 영역 - 🔥 Suspense로 lazy loading 지원 */}
          <div
            className={`w-full ${isImmersiveMusicRoom ? "pb-0" : "pb-20 md:pb-4"}`}
          >
            <Suspense fallback={<AlchanLoading message="페이지 로딩 중..." />}>
              <Routes>
                {/* 메인 페이지 */}
                <Route
                  path="/dashboard/tasks"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-assets"
                  element={
                    <ProtectedRoute>
                      <MyAssets />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-profile"
                  element={
                    <ProtectedRoute>
                      <MyProfile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/coupon-goal"
                  element={
                    <ProtectedRoute>
                      <CouponGoalPage />
                    </ProtectedRoute>
                  }
                />

                {/* 게임 */}
                <Route
                  path="/learning-games/omok"
                  element={
                    <ProtectedRoute>
                      <OmokGame />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/learning-games/typing"
                  element={
                    <ProtectedRoute>
                      <TypingPracticeGame />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/learning-games/science"
                  element={
                    <ProtectedRoute>
                      <ChessGame />
                    </ProtectedRoute>
                  }
                />

                {/* 아이템 */}
                <Route
                  path="/item-shop"
                  element={
                    <ProtectedRoute>
                      <ItemStore />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-items"
                  element={
                    <ProtectedRoute>
                      <MyItems />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/item-market"
                  element={
                    <ProtectedRoute>
                      <PersonalShop />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/personal-shop"
                  element={
                    <ProtectedRoute>
                      <PersonalShop />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/group-purchase"
                  element={
                    <ProtectedRoute>
                      <GroupPurchase />
                    </ProtectedRoute>
                  }
                />

                {/* 금융 */}
                <Route
                  path="/banking"
                  element={
                    <ProtectedRoute>
                      <Banking />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/stock-trading"
                  element={
                    <ProtectedRoute>
                      <StockExchange />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/auction"
                  element={
                    <ProtectedRoute>
                      <Auction />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/real-estate"
                  element={
                    <ProtectedRoute>
                      <RealEstateRegistry />
                    </ProtectedRoute>
                  }
                />

                {/* 공공기관 */}
                <Route
                  path="/national-tax"
                  element={
                    <ProtectedRoute>
                      <NationalTaxService classCode={userDoc.classCode} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/national-assembly"
                  element={
                    <ProtectedRoute>
                      <NationalAssembly />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/court"
                  element={
                    <ProtectedRoute>
                      <Court />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/police"
                  element={
                    <ProtectedRoute>
                      <PoliceStation />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/organization-chart"
                  element={
                    <ProtectedRoute>
                      <OrganizationChart classCode={userDoc.classCode} />
                    </ProtectedRoute>
                  }
                />

                {/* 게시판 */}
                <Route
                  path="/learning-board"
                  element={
                    <ProtectedRoute>
                      <LearningBoard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/learning-board/music-request"
                  element={
                    <ProtectedRoute>
                      <MusicRequest user={user} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/music-room/:roomId"
                  element={
                    <ProtectedRoute>
                      <MusicRoom user={user} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/student-request/:roomId"
                  element={<StudentRequest />}
                />

                {/* 관리자 페이지 */}
                <Route
                  path="/admin/app-settings"
                  element={
                    <AdminRoute>
                      <Dashboard adminTabMode="generalSettings" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/job-settings"
                  element={
                    <AdminRoute>
                      <Dashboard adminTabMode="jobSettings" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/class-members"
                  element={
                    <AdminRoute>
                      <Dashboard adminTabMode="memberManagement" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/coupon-transfer"
                  element={
                    <ProtectedRoute>
                      <CouponTransfer />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/money-transfer"
                  element={
                    <ProtectedRoute>
                      <MoneyTransfer />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/approvals"
                  element={
                    <ProtectedRoute>
                      <AdminApprovalPanel />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/permissions"
                  element={
                    <AdminRoute>
                      <AdminPermissionManager />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/activity-log"
                  element={
                    <AdminRoute>
                      <AdminDatabase />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/items"
                  element={
                    <AdminRoute>
                      <AdminItemPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/economic-events"
                  element={
                    <AdminRoute>
                      <AdminEconomicEvents />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/students"
                  element={
                    <TeacherRoute>
                      <StudentManager />
                    </TeacherRoute>
                  }
                />

                {/* 🔥 앱 관리자(SuperAdmin) 전용 */}
                <Route
                  path="/super-admin"
                  element={
                    <SuperAdminRoute>
                      <SuperAdminDashboard />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="/super-admin/*"
                  element={
                    <SuperAdminRoute>
                      <SuperAdminDashboard />
                    </SuperAdminRoute>
                  }
                />

                {/* 유틸리티 */}
                <Route
                  path="/doctor"
                  element={
                    <ProtectedRoute>
                      <FirestoreDoctor />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/recover-donations"
                  element={
                    <ProtectedRoute>
                      <RecoverDonations />
                    </ProtectedRoute>
                  }
                />

                {/* 기본 리다이렉트 */}
                <Route
                  path="/"
                  element={<Navigate to="/dashboard/tasks" replace />}
                />
                <Route
                  path="*"
                  element={<Navigate to="/dashboard/tasks" replace />}
                />
              </Routes>
            </Suspense>
          </div>

          {/* 푸터 - PC만 */}
          {!isImmersiveMusicRoom && (
          <footer className="hidden md:block py-8 text-center text-sm text-slate-500 dark:text-gray-400 font-medium">
            © 2026 알찬 Corp. All rights reserved.
          </footer>
          )}
        </main>

        {/* 모바일 하단 네비게이션 */}
        {!isImmersiveMusicRoom && <MobileNav />}

        {/* PWA 설치 프롬프트 */}
        <PWAInstallPrompt />

        {/* 업데이트 알림 */}
        {updateAvailable && !showUpdateDismissed && (
          <UpdateNotification
            onUpdate={updateServiceWorker}
            onDismiss={() => {
              setShowUpdateDismissed(true);
              try {
                localStorage.setItem(
                  "alchan_update_dismissed",
                  Date.now().toString(),
                );
              } catch {}
            }}
          />
        )}

        {/* 오프라인 알림 */}
        {!isOnline && (
          <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center py-2 text-sm font-medium z-50 flex items-center justify-center gap-2">
            <WifiOff size={16} />
            오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.
          </div>
        )}

        {/* 플로팅 도움말 버튼 */}
        {!isImmersiveMusicRoom && <HelpButton />}

        {/* 🎓 첫 로그인 닉네임 설정 팝업 (학생 전용) */}
        <Suspense fallback={null}>
          <NicknameSetupPopup />
        </Suspense>

        {/* 첫 접속 안내 팝업 */}
        <WelcomePopup />

        {/* 🔥 경제 이벤트 팝업 (학생/모든 유저) */}
        <Suspense fallback={null}>
          <EconomicEventPopup />
        </Suspense>

        {/* 🏛️ 새 법안 제안 팝업 (투표 미참여 학생) */}
        <Suspense fallback={null}>
          <NewBillPopup />
        </Suspense>

        {/* 📱 iOS 홈화면 설치 안내 */}
        <Suspense fallback={null}>
          <IOSInstallPrompt />
        </Suspense>

        {/* 🔄 Android 앱 업데이트 체커 */}
        <Suspense fallback={null}>
          <AppUpdateChecker />
        </Suspense>

        {/* 🎁 출석 보상 팝업 모달 */}
        {showDailyRewardPopup && userDoc?.uid && (
          <div
            className="fixed inset-0 flex items-center justify-center p-5 bg-slate-900/30 z-[9999] animate-fadeIn"
            onClick={() => setShowDailyRewardPopup(false)}
          >
            <div
              className="w-full max-w-[400px] animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-right mb-2">
                <button
                  onClick={() => setShowDailyRewardPopup(false)}
                  className="w-8 h-8 rounded-full border-none cursor-pointer text-lg text-slate-800 dark:text-white flex items-center justify-center ml-auto bg-white/20"
                >
                  ✕
                </button>
              </div>
              <DailyRewardBanner
                userId={userDoc.uid}
                onClaim={handleDailyRewardClaim}
              />
              <div className="text-center mt-3 text-[13px] text-slate-800 dark:text-white/60">
                배경을 터치하면 닫힙니다
              </div>
            </div>
          </div>
        )}

        {/* 전역 스타일은 index.css로 이동됨 */}
      </div>
      </EconomicEventProvider>
    </ItemProvider>
  );
}

// AlchanLoading 컴포넌트 export
export { AlchanLoading };
