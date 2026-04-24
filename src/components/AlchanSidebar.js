// src/components/AlchanSidebar.js
// 알찬 UI 사이드바 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db as firebaseDb } from "../firebase";
import {
  collection as fbCollection,
  query as fbQuery,
  where as fbWhere,
  getDocs,
  getCountFromServer,
  orderBy as fbOrderBy,
  limit as fbLimit,
  Timestamp as fbTimestamp,
} from "firebase/firestore";
import {
  X,
  ChevronDown,
  Wallet,
  Target,
  Gamepad2,
  Package,
  TrendingUp,
  Landmark,
  FileText,
  Crown,
  ShoppingBag,
  Building2,
  Music,
  Settings,
  Users,
  Banknote,
  Scale,
  Shield,
  LogOut,
  Boxes,
  Store,
  Hammer,
  BarChart3,
  BookOpen,
  Keyboard,
  Circle,
  LayoutDashboard,
  CheckCircle,
  Zap,
} from "lucide-react";

// ============================================
// 앱 아이콘 컴포넌트 (export하여 다른 곳에서도 사용)
// ============================================
export const AppIcon = ({ className, style }) => (
  <svg
    className={className}
    style={style}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="iconGradient"
        x1="0"
        y1="0"
        x2="100"
        y2="100"
        gradientUnits="userSpaceOnUse"
      >
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
    <rect
      x="5"
      y="5"
      width="90"
      height="90"
      rx="22"
      fill="url(#iconGradient)"
    />
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
  {
    id: "todayTasks",
    label: "알찬 오늘의 할일",
    icon: LayoutDashboard,
    path: "/dashboard/tasks",
    category: "main",
  },
  {
    id: "myAssets",
    label: "알찬 나의 자산",
    icon: Wallet,
    path: "/my-assets",
    category: "main",
  },
  {
    id: "couponGoal",
    label: "알찬 쿠폰 목표",
    icon: Target,
    path: "/coupon-goal",
    category: "main",
  },

  // Games Category - 게임
  {
    id: "gamesCategory",
    label: "알찬 학습 게임",
    icon: Gamepad2,
    isCategory: true,
    category: "play",
  },
  {
    id: "omokGame",
    label: "오목",
    icon: Circle,
    path: "/learning-games/omok",
    parentId: "gamesCategory",
  },
  {
    id: "typingGame",
    label: "타자연습",
    icon: Keyboard,
    path: "/learning-games/typing",
    parentId: "gamesCategory",
  },
  {
    id: "chessGame",
    label: "체스 게임",
    icon: Crown,
    path: "/learning-games/science",
    parentId: "gamesCategory",
  },

  // Items Category - 아이템
  {
    id: "itemsCategory",
    label: "알찬 아이템",
    icon: Package,
    isCategory: true,
    category: "economy",
  },
  {
    id: "myItems",
    label: "내 아이템",
    icon: Boxes,
    path: "/my-items",
    parentId: "itemsCategory",
  },
  {
    id: "itemStore",
    label: "아이템 상점",
    icon: Store,
    path: "/item-shop",
    parentId: "itemsCategory",
  },
  {
    id: "personalShop",
    label: "개인 상점",
    icon: ShoppingBag,
    path: "/personal-shop",
    parentId: "itemsCategory",
  },
  {
    id: "groupPurchase",
    label: "함께구매",
    icon: Users,
    path: "/group-purchase",
    parentId: "itemsCategory",
  },

  // Finance Category - 금융
  {
    id: "financeCategory",
    label: "알찬 금융",
    icon: TrendingUp,
    isCategory: true,
    category: "economy",
  },
  {
    id: "banking",
    label: "은행",
    icon: Banknote,
    path: "/banking",
    parentId: "financeCategory",
  },
  {
    id: "stockTrading",
    label: "주식 거래소",
    icon: BarChart3,
    path: "/stock-trading",
    parentId: "financeCategory",
  },
  {
    id: "auction",
    label: "경매장",
    icon: Hammer,
    path: "/auction",
    parentId: "financeCategory",
  },
  {
    id: "realEstate",
    label: "부동산",
    icon: Building2,
    path: "/real-estate",
    parentId: "financeCategory",
  },

  // Public Category - 공공기관
  {
    id: "publicCategory",
    label: "알찬 공공기관",
    icon: Landmark,
    isCategory: true,
    category: "society",
  },
  {
    id: "organizationChart",
    label: "대통령실",
    icon: Building2,
    path: "/organization-chart",
    parentId: "publicCategory",
  },
  {
    id: "nationalAssembly",
    label: "국회",
    icon: Users,
    path: "/national-assembly",
    parentId: "publicCategory",
  },
  {
    id: "court",
    label: "법원",
    icon: Scale,
    path: "/court",
    parentId: "publicCategory",
  },
  {
    id: "policeStation",
    label: "경찰서",
    icon: Shield,
    path: "/police",
    parentId: "publicCategory",
  },
  {
    id: "nationalTax",
    label: "국세청",
    icon: Banknote,
    path: "/national-tax",
    parentId: "publicCategory",
  },

  // Board Category - 게시판
  {
    id: "boardCategory",
    label: "알찬 게시판",
    icon: FileText,
    isCategory: true,
    category: "community",
  },
  {
    id: "learningBoard",
    label: "학습 게시판",
    icon: BookOpen,
    path: "/learning-board",
    parentId: "boardCategory",
  },
  {
    id: "musicRequest",
    label: "음악 신청",
    icon: Music,
    path: "/learning-board/music-request",
    parentId: "boardCategory",
  },

  // 위임 기능 카테고리 (위임된 학생에게만 표시)
  {
    id: "delegationCategory",
    label: "위임 기능",
    icon: Shield,
    isCategory: true,
    category: "delegation",
    delegatedOnly: "any",
  },
  {
    id: "delegatedTaskApproval",
    label: "할일 승인",
    icon: CheckCircle,
    path: "/admin/approvals",
    parentId: "delegationCategory",
    delegatedOnly: "taskApproval",
  },
  {
    id: "delegatedMoneyTransfer",
    label: "돈 보내기/가져오기",
    icon: Banknote,
    path: "/admin/money-transfer",
    parentId: "delegationCategory",
    delegatedOnly: "moneyTransfer",
  },
  {
    id: "delegatedCouponTransfer",
    label: "쿠폰 보내기/가져오기",
    icon: Target,
    path: "/admin/coupon-transfer",
    parentId: "delegationCategory",
    delegatedOnly: "couponTransfer",
  },

  // Admin Category - 관리자
  {
    id: "adminCategory",
    label: "알찬 관리자",
    icon: Settings,
    isCategory: true,
    category: "admin",
    adminOnly: true,
  },
  {
    id: "taskApprovals",
    label: "할일 승인",
    icon: CheckCircle,
    path: "/admin/approvals",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "permissionManager",
    label: "권한 위임",
    icon: Shield,
    path: "/admin/permissions",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "adminSettings",
    label: "관리자 설정",
    icon: Settings,
    path: "/admin/app-settings",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "studentManagement",
    label: "학생 목록",
    icon: Users,
    path: "/admin/students",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "moneyTransfer",
    label: "돈 보내기/가져오기",
    icon: Banknote,
    path: "/admin/money-transfer",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "couponTransfer",
    label: "쿠폰 보내기/가져오기",
    icon: Target,
    path: "/admin/coupon-transfer",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "activityLog",
    label: "데이터베이스",
    icon: FileText,
    path: "/admin/activity-log",
    parentId: "adminCategory",
    adminOnly: true,
  },
  {
    id: "economicEvents",
    label: "경제 이벤트",
    icon: Zap,
    path: "/admin/economic-events",
    parentId: "adminCategory",
    adminOnly: true,
  },

  // 🔥 SuperAdmin Category - 앱 관리자 전용 (isSuperAdmin만 접근 가능)
  {
    id: "superAdminCategory",
    label: "앱 관리자",
    icon: Shield,
    isCategory: true,
    category: "superadmin",
    superAdminOnly: true,
  },
  {
    id: "superAdminDashboard",
    label: "앱 관리 대시보드",
    icon: Shield,
    path: "/super-admin",
    parentId: "superAdminCategory",
    superAdminOnly: true,
  },
];

