// src/components/AlchanLayout.js
// 알찬 UI 메인 레이아웃 컴포넌트 - Tailwind CSS 버전
// 🔥 성능 최적화: 게임/관리자 페이지 lazy loading 적용

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ItemProvider } from '../contexts/ItemContext'; // 🔥 [최적화] 로그인 후에만 마운트
import AlchanSidebar, { AppIcon } from './AlchanSidebar';
import AlchanHeader from './AlchanHeader';
import MobileNav from './MobileNav';
import PWAInstallPrompt from './PWAInstallPrompt';
import UpdateNotification from './UpdateNotification';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { AlchanLoadingScreen } from './ui/Skeleton';
import { WifiOff } from 'lucide-react';
import { DailyRewardBanner, getStreakInfo } from './DailyReward';
import WelcomePopup from './WelcomePopup';
import HelpButton from './HelpButton';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import globalCacheService from '../services/globalCacheService';
import { logger } from '../utils/logger';

// 🔥 핵심 페이지 - 즉시 로드 (자주 사용)
import Dashboard from '../pages/dashboard/Dashboard';
import ItemStore from '../pages/market/ItemStore';
import MyItems from '../pages/my-items/MyItems';
import Login from '../pages/auth/Login';

// 🔥 [최적화] 자주 사용하지만 초기 로드 불필요한 페이지 - 동적 로딩
const PersonalShop = lazy(() => import('../pages/market/PersonalShop'));
const Banking = lazy(() => import('../pages/banking/Banking'));
const MyProfile = lazy(() => import('../pages/my-profile/MyProfile'));
const MyAssets = lazy(() => import('../pages/my-assets/MyAssets'));

// 🔥 게임 페이지 - 동적 로딩 (번들 크기 절감)
const OmokGame = lazy(() => import('../pages/games/OmokGame'));
const ChessGame = lazy(() => import('../pages/games/ChessGame'));
const TypingPracticeGame = lazy(() => import('../pages/games/TypingPracticeGame'));

// 🔥 관리자/선생님 페이지 - 동적 로딩
const AdminItemPage = lazy(() => import('../pages/admin/AdminItemPage'));
const AdminDatabase = lazy(() => import('../pages/admin/AdminDatabase'));
const FirestoreDoctor = lazy(() => import('../pages/admin/FirestoreDoctor'));
const RecoverDonations = lazy(() => import('../pages/admin/RecoverDonations'));
const StudentManager = lazy(() => import('./StudentManager'));

// 🔥 앱 관리자(SuperAdmin) 전용 대시보드
const SuperAdminDashboard = lazy(() => import('../pages/superadmin/SuperAdminDashboard'));

// 🔥 덜 자주 사용하는 페이지 - 동적 로딩
const LearningBoard = lazy(() => import('../pages/learning/LearningBoard'));
const MusicRequest = lazy(() => import('../pages/music/MusicRequest'));
const MusicRoom = lazy(() => import('../pages/music/MusicRoom'));
const StudentRequest = lazy(() => import('../pages/student/StudentRequest'));
const StockExchange = lazy(() => import('../pages/banking/StockExchange'));
const RealEstateRegistry = lazy(() => import('../pages/real-estate/RealEstateRegistry'));
const NationalAssembly = lazy(() => import('../pages/government/NationalAssembly'));
const Government = lazy(() => import('../pages/government/Government'));
const Court = lazy(() => import('../pages/government/Court'));
const PoliceStation = lazy(() => import('../pages/government/PoliceStation'));
const Auction = lazy(() => import('../pages/market/Auction'));
const MoneyTransfer = lazy(() => import('../pages/banking/MoneyTransfer'));
const CouponTransfer = lazy(() => import('../pages/banking/CouponTransfer'));
const CouponGoalPage = lazy(() => import('../pages/coupon/CouponGoalPage'));
const OrganizationChart = lazy(() => import('../pages/organization/OrganizationChart'));


// 전체 화면이 필요한 페이지 경로 (자동으로 사이드바 접기)
const FULLSCREEN_PAGES = [
  '/learning-games/omok',
  '/learning-games/science',
  '/learning-games/typing',
  '/court',
  '/national-assembly',
  '/music-room',
];

