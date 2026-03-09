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

    const fetchCurrency = async () => {
      try {
        const settingsRef = doc(db, "settings", "mainSettings");
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const data = snap.data();
          const unit = data.currencyUnit || DEFAULT_CURRENCY_UNIT;
          setCurrencyUnit(unit);
          localStorage.setItem("alchan_currencyUnit", unit);
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
