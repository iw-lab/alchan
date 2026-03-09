// src/hooks/useActiveEconomicEvent.js
// 경제 이벤트 데이터를 단일 onSnapshot으로 공유하는 훅
// EconomicEventBanner + EconomicEventPopup이 같은 문서를 2번 구독하던 것을 1번으로 통합

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

const EconomicEventContext = createContext(null);

export function EconomicEventProvider({ children }) {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;
  const [activeEvent, setActiveEvent] = useState(null);
  const prevClassCodeRef = useRef(null);

  useEffect(() => {
    if (!classCode) {
      setActiveEvent(null);
      return;
    }

    // classCode가 바뀌면 초기화
    if (prevClassCodeRef.current !== classCode) {
      prevClassCodeRef.current = classCode;
      setActiveEvent(null);
    }

    const ref = doc(db, "activeEconomicEvent", classCode);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setActiveEvent(null);
        return;
      }

      const data = snap.data();
      // 만료 확인
      const now = new Date();
      const expires = data.expiresAt?.toDate?.();
      if (expires && expires < now) {
        setActiveEvent(null);
        return;
      }

      setActiveEvent(data);
    }, () => {
      // 에러 시 무시
      setActiveEvent(null);
    });

    return () => unsubscribe();
  }, [classCode]);

  return (
    <EconomicEventContext.Provider value={activeEvent}>
      {children}
    </EconomicEventContext.Provider>
  );
}

export function useActiveEconomicEvent() {
  return useContext(EconomicEventContext);
}
