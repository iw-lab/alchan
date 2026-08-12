// src/contexts/CurrencyContext.js
// 화폐 단위를 전역적으로 제공하는 컨텍스트
// 관리자가 설정한 화폐 단위 (기본값: "알찬")를 앱 전체에서 사용
// 🔥 [최적화] onSnapshot → getDoc 1회 읽기로 변경 (화폐 단위는 거의 변경 안됨)

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { setGlobalCurrencyUnit } from "../utils/numberFormatter";
import { logger } from "../utils/logger";
// Dashboard 와 같은 캐시를 공유한다(키 "mainSettings", TTL 12시간).
// ⚠️ 이 문서를 쓰는 경로가 **둘**이고 둘 다 무효화해야 한다:
//    ① Dashboard 의 couponValue 저장 → 이미 dataCache.invalidate("mainSettings") 호출
//    ② AdminSettingsModal 의 handleSaveCurrencyUnit → 2026-08-12 에 추가했다.
//       처음엔 ①만 보고 "배선 불필요"라고 적었는데, currencyUnit 을 실제로 쓰는 건 ②였다.
//       그대로 뒀으면 교사가 화폐 단위를 바꿔도 최대 12시간 뒤 옛 값으로 되돌아갔다.
import globalCacheService from "../services/globalCacheService";

const DEFAULT_CURRENCY_UNIT = "알찬";

const CurrencyContext = createContext({
  currencyUnit: DEFAULT_CURRENCY_UNIT,
  setCurrencyUnitLocal: () => {},
});

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    return {
      currencyUnit: DEFAULT_CURRENCY_UNIT,
      setCurrencyUnitLocal: () => {},
    };
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  const [currencyUnit, setCurrencyUnit] = useState(() => {
    // 초기값: localStorage 캐시 -> 기본값
    const cached = localStorage.getItem("alchan_currencyUnit");
    const initial = cached || DEFAULT_CURRENCY_UNIT;
    setGlobalCurrencyUnit(initial);
    return initial;
  });
  const { firebaseReady, user } = useAuth();

  // currencyUnit이 변경될 때마다 전역 변수 동기화
  useEffect(() => {
    setGlobalCurrencyUnit(currencyUnit);
  }, [currencyUnit]);

  // 🔥 [최적화] onSnapshot → getDoc 1회 읽기
  // localStorage 캐시로 즉시 표시 + 로그인 시 1회 서버 확인으로 최신값 반영
  useEffect(() => {
    if (!firebaseReady || !db || !user) return;

    const applyUnit = (data) => {
      const unit = data?.currencyUnit || DEFAULT_CURRENCY_UNIT;
      setCurrencyUnit(unit);
      localStorage.setItem("alchan_currencyUnit", unit);
    };

    const fetchCurrency = async () => {
      // Dashboard 도 같은 문서를 `mainSettings` 키로 캐싱한다(globalCacheService).
      // 종전엔 서로를 몰라 그날 첫 세션에 settings/mainSettings 를 두 번 읽었다.
      // 같은 키를 공유해 먼저 읽는 쪽이 채우고 나중 쪽이 재사용한다.
      const cached = globalCacheService.get("mainSettings");
      if (cached) {
        applyUnit(cached);
        return;
      }
      try {
        const settingsRef = doc(db, "settings", "mainSettings");
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const data = snap.data();
          globalCacheService.set("mainSettings", data, 12 * 60 * 60 * 1000);
          applyUnit(data);
        }
      } catch (error) {
        // 에러 시 localStorage 캐시 유지 (이미 초기값으로 설정됨)
        logger.warn("[CurrencyContext] 설정 로드 실패 (무시):", error.code);
      }
    };

    fetchCurrency();
  }, [firebaseReady, user]);

  // 로컬 상태만 업데이트 (낙관적 업데이트용, Firestore 저장은 별도)
  const setCurrencyUnitLocal = useCallback((unit) => {
    setCurrencyUnit(unit);
    localStorage.setItem("alchan_currencyUnit", unit);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currencyUnit, setCurrencyUnitLocal }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyContext;
