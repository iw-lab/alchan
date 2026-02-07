// src/components/AlchanSidebar.js
// 알찬 UI 사이드바 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  X, ChevronRight, ChevronDown,
  Wallet, Target, Gamepad2, Package, TrendingUp,
  Landmark, FileText, Crown, ShoppingBag, Building2, Music,
  Settings, Users, Banknote, Scale, Shield, Sparkles, LogOut,
  Boxes, Store, RefreshCw, Hammer, BarChart3, BookOpen, Keyboard, Circle,
  Briefcase, ListTodo, LayoutDashboard
} from 'lucide-react';

// ============================================
// 앱 아이콘 컴포넌트 (export하여 다른 곳에서도 사용)
// ============================================
export const AppIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="iconGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#4F46E5" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="5" y="5" width="90" height="90" rx="22" fill="url(#iconGradient)" />
    <path
      d="M28 52 L42 66 L72 36"
      stroke="white"
      strokeWidth="10"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#glow)"
    />
    <path
      d="M75 25 L77 30 L82 30 L78 34 L79 39 L75 36 L71 39 L72 34 L68 30 L73 30 Z"
      fill="#FFD700"
      stroke="#B45309"
      strokeWidth="1"
    />
  </svg>
);

// 메뉴 구조 정의
export const ALCHAN_MENU_ITEMS = [
  // Main - 메인
  { id: 'todayTasks', label: '알찬 오늘의 할일', icon: LayoutDashboard, path: '/dashboard/tasks', category: 'main' },
  { id: 'myAssets', label: '알찬 나의 자산', icon: Wallet, path: '/my-assets', category: 'main' },
  { id: 'couponGoal', label: '알찬 쿠폰 목표', icon: Target, path: '/coupon-goal', category: 'main' },

  // Games Category - 게임
  { id: 'gamesCategory', label: '알찬 학습 게임', icon: Gamepad2, isCategory: true, category: 'play' },
  { id: 'omokGame', label: '오목', icon: Circle, path: '/learning-games/omok', parentId: 'gamesCategory' },
  { id: 'typingGame', label: '타자연습', icon: Keyboard, path: '/learning-games/typing', parentId: 'gamesCategory' },
  { id: 'chessGame', label: '체스 게임', icon: Crown, path: '/learning-games/science', parentId: 'gamesCategory' },

  // Items Category - 아이템
  { id: 'itemsCategory', label: '알찬 아이템', icon: Package, isCategory: true, category: 'economy' },
  { id: 'myItems', label: '내 아이템', icon: Boxes, path: '/my-items', parentId: 'itemsCategory' },
  { id: 'itemStore', label: '아이템 상점', icon: Store, path: '/item-shop', parentId: 'itemsCategory' },
  { id: 'personalShop', label: '개인 상점', icon: ShoppingBag, path: '/personal-shop', parentId: 'itemsCategory' },

  // Finance Category - 금융
  { id: 'financeCategory', label: '알찬 금융', icon: TrendingUp, isCategory: true, category: 'economy' },
  { id: 'banking', label: '은행', icon: Banknote, path: '/banking', parentId: 'financeCategory' },
  { id: 'stockTrading', label: '주식 거래소', icon: BarChart3, path: '/stock-trading', parentId: 'financeCategory' },
  { id: 'auction', label: '경매장', icon: Hammer, path: '/auction', parentId: 'financeCategory' },
  { id: 'realEstate', label: '부동산', icon: Building2, path: '/real-estate', parentId: 'financeCategory' },

  // Public Category - 공공기관
  { id: 'publicCategory', label: '알찬 공공기관', icon: Landmark, isCategory: true, category: 'society' },
  { id: 'government', label: '정부', icon: Landmark, path: '/government', parentId: 'publicCategory' },
  { id: 'nationalAssembly', label: '국회', icon: Users, path: '/national-assembly', parentId: 'publicCategory' },
  { id: 'court', label: '법원', icon: Scale, path: '/court', parentId: 'publicCategory' },
  { id: 'policeStation', label: '경찰서', icon: Shield, path: '/police', parentId: 'publicCategory' },

  // Board Category - 게시판
  { id: 'boardCategory', label: '알찬 게시판', icon: FileText, isCategory: true, category: 'community' },
  { id: 'learningBoard', label: '학습 게시판', icon: BookOpen, path: '/learning-board', parentId: 'boardCategory' },
  { id: 'musicRequest', label: '음악 신청', icon: Music, path: '/learning-board/music-request', parentId: 'boardCategory' },

  // Admin Category - 관리자 (그룹별로 정리)
  { id: 'adminCategory', label: '알찬 관리자', icon: Settings, isCategory: true, category: 'admin', adminOnly: true },

  // 👥 학생/구성원 관리 그룹
  { id: 'adminUserGroup', label: '👥 학생/구성원', icon: Users, isSubGroup: true, parentId: 'adminCategory', adminOnly: true },
  { id: 'studentManagement', label: '학생 목록', icon: Users, path: '/admin/students', parentId: 'adminCategory', adminOnly: true },
  { id: 'classMemberManagement', label: '학급 구성원', icon: Users, path: '/admin/class-members', parentId: 'adminCategory', adminOnly: true },

  // 💰 자산 관리 그룹
  { id: 'adminAssetGroup', label: '💰 자산 관리', icon: Banknote, isSubGroup: true, parentId: 'adminCategory', adminOnly: true },
  { id: 'moneyTransfer', label: '돈 보내기/가져오기', icon: Banknote, path: '/admin/money-transfer', parentId: 'adminCategory', adminOnly: true },
  { id: 'couponTransfer', label: '쿠폰 보내기/가져오기', icon: Target, path: '/admin/coupon-transfer', parentId: 'adminCategory', adminOnly: true },

  // ⚙️ 학급 설정 그룹
  { id: 'adminSettingsGroup', label: '⚙️ 학급 설정', icon: Settings, isSubGroup: true, parentId: 'adminCategory', adminOnly: true },
  { id: 'adminAppSettings', label: '일반 설정', icon: Target, path: '/admin/app-settings', parentId: 'adminCategory', adminOnly: true },
  { id: 'jobManagement', label: '직업/할일', icon: Briefcase, path: '/admin/job-settings', parentId: 'adminCategory', adminOnly: true },

  // 🔧 시스템 그룹
  { id: 'adminSystemGroup', label: '🔧 시스템', icon: Settings, isSubGroup: true, parentId: 'adminCategory', adminOnly: true },
  { id: 'activityLog', label: '데이터베이스', icon: FileText, path: '/admin/activity-log', parentId: 'adminCategory', adminOnly: true },

  // 🔥 SuperAdmin Category - 앱 관리자 전용 (isSuperAdmin만 접근 가능)
  { id: 'superAdminCategory', label: '앱 관리자', icon: Shield, isCategory: true, category: 'superadmin', superAdminOnly: true },
  { id: 'superAdminDashboard', label: '앱 관리 대시보드', icon: Shield, path: '/super-admin', parentId: 'superAdminCategory', superAdminOnly: true },
];