// 카테고리 라벨
const CATEGORY_LABELS = {
  main: "메인",
  play: "게임",
  economy: "경제",
  society: "사회",
  community: "커뮤니티",
  delegation: "위임 기능",
  admin: "관리",
  superadmin: "앱 관리",
};

// ============================================
// 메뉴 섹션 컴포넌트
// ============================================
const MenuSection = memo(({ title, children }) => (
  <div className="mb-2">
    <h3 className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#4338ca' }}>
      {title}
    </h3>
    <ul className="space-y-0.5">{children}</ul>
  </div>
));

// ============================================
// 메뉴 아이템 컴포넌트
// ============================================
const MenuItem = memo(({ icon: Icon, label, active, hasSubmenu, onClick, badgeCount = 0 }) => (
  <li>
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group`}
      style={active ? {
        background: 'var(--accent-light)',
        color: 'var(--accent)',
        fontWeight: 700,
        border: '1px solid var(--border-accent)',
      } : {
        color: 'var(--text-secondary)',
        border: '1px solid transparent',
      }}
    >
      <div className="flex items-center gap-3">
        <Icon
          className="w-[18px] h-[18px]"
          style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
        />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badgeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full"
            style={{ background: '#ef4444', color: '#fff', lineHeight: 1 }}
            aria-label={`${badgeCount}건의 새로운 알림`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {hasSubmenu && <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </div>
    </button>
  </li>
));

// ============================================
// 서브메뉴 아이템 컴포넌트
// ============================================
const SubMenuItem = memo(({ icon: Icon, label, active, onClick, badgeCount = 0 }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
    style={active ? {
      color: 'var(--accent)',
      background: 'var(--accent-light)',
    } : {
      color: 'var(--text-secondary)',
    }}
  >
    <Icon className="w-3.5 h-3.5" />
    <span className="flex-1 text-left">{label}</span>
    {badgeCount > 0 && (
      <span
        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full"
        style={{ background: '#ef4444', color: '#fff', lineHeight: 1 }}
        aria-label={`${badgeCount}건의 새로운 알림`}
      >
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </button>
));

// ============================================
// 카테고리 컴포넌트
// ============================================
const CategoryItem = ({
  category,
  children,
  isExpanded,
  onToggle,
  hasActiveChild,
}) => {
  const Icon = category.icon;

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group"
        style={hasActiveChild ? {
          background: 'var(--accent-bg)',
          color: 'var(--accent)',
          border: '1px solid var(--border-accent)',
        } : {
          color: 'var(--text-secondary)',
          border: '1px solid transparent',
        }}
      >
        <Icon
          className="w-[18px] h-[18px] transition-colors flex-shrink-0"
          style={{ color: hasActiveChild ? 'var(--accent)' : 'var(--text-muted)' }}
        />
        <span className="flex-1 text-left">{category.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-300 opacity-50 flex-shrink-0 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pl-4 mt-2 space-y-1 ml-4" style={{ borderLeft: '2px solid var(--border-primary)' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================
// 메인 사이드바 컴포넌트
// ============================================
export default function AlchanSidebar({
  isOpen,
  onClose,
  isCollapsed = false,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userDoc, logout } = useAuth();

  const [expandedCategories, setExpandedCategories] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [learningBoards, setLearningBoards] = useState([]);

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setIsMobile(window.innerWidth < 768), 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const toggleCategory = useCallback((categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  }, []);

  const isActive = useCallback(
    (path) => {
      if (!path) return false;
      return (
        location.pathname === path || location.pathname.startsWith(`${path}/`)
      );
    },
    [location.pathname],
  );

  const hasActiveChild = useCallback(
    (categoryId) => {
      return ALCHAN_MENU_ITEMS.some(
        (item) => item.parentId === categoryId && isActive(item.path),
      );
    },
    [isActive],
  );

  const handleItemClick = useCallback(
    (item) => {
      if (item.path) {
        navigate(item.path);
        if (isMobile) onClose?.();
      }
    },
    [navigate, isMobile, onClose],
  );

  const handleLogout = useCallback(async () => {
    try {
      if (logout) {
        await logout();
        navigate("/login");
      }
    } catch (e) {
      navigate("/login");
    }
  }, [logout, navigate]);

  const isAdmin = userDoc?.isAdmin || userDoc?.isSuperAdmin;
  const isSuperAdmin = userDoc?.isSuperAdmin;

  // 대통령 직업 체크 (학생만)
  const [isPresident, setIsPresident] = useState(false);
  useEffect(() => {
    if (isAdmin || !userDoc?.selectedJobIds?.length || !userDoc?.classCode)
      return void setIsPresident(false);
    let cancelled = false;
    (async () => {
      try {
        const q = fbQuery(
          fbCollection(firebaseDb, "jobs"),
          fbWhere("classCode", "==", userDoc.classCode),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const found = snap.docs.some(
          (d) =>
            userDoc.selectedJobIds.includes(d.id) &&
            d.data().title === "대통령",
        );
        setIsPresident(found);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userDoc?.selectedJobIds, userDoc?.classCode]);

  // 정부 이송 법안 개수 (대통령 학생에게 사이드바 배지 + 세션 1회 알림)
  const [pendingGovLawCount, setPendingGovLawCount] = useState(0);
  useEffect(() => {
    if (!isPresident || !userDoc?.classCode) {
      setPendingGovLawCount(0);
      return;
    }
    const classCode = userDoc.classCode;
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const q = fbQuery(
          fbCollection(firebaseDb, "classes", classCode, "nationalAssemblyLaws"),
          fbWhere("status", "==", "pending_government_approval"),
        );
        const snap = await getCountFromServer(q);
        if (cancelled) return;
        const count = snap.data().count || 0;
        setPendingGovLawCount(count);

        // 세션 1회 알림: 대기 법안이 있고 이번 세션에서 아직 안 알렸을 때
        if (count > 0 && typeof window !== "undefined") {
          const key = `govLawAlertShown:${classCode}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            window.alert(
              `🏛️ 정부로 이송된 법안이 ${count}건 있습니다.\n` +
              `대통령실 > 법안 관리에서 승인 또는 거부권을 행사할 수 있습니다.`
            );
          }
        }
      } catch (err) {
        /* ignore */
      }
    };

    fetchCount();
    // 탭이 보일 때만 15분 간격으로 폴링 (비용 절감)
    let intervalId = null;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(fetchCount, 15 * 60 * 1000);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchCount();
        start();
      } else {
        stop();
      }
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [isPresident, userDoc?.classCode]);

  // 학생용 거래 알림 (세금/월세/월급/송금 등 — '내 자산'에서 확인 전까지 배지 + 세션 1회 요약)
  const [unreadTxCount, setUnreadTxCount] = useState(0);
  useEffect(() => {
    // 관리자는 제외. 학생만.
    if (isAdmin || !userDoc?.id || !userDoc?.classCode) {
      setUnreadTxCount(0);
      return;
    }
    const userId = userDoc.id;
    const classCode = userDoc.classCode;
    // 돈 이동을 나타내는 타입만 (조회·필터·페이지뷰 등 비재무성 로그 제외)
    const MONEY_TYPES = new Set([
      "월세 납부",
      "월세 수입",
      "세금 납부 (보유세)",
      "세금 납부 (주식)",
      "벌금 납부",
      "송금",
      "송금 수신",
      "현금 입금",
      "현금 출금",
      "구매",
      "판매",
      "salaryPayment",
    ]);
    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const lastKey = `lastAssetViewAt:${userId}`;
        const lastViewedMs = parseInt(
          (typeof window !== "undefined" && localStorage.getItem(lastKey)) || "0",
          10,
        );
        // 최초 접속자는 지금 기준으로 초기화 (과거 모든 로그가 '새 것'처럼 뜨는 걸 방지)
        if (!lastViewedMs) {
          if (typeof window !== "undefined") {
            localStorage.setItem(lastKey, String(Date.now()));
          }
          setUnreadTxCount(0);
          return;
        }

        const sinceTs = fbTimestamp.fromMillis(lastViewedMs);
        const q = fbQuery(
          fbCollection(firebaseDb, "activity_logs"),
          fbWhere("classCode", "==", classCode),
          fbWhere("userId", "==", userId),
          fbWhere("timestamp", ">", sinceTs),
          fbOrderBy("timestamp", "desc"),
          fbLimit(30),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const logs = snap.docs
          .map((d) => d.data())
          .filter((data) => MONEY_TYPES.has(data.type));
        setUnreadTxCount(logs.length);

        // 세션 1회 항목별 요약 알림
        if (logs.length > 0 && typeof window !== "undefined") {
          const alertKey = `txAlertShown:${userId}`;
          if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, "1");
            const lines = logs.slice(0, 8).map((data) => {
              const amt = typeof data.amount === "number" ? data.amount : null;
              const sign = amt == null ? "" : amt > 0 ? "+" : "";
              const amtText = amt == null ? "" : ` ${sign}${amt.toLocaleString()}원`;
              const typeLabel = data.type === "salaryPayment" ? "주급" : data.type;
              return `• [${typeLabel}]${amtText} — ${data.description || ""}`;
            });
            const more = logs.length > 8 ? `\n\n외 ${logs.length - 8}건` : "";
            window.alert(
              `💰 확인하지 않은 거래 내역 ${logs.length}건이 있어요.\n\n` +
                lines.join("\n") +
                more +
                `\n\n'알찬 나의 자산'에서 전체 내역을 확인할 수 있어요.`
            );
          }
        }
      } catch (err) {
        /* ignore — 인덱스 미생성 등 */
      }
    };

    fetchUnread();
    // 15분 폴링 + visibility-aware + 'assets:viewed' 커스텀 이벤트로 즉시 반영
    let intervalId = null;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(fetchUnread, 15 * 60 * 1000);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchUnread();
        start();
      } else {
        stop();
      }
    };
    const handleAssetsViewed = () => {
      setUnreadTxCount(0);
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("assets:viewed", handleAssetsViewed);
    }

    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("assets:viewed", handleAssetsViewed);
      }
    };
  }, [isAdmin, userDoc?.id, userDoc?.classCode]);

  // 학습 게시판 목록 로드 (사이드바에 동적 표시)
  useEffect(() => {
    const classCode = userDoc?.classCode;
    if (!classCode) return void setLearningBoards([]);
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(fbCollection(firebaseDb, "classes", classCode, "learningBoards"));
        if (cancelled) return;
        setLearningBoards(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(b => !b.isHidden)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        );
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [userDoc?.classCode]);

  const hasDelegatedTaskApproval =
    userDoc?.delegatedPermissions?.taskApproval === true || isPresident;
  const hasDelegatedMoneyTransfer =
    userDoc?.delegatedPermissions?.moneyTransfer === true;
  const hasDelegatedCouponTransfer =
    userDoc?.delegatedPermissions?.couponTransfer === true;
  const hasAnyDelegation =
    hasDelegatedTaskApproval || hasDelegatedMoneyTransfer || hasDelegatedCouponTransfer;

  let userRole = "학생";
  if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
  else if (userDoc?.isAdmin) userRole = "교사";

  const userName = userDoc?.name || userDoc?.nickname || "사용자";

  // 사이드바에서 활성 학습 게시판 ID 감지
  const activeLearningBoardId = useMemo(() => {
    if (location.pathname !== '/learning-board') return null;
    return new URLSearchParams(location.search).get('board');
  }, [location.pathname, location.search]);

  // 아이템 표시 여부 체크
  const shouldShowItem = useCallback(
    (item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.superAdminOnly && !isSuperAdmin) return false;
      // delegatedOnly 항목: 관리자가 아닌 학생 중 위임된 학생만 표시
      if (item.delegatedOnly) {
        if (isAdmin) return false; // 관리자는 관리자 카테고리에서 이미 보임
        if (item.delegatedOnly === "any") return hasAnyDelegation;
        if (item.delegatedOnly === "taskApproval") return hasDelegatedTaskApproval;
        if (item.delegatedOnly === "moneyTransfer") return hasDelegatedMoneyTransfer;
        if (item.delegatedOnly === "couponTransfer") return hasDelegatedCouponTransfer;
        return false;
      }
      return true;
    },
    [isAdmin, isSuperAdmin, hasAnyDelegation, hasDelegatedTaskApproval, hasDelegatedMoneyTransfer, hasDelegatedCouponTransfer],
  );

  // 카테고리별 메뉴 렌더링
  const renderMenuSection = (categoryKey) => {
    const items = ALCHAN_MENU_ITEMS.filter((item) => {
      if (item.category !== categoryKey) return false;
      return shouldShowItem(item);
    });

    if (items.length === 0) return null;

    return (
      <MenuSection key={categoryKey} title={CATEGORY_LABELS[categoryKey]}>
        {items.map((item) => {
          if (item.isCategory) {
            const childItems = ALCHAN_MENU_ITEMS.filter((child) => {
              if (child.parentId !== item.id) return false;
              return shouldShowItem(child);
            });

            if (childItems.length === 0) return null;

            return (
              <CategoryItem
                key={item.id}
                category={item}
                isExpanded={
                  expandedCategories[item.id] || hasActiveChild(item.id)
                }
                onToggle={() => toggleCategory(item.id)}
                hasActiveChild={hasActiveChild(item.id)}
              >
                {childItems.map((child) => {
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
                  // 학습 게시판: 동적 보드 목록으로 대체
                  if (child.id === 'learningBoard' && learningBoards.length > 0) {
                    return (
                      <React.Fragment key={child.id}>
                        {learningBoards.map(board => (
                          <SubMenuItem
                            key={`lb-${board.id}`}
                            icon={child.icon}
                            label={board.name}
                            active={activeLearningBoardId === board.id}
                            onClick={() => { navigate(`/learning-board?board=${board.id}`); if (isMobile) onClose?.(); }}
                          />
                        ))}
                      </React.Fragment>
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
                      badgeCount={
                        child.id === "organizationChart" && isPresident
                          ? pendingGovLawCount
                          : 0
                      }
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
                badgeCount={item.id === "myAssets" ? unreadTxCount : 0}
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
      <aside className="hidden md:flex flex-col w-20 h-screen sticky top-0 left-0 z-50 transition-all duration-300" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderRight: '1px solid rgba(199,210,254,0.5)', boxShadow: '0 8px 32px -8px rgba(79, 70, 229, 0.08)' }}>
        {/* 로고 */}
        <div className="h-16 min-h-16 flex items-center justify-center" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="p-1.5 rounded-lg" style={{ border: '1px solid var(--border-primary)' }}>
            <AppIcon style={{ width: "32px", height: "32px" }} />
          </div>
        </div>

        {/* 아이콘 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
          {ALCHAN_MENU_ITEMS.filter(
            (item) => !item.parentId && !item.isCategory,
          ).map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            if (item.superAdminOnly && !isSuperAdmin) return null;
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                title={item.label}
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center transition-all duration-200"
                style={active ? {
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                } : {
                  background: 'var(--bg-hover)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </nav>

        {/* 사용자 아바타 */}
        <div className="p-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
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
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out
          ${
            isMobile
              ? isOpen
                ? "translate-x-0 h-screen overflow-y-auto"
                : "-translate-x-full h-screen overflow-y-auto"
              : "sticky top-0 min-h-screen translate-x-0"
          }
          lg:sticky lg:top-0 lg:min-h-screen lg:translate-x-0 lg:w-72 flex flex-col shrink-0
        `}
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(238,242,255,0.75) 50%, rgba(245,243,255,0.75) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRight: '2px solid #a5b4fc',
          boxShadow: '4px 0 24px rgba(99, 102, 241, 0.12)',
        }}
      >
        {/* 로고 영역 */}
        <div className="h-[72px] min-h-[72px] mx-3 mt-3 mb-1 flex items-center relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', border: 'none', boxShadow: '0 4px 16px rgba(67, 56, 202, 0.35)' }}>
          <div className="flex items-center gap-3.5 px-4 w-full relative z-10">
            <div className="p-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.2)', boxShadow: 'none', border: 'none' }}>
              <AppIcon style={{ width: "36px", height: "36px" }} />
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[22px] font-black leading-tight font-jua" style={{ color: '#ffffff' }}>
                알찬
              </span>
              <span className="text-[11px] font-bold tracking-[0.2em] leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                ALCHAN
              </span>
            </div>
          </div>

          {isMobile && (
            <button
              onClick={onClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full border-0 cursor-pointer"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* 네비게이션 메뉴 - PC는 자연 높이(스크롤 없음), 모바일만 overflow (aside에 적용됨) */}
        <nav className="flex-1 py-3 px-4 space-y-1">
          {renderMenuSection("main")}
          {renderMenuSection("play")}
          {renderMenuSection("economy")}
          {renderMenuSection("society")}
          {renderMenuSection("community")}
          {renderMenuSection("delegation")}
          {renderMenuSection("admin")}
          {renderMenuSection("superadmin")}
        </nav>

        {/* 하단 사용자 프로필 */}
        <div className="p-4" style={{ borderTop: '2px solid #a5b4fc' }}>
          <div
            onClick={handleLogout}
            className="flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer group"
            style={{ background: 'linear-gradient(135deg, #e0e7ff, #ddd6fe)', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.12)', border: '1px solid #a5b4fc' }}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: '#1e293b' }}>
                {userName}
              </p>
              <p className="text-xs truncate" style={{ color: '#64748b' }}>{userRole}</p>
            </div>
            <LogOut className="w-4 h-4 group-hover:text-red-500 transition-colors" style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </aside>
    </>
  );
}
