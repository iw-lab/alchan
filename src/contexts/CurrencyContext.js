// src/contexts/CurrencyContext.js
// 화폐 단위를 전역적으로 제공하는 컨텍스트
// 관리자가 설정한 화폐 단위 (기본값: "알찬")를 앱 전체에서 사용

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
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

  // mainSettings에서 currencyUnit 로드
  useEffect(() => {
    // user가 있어야 isSignedIn() 규칙을 통과함
    if (!firebaseReady || !db || !user) return;

    // Firestore에서 실시간 구독 (가벼운 문서이므로 비용 부담 적음)
    const settingsRef = doc(db, "settings", "mainSettings");
    const unsubscribe = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const unit = data.currencyUnit || DEFAULT_CURRENCY_UNIT;
          setCurrencyUnit(unit);
          localStorage.setItem("alchan_currencyUnit", unit);
        }
      },
      (error) => {
        // 에러 시 기본값 유지 (로그인 안 된 상태 등)
        logger.warn("[CurrencyContext] 설정 로드 실패 (무시):", error.code);
      },
    );

    return () => unsubscribe();
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