// 카테고리 라벨
const CATEGORY_LABELS = {
  main: '메인',
  play: '게임',
  economy: '경제',
  society: '사회',
  community: '커뮤니티',
  admin: '관리',
  superadmin: '앱 관리',
};

// ============================================
// 메뉴 섹션 컴포넌트
// ============================================
const MenuSection = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
    <ul className="space-y-1">
      {children}
    </ul>
  </div>
);

// ============================================
// 메뉴 아이템 컴포넌트
// ============================================
const MenuItem = ({ icon: Icon, label, active, hasSubmenu, onClick }) => (
  <li>
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group ${active
          ? 'bg-indigo-500/20 text-indigo-400 font-bold shadow-sm border border-indigo-500/30'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-[18px] h-[18px] ${active ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
        <span className="text-sm">{label}</span>
      </div>
      {hasSubmenu && <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  </li>
);

// ============================================
// 서브메뉴 아이템 컴포넌트
// ============================================
const SubMenuItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${active
        ? 'text-indigo-400 bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
        : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
      }`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

// ============================================
// 카테고리 컴포넌트
// ============================================
const CategoryItem = ({ category, children, isExpanded, onToggle, hasActiveChild }) => {
  const Icon = category.icon;

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${hasActiveChild
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
      >
        <Icon
          className={`w-[18px] h-[18px] transition-colors flex-shrink-0 ${hasActiveChild ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
            }`}
        />
        <span className="flex-1 text-left">{category.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-300 opacity-50 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''
            }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="pl-4 mt-2 space-y-1 border-l-2 border-slate-700 ml-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================
// 메인 사이드바 컴포넌트
// ============================================
export default function AlchanSidebar({ isOpen, onClose, isCollapsed = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc, logout } = useAuth();

  const [expandedCategories, setExpandedCategories] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCategory = useCallback((categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  }, []);

  const isActive = useCallback((path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }, [location.pathname]);

  const hasActiveChild = useCallback((categoryId) => {
    return ALCHAN_MENU_ITEMS.some(item =>
      item.parentId === categoryId && isActive(item.path)
    );
  }, [isActive]);

  const handleItemClick = useCallback((item) => {
    if (item.path) {
      navigate(item.path);
      if (isMobile) onClose?.();
    }
  }, [navigate, isMobile, onClose]);

  const handleLogout = useCallback(async () => {
    if (logout) {
      await logout();
      navigate('/login');
    }
  }, [logout, navigate]);

  const isAdmin = userDoc?.isAdmin || userDoc?.isSuperAdmin;
  const isSuperAdmin = userDoc?.isSuperAdmin;

  let userRole = "학생";
  if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
  else if (userDoc?.isAdmin) userRole = "교사";

  const userName = userDoc?.name || userDoc?.nickname || "사용자";

  // 카테고리별 메뉴 렌더링
  const renderMenuSection = (categoryKey) => {
    const items = ALCHAN_MENU_ITEMS.filter(item => {
      if (item.category !== categoryKey) return false;
      if (item.adminOnly && !isAdmin) return false;
      if (item.superAdminOnly && !isSuperAdmin) return false;
      return true;
    });

    if (items.length === 0) return null;

    return (
      <MenuSection key={categoryKey} title={CATEGORY_LABELS[categoryKey]}>
        {items.map(item => {
          if (item.isCategory) {
            const childItems = ALCHAN_MENU_ITEMS.filter(child => {
              if (child.parentId !== item.id) return false;
              if (child.adminOnly && !isAdmin) return false;
              if (child.superAdminOnly && !isSuperAdmin) return false;
              return true;
            });

            if (childItems.length === 0) return null;

            return (
              <CategoryItem
                key={item.id}
                category={item}
                isExpanded={expandedCategories[item.id] || hasActiveChild(item.id)}
                onToggle={() => toggleCategory(item.id)}
                hasActiveChild={hasActiveChild(item.id)}
              >
                {childItems.map(child => {
                  // 서브그룹 헤더인 경우
                  if (child.isSubGroup) {
                    return (
                      <div key={child.id} className="mt-3 mb-1 first:mt-0">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                          {child.label}
                        </span>
                      </div>
                    );
                  }
                  // 일반 메뉴 아이템
                  return (
                    <SubMenuItem
                      key={child.id}
                      icon={child.icon}
                      label={child.label}
                      active={isActive(child.path)}
                      onClick={() => handleItemClick(child)}
                    />
                  );
                })}
              </CategoryItem>
            );
          } else if (!item.parentId) {
            return (
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={isActive(item.path)}
                onClick={() => handleItemClick(item)}
              />
            );
          }
          return null;
        })}
      </MenuSection>
    );
  };

  // PC 접힌 상태
  if (isCollapsed && !isMobile) {
    return (
      <aside className="hidden md:flex flex-col w-20 bg-[#141423] border-r border-[#00fff2]/10 h-screen sticky top-0 left-0 z-50 shadow-xl transition-all duration-300">
        {/* 로고 */}
        <div className="h-16 min-h-16 flex items-center justify-center bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600">
          <div className="p-1 bg-white/10 rounded-lg shadow-md">
            <AppIcon style={{ width: '32px', height: '32px' }} />
          </div>
        </div>

        {/* 아이콘 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
          {ALCHAN_MENU_ITEMS.filter(item => !item.parentId && !item.isCategory).map(item => {
            if (item.adminOnly && !isAdmin) return null;
            if (item.superAdminOnly && !isSuperAdmin) return null;
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                title={item.label}
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center transition-all duration-200 ${active
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-500/40 border-none'
                    : 'bg-[#1a1a2e] border border-slate-700/50 text-slate-400 hover:bg-indigo-900/30 hover:text-indigo-400 hover:border-indigo-500/30'
                  }`}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </nav>

        {/* 사용자 아바타 */}
        <div className="p-4 border-t border-slate-800 bg-[#0a0a12]/50">
          <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold">
            {userName.charAt(0)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* 모바일 오버레이 */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#141423] border-r border-[#00fff2]/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-in-out
          ${isMobile
            ? isOpen ? 'translate-x-0' : '-translate-x-full'
            : 'relative translate-x-0'
          }
          lg:relative lg:translate-x-0 lg:w-72 flex flex-col shrink-0
        `}
      >
        {/* 로고 영역 - 세련된 디자인 */}
        <div className="h-[72px] min-h-[72px] m-3 flex items-center relative rounded-2xl bg-gradient-to-br from-[#0a0a12]/95 to-[#141423]/95 border border-[#00fff2]/20 shadow-[0_0_15px_rgba(0,255,242,0.1)]">
          {/* 배경 장식 */}
          <div className="absolute -top-5 -right-5 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -bottom-7 -left-2 w-15 h-15 bg-white/[0.08] rounded-full" />

          <div className="flex items-center gap-3.5 px-4 w-full relative z-10">
            {/* 아이콘 박스 */}
            <div className="p-1.5 bg-white/5 rounded-xl shadow-md border border-white/10">
              <AppIcon style={{ width: '36px', height: '36px' }} />
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[22px] font-black text-[#00fff2] leading-tight font-jua drop-shadow-[0_0_10px_rgba(0,255,242,0.5)]">알찬</span>
              <span className="text-[11px] font-bold text-[#e8e8ff]/70 tracking-[0.2em] leading-tight mt-0.5">ALCHAN</span>
            </div>
          </div>

          {/* 모바일 닫기 버튼 */}
          {isMobile && (
            <button
              onClick={onClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/20 border-0 text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* 네비게이션 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-hide">
          {renderMenuSection('main')}
          {renderMenuSection('play')}
          {renderMenuSection('economy')}
          {renderMenuSection('society')}
          {renderMenuSection('community')}
          {renderMenuSection('admin')}
          {renderMenuSection('superadmin')}
        </nav>

        {/* 하단 사용자 프로필 */}
        <div className="p-4 border-t border-slate-800 bg-[#0a0a12]/50">
          <div
            onClick={handleLogout}
            className="flex items-center gap-3 p-3 rounded-xl bg-[#141423] shadow-sm border border-slate-700 hover:shadow-md hover:border-indigo-500/50 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userRole}</p>
            </div>
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
          </div>
        </div>
      </aside>
    </>
  );
}