// 공통 로딩 컴포넌트 - 항상 통일된 보라색 전체화면 로딩 사용
const AlchanLoading = ({ message = '로딩 중...' }) => {
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

  const isAdmin = userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
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

  const isTeacher = userDoc?.isTeacher || userDoc?.isAdmin || userDoc?.isSuperAdmin;
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
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc, loading, logout } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showUpdateDismissed, setShowUpdateDismissed] = useState(() => {
    try {
      const dismissed = localStorage.getItem('alchan_update_dismissed');
      if (!dismissed) return false;
      // 24시간 이내에 닫았으면 계속 숨김
      return Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000;
    } catch { return false; }
  });
  const [showDailyRewardPopup, setShowDailyRewardPopup] = useState(false);

  // PWA 서비스 워커 훅
  const { updateAvailable, updateServiceWorker, isOnline } = useServiceWorker();

  // 🎁 출석 보상 팝업 - 앱 진입(탭 열기) 시 자동 표시
  useEffect(() => {
    if (userDoc?.uid && userDoc?.role === 'student') {
      const streakInfo = getStreakInfo(userDoc.uid);
      if (streakInfo.canClaim) {
        const timer = setTimeout(() => {
          setShowDailyRewardPopup(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [userDoc?.uid, userDoc?.role]);

  // 🎁 출석 보상 수령 처리
  const handleDailyRewardClaim = useCallback(async (rewardAmount) => {
    if (!userDoc?.uid || !rewardAmount) return;
    try {
      const userRef = doc(db, "users", userDoc.uid);
      await updateDoc(userRef, { cash: increment(rewardAmount) });
      globalCacheService.invalidate(`user_${userDoc.uid}`);
      setTimeout(() => setShowDailyRewardPopup(false), 3000);
    } catch (error) {
      logger.error("출석 보상 지급 실패:", error);
    }
  }, [userDoc?.uid]);

  // Jua 폰트는 index.html에서 preload로 로드됨 (중복 제거)

  // 전체 화면 페이지에서 자동으로 사이드바 접기
  useEffect(() => {
    const isFullscreenPage = FULLSCREEN_PAGES.some(page => location.pathname.startsWith(page));
    if (isFullscreenPage && !isMobile) {
      setIsSidebarCollapsed(true);
    }
  }, [location.pathname, isMobile]);

  // 화면 크기 감지
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
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
  if (location.pathname === '/login') {
    return user ? <Navigate to="/dashboard/tasks" replace /> : <Login />;
  }

  // 학급 코드 없음
  if (!userDoc.classCode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">학급 코드가 필요합니다</h2>
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

  const userClassCode = userDoc?.classCode;

  return (
    // 🔥 [최적화] ItemProvider를 여기에 배치 - 로그인 후에만 마운트되어 불필요한 Firestore 읽기 방지
    <ItemProvider>
    <div className="min-h-screen bg-[#0a0a12] text-gray-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 flex">
      {/* PC 사이드바 */}
      <AlchanSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isSidebarCollapsed}
      />

      {/* 메인 콘텐츠 영역 - 스크롤 문제 수정 */}
      <main className="flex-1 min-w-0 md:min-h-screen relative bg-[#0a0a12] overflow-visible">
        {/* 헤더 */}
        <AlchanHeader
          toggleSidebar={toggleSidebar}
          isMobile={isMobile}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={toggleSidebarCollapse}
        />

        {/* 콘텐츠 영역 - 🔥 Suspense로 lazy loading 지원 */}
        <div className="w-full pb-20 md:pb-4">
          <Suspense fallback={<AlchanLoading message="페이지 로딩 중..." />}>
          <Routes>
            {/* 메인 페이지 */}
            <Route path="/dashboard/tasks" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/my-assets" element={<ProtectedRoute><MyAssets /></ProtectedRoute>} />
            <Route path="/my-profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
            <Route path="/coupon-goal" element={<ProtectedRoute><CouponGoalPage /></ProtectedRoute>} />

            {/* 게임 */}
            <Route path="/learning-games/omok" element={<ProtectedRoute><OmokGame /></ProtectedRoute>} />
            <Route path="/learning-games/typing" element={<ProtectedRoute><TypingPracticeGame /></ProtectedRoute>} />
            <Route path="/learning-games/science" element={<ProtectedRoute><ChessGame /></ProtectedRoute>} />

            {/* 아이템 */}
            <Route path="/item-shop" element={<ProtectedRoute><ItemStore /></ProtectedRoute>} />
            <Route path="/my-items" element={<ProtectedRoute><MyItems /></ProtectedRoute>} />
            <Route path="/item-market" element={<ProtectedRoute><PersonalShop /></ProtectedRoute>} />
            <Route path="/personal-shop" element={<ProtectedRoute><PersonalShop /></ProtectedRoute>} />

            {/* 금융 */}
            <Route path="/banking" element={<ProtectedRoute><Banking /></ProtectedRoute>} />
            <Route path="/stock-trading" element={<ProtectedRoute><StockExchange /></ProtectedRoute>} />
            <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
            <Route path="/real-estate" element={<ProtectedRoute><RealEstateRegistry /></ProtectedRoute>} />

            {/* 공공기관 */}
            <Route path="/government" element={<ProtectedRoute><Government /></ProtectedRoute>} />
            <Route path="/national-assembly" element={<ProtectedRoute><NationalAssembly /></ProtectedRoute>} />
            <Route path="/court" element={<ProtectedRoute><Court /></ProtectedRoute>} />
            <Route path="/police" element={<ProtectedRoute><PoliceStation /></ProtectedRoute>} />

            {/* 게시판 */}
            <Route path="/learning-board" element={<ProtectedRoute><LearningBoard /></ProtectedRoute>} />
            <Route path="/learning-board/music-request" element={<ProtectedRoute><MusicRequest user={user} /></ProtectedRoute>} />
            <Route path="/music-room/:roomId" element={<ProtectedRoute><MusicRoom user={user} /></ProtectedRoute>} />
            <Route path="/student-request/:roomId" element={<StudentRequest />} />

            {/* 관리자 페이지 */}
            <Route path="/admin/app-settings" element={<AdminRoute><Dashboard adminTabMode="generalSettings" /></AdminRoute>} />
            <Route path="/admin/job-settings" element={<AdminRoute><Dashboard adminTabMode="jobSettings" /></AdminRoute>} />
            <Route path="/admin/class-members" element={<AdminRoute><Dashboard adminTabMode="memberManagement" /></AdminRoute>} />
            <Route path="/admin/coupon-transfer" element={<AdminRoute><CouponTransfer /></AdminRoute>} />
            <Route path="/admin/money-transfer" element={<AdminRoute><MoneyTransfer /></AdminRoute>} />
            <Route path="/admin/activity-log" element={<AdminRoute><AdminDatabase /></AdminRoute>} />
            <Route path="/admin/items" element={<AdminRoute><AdminItemPage /></AdminRoute>} />
            <Route path="/admin/students" element={<TeacherRoute><StudentManager /></TeacherRoute>} />

            {/* 🔥 앱 관리자(SuperAdmin) 전용 */}
            <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
            <Route path="/super-admin/*" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />

            {/* 유틸리티 */}
            <Route path="/doctor" element={<ProtectedRoute><FirestoreDoctor /></ProtectedRoute>} />
            <Route path="/recover-donations" element={<ProtectedRoute><RecoverDonations /></ProtectedRoute>} />

            {/* 기본 리다이렉트 */}
            <Route path="/" element={<Navigate to="/dashboard/tasks" replace />} />
            <Route path="*" element={<Navigate to="/dashboard/tasks" replace />} />
          </Routes>
          </Suspense>
        </div>

        {/* 푸터 - PC만 */}
        <footer className="hidden md:block py-8 text-center text-sm text-gray-400 font-medium">
          © 2025 알찬 Corp. All rights reserved.
        </footer>
      </main>

      {/* 모바일 하단 네비게이션 */}
      <MobileNav />

      {/* PWA 설치 프롬프트 */}
      <PWAInstallPrompt />

      {/* 업데이트 알림 */}
      {updateAvailable && !showUpdateDismissed && (
        <UpdateNotification
          onUpdate={updateServiceWorker}
          onDismiss={() => {
            setShowUpdateDismissed(true);
            try { localStorage.setItem('alchan_update_dismissed', Date.now().toString()); } catch {}
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
      <HelpButton />

      {/* 첫 접속 안내 팝업 */}
      <WelcomePopup />

      {/* 🎁 출석 보상 팝업 모달 */}
      {showDailyRewardPopup && userDoc?.uid && (
        <div
          className="fixed inset-0 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm z-[9999] animate-fadeIn"
          onClick={() => setShowDailyRewardPopup(false)}
        >
          <div
            className="w-full max-w-[400px] animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-right mb-2">
              <button
                onClick={() => setShowDailyRewardPopup(false)}
                className="w-8 h-8 rounded-full border-none cursor-pointer text-lg text-white flex items-center justify-center ml-auto bg-white/20"
              >
                ✕
              </button>
            </div>
            <DailyRewardBanner
              userId={userDoc.uid}
              onClaim={handleDailyRewardClaim}
            />
            <div className="text-center mt-3 text-[13px] text-white/60">
              배경을 터치하면 닫힙니다
            </div>
          </div>
        </div>
      )}

      {/* 전역 스타일 */}
      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .font-jua { font-family: 'Jua', sans-serif; }
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 2s linear infinite; }
      `}</style>
    </div>
    </ItemProvider>
  );
}

// AlchanLoading 컴포넌트 export
export { AlchanLoading };
