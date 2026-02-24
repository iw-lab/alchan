// src/App.js
// 알찬(Alchan) - 학급 경제 시뮬레이션 앱

import React, { useEffect, Suspense, lazy, Component } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
// 🔥 [최적화] ItemProvider는 AlchanLayout으로 이동 (로그인 후에만 마운트)
import { ThemeProvider } from "./contexts/ThemeContext";
import { SkeletonPage } from "./components/ui/Skeleton";

// 🔥 React Query 전역 설정 - Firestore 읽기 비용 최소화
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 🔥 캐시 유지 시간: 30분 (Firestore 재요청 방지)
      staleTime: 30 * 60 * 1000,
      // 🔥 캐시 저장 시간: 2시간
      gcTime: 2 * 60 * 60 * 1000,
      // 🔥 창 포커스 시 자동 refetch 비활성화 (비용 절감)
      refetchOnWindowFocus: false,
      // 🔥 재연결 시 자동 refetch 비활성화
      refetchOnReconnect: false,
      // 🔥 마운트 시 자동 refetch 비활성화 (캐시 우선)
      refetchOnMount: false,
      // 🔥 실패 시 재시도 1회만
      retry: 1,
      // 🔥 네트워크 에러 시에만 재시도
      retryOnMount: false,
    },
  },
});

// 코드 스플리팅 - 레이아웃과 로그인 페이지
const AlchanLayout = lazy(() => import("./components/AlchanLayout"));
const Login = lazy(() => import("./pages/auth/Login"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const ConsentForm = lazy(() => import("./pages/legal/ConsentForm"));

// 기본 스타일 (Tailwind 이전에 로드하여 Tailwind가 우선권을 가지도록)
import "./styles.css";
import "./App.css";
import "./index.css"; // Tailwind CSS - 마지막에 import하여 우선 적용
import { logger } from "./utils/logger";

// 🔥 에러 바운더리 - PWA 흰화면 방지
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error("[알찬] 앱 오류 발생:", error, errorInfo);

    // IndexedDB나 캐시 관련 오류면 캐시 삭제 후 새로고침
    const errorString = error?.toString() || "";
    if (
      errorString.includes("IndexedDB") ||
      errorString.includes("QuotaExceeded") ||
      errorString.includes("SecurityError") ||
      errorString.includes("InvalidStateError")
    ) {
      logger.log("[알찬] 스토리지 오류 감지 - 캐시 초기화");
      this.clearCachesAndReload();
    }
  }

  clearCachesAndReload = async () => {
    try {
      // IndexedDB 삭제
      if (window.indexedDB) {
        const databases = (await window.indexedDB.databases?.()) || [];
        databases.forEach((db) => {
          if (db.name) {
            window.indexedDB.deleteDatabase(db.name);
          }
        });
      }

      // 캐시 삭제
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }

      // 로컬스토리지 삭제
      localStorage.clear();
      sessionStorage.clear();

      // 새로고침
      window.location.reload();
    } catch (e) {
      logger.error("[알찬] 캐시 삭제 실패:", e);
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0a0a12] to-[#1a1a2e] text-white p-5 text-center">
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-2xl mb-2">
            앱을 불러오는 중 문제가 발생했습니다
          </h1>
          <p className="mb-6 opacity-80">잠시 후 자동으로 다시 시도합니다...</p>
          <button
            onClick={this.clearCachesAndReload}
            className="px-6 py-3 bg-white text-indigo-600 border-0 rounded-xl text-base font-bold cursor-pointer"
          >
            지금 다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  // FCM 서비스 워커에 설정 전달
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          if (registration.active) {
            const firebaseConfig = {
              apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
              authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
              projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
              storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
              messagingSenderId:
                process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
              appId: process.env.REACT_APP_FIREBASE_APP_ID,
            };
            registration.active.postMessage({
              type: "FIREBASE_CONFIG",
              config: firebaseConfig,
            });
          }
        })
        .catch((err) => {
          logger.warn("[알찬] 서비스워커 준비 실패 (무시):", err);
        });
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <CurrencyProvider>
              {/* 🔥 [최적화] ItemProvider를 제거 - AlchanLayout 내부로 이동하여 로그인 후에만 마운트 */}
              <Router>
                <Suspense fallback={<SkeletonPage />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/consent-form" element={<ConsentForm />} />
                    <Route path="/*" element={<AlchanLayout />} />
                  </Routes>
                </Suspense>
              </Router>
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
