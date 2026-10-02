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
  useRef,
} from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { setGlobalCurrencyUnit } from "../utils/numberFormatter";
import { logger } from "../utils/logger";
// 캐시 키 = classCurrency_{classCode}(TTL 12시간). 쓰는 곳(AdminSettingsModal 화폐 단위 저장)이 같은 키를 지운다 —
//   안 지우면 방금 바꾼 단위가 최대 12시간 옛 값으로 되돌아간다(2026-08-12 교차검증에서 잡힌 회귀와 같은 모양).
import globalCacheService from "../services/globalCacheService";
import {
  DEFAULT_CURRENCY_UNIT,
  classCurrencyPath,
  classCurrencyCacheKey,
  CURRENCY_LS_KEY,
  validClassCode,
} from "../utils/classCurrency";

// 🔴 화폐 단위는 «학급별»이다(utils/classCurrency.js 참고). 전역 settings/mainSettings 의 currencyUnit 은
//    마지막으로 저장한 교사의 반 값일 뿐이라 읽지 않는다 — 학급 설정이 없으면 기본값.

const readLS = () => {
  try { return JSON.parse(localStorage.getItem(CURRENCY_LS_KEY) || "null"); } catch { return null; }
};
const writeLS = (classCode, unit) => {
  try { localStorage.setItem(CURRENCY_LS_KEY, JSON.stringify({ classCode, unit })); } catch { /* 저장 불가 기기 */ }
};

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

// 학급 설정 문서가 아직 없을 때의 캐시는 짧게 — 길게 두면 교사가 처음 단위를 정해도 학생 화면이 12시간 기본값에 묶인다.
const TTL_SET = 12 * 60 * 60 * 1000, TTL_MISSING = 10 * 60 * 1000;

export const CurrencyProvider = ({ children }) => {
  const { firebaseReady, user, userDoc } = useAuth();
  const classCode = user ? validClassCode(userDoc?.classCode) : null;
  const [currencyUnit, setCurrencyUnit] = useState(() => {
    // 초기값: 이 기기 캐시가 «지금 학급» 것일 때만 쓴다(다른 반 값이 첫 화면에 새지 않게). 아니면 기본값.
    const ls = readLS();
    const initial = (classCode && ls?.classCode === classCode && ls.unit) || DEFAULT_CURRENCY_UNIT;
    setGlobalCurrencyUnit(initial);
    return initial;
  });
  // 저장 세대 — 저장이 끝나면 올린다. 그보다 먼저 떠난 조회 응답은 상태·캐시에 반영하지 않는다.
  const genRef = useRef(0);
  const classRef = useRef(classCode);
  classRef.current = classCode;

  // currencyUnit이 변경될 때마다 전역 변수 동기화
  useEffect(() => {
    setGlobalCurrencyUnit(currencyUnit);
  }, [currencyUnit]);

  // 로그인·학급 확정 시 1회 학급 문서를 읽는다. 학급이 없으면(로그아웃·미지정) 기본값으로 되돌린다.
  useEffect(() => {
    if (!classCode) { setCurrencyUnit(DEFAULT_CURRENCY_UNIT); return; }
    if (!firebaseReady || !db) return;
    let alive = true;
    const gen = genRef.current;
    const ls = readLS();
    setCurrencyUnit(ls?.classCode === classCode && ls.unit ? ls.unit : DEFAULT_CURRENCY_UNIT);

    const applyUnit = (data) => {
      if (!alive || genRef.current !== gen) return;
      const unit = data?.currencyUnit || DEFAULT_CURRENCY_UNIT;
      setCurrencyUnit(unit);
      writeLS(classCode, unit);
    };

    const fetchCurrency = async () => {
      const key = classCurrencyCacheKey(classCode);
      const cached = globalCacheService.get(key);
      if (cached) { applyUnit(cached); return; }
      try {
        const snap = await getDoc(doc(db, ...classCurrencyPath(classCode)));
        if (!alive || genRef.current !== gen) return;   // 그사이 저장됐다 — 옛 응답으로 캐시를 채우지 않는다
        const data = snap.exists() ? snap.data() : {};
        globalCacheService.set(key, data, data.currencyUnit ? TTL_SET : TTL_MISSING);
        applyUnit(data);
      } catch (error) {
        // 에러 시 현재 값 유지(이 학급 것이거나 기본값)
        logger.warn("[CurrencyContext] 화폐 단위 로드 실패 (무시):", error.code);
      }
    };

    fetchCurrency();
    return () => { alive = false; };
  }, [firebaseReady, user, classCode]);

  // 저장 완료 후 화면 갱신(Firestore 저장은 AdminSettingsModal). forClass 가 지금 학급이 아니면 무시한다.
  const setCurrencyUnitLocal = useCallback((unit, forClass) => {
    const cc = classRef.current;
    if (!cc || (forClass && forClass !== cc)) return;
    genRef.current += 1;
    globalCacheService.set(classCurrencyCacheKey(cc), { currencyUnit: unit }, TTL_SET);
    setCurrencyUnit(unit);
    writeLS(cc, unit);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currencyUnit, setCurrencyUnitLocal }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyContext;
