// src/contexts/MenuLocksContext.js
// 학급이 학생에게 잠근 메뉴 목록을 **한 번만 읽어** 사이드바와 라우트 가드가 공유한다.
//
// 전에는 사이드바가 혼자 읽었고, 그래서 잠금이 **표시에만** 적용됐다 —
// 주소를 아는 학생이 /stock-trading 을 직접 치면 그대로 들어갔다.
// 가드를 붙이려면 두 곳이 같은 값을 봐야 하므로 여기로 올렸다(읽기는 그대로 1회).
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import { fetchMenuLockedItemIds } from "../firebase/db/settings";

const MenuLocksContext = createContext({ lockedItemIds: [], ready: false });

export const useMenuLocks = () => useContext(MenuLocksContext);

export const MenuLocksProvider = ({ children }) => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;
  const [lockedItemIds, setLockedItemIds] = useState([]);
  // ⚠️ `ready` 가 있어야 한다. 잠금을 읽기 **전에** 가드가 판정하면 정상 페이지가
  //    깜빡이며 쫓겨난다. 가드는 ready 가 true 가 될 때까지 통과시킨다.
  const [ready, setReady] = useState(false);

  // ⚠️ `isCancelled` 를 인자로 받는 이유: 취소 확인은 **setState 직전**에 해야 한다.
  //    처음엔 `await load()` 가 끝난 **뒤에** cancelled 를 봤는데, 그때는 이미 상태를
  //    다 세팅한 다음이라 그 검사가 아무것도 막지 못하는 죽은 코드였다
  //    (사이드바에 있던 원래 코드는 fetch 안쪽에서 검사해 실제로 유효했다 — 리팩터로 잃었던 것).
  const load = useCallback(
    async (isCancelled = () => false) => {
      if (!classCode) {
        if (isCancelled()) return;
        setLockedItemIds([]);
        setReady(true);
        return;
      }
      const ids = await fetchMenuLockedItemIds(classCode);
      if (isCancelled()) return;
      setLockedItemIds(ids);
      setReady(true);
    },
    [classCode],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    setReady(false);
    (async () => {
      await load(isCancelled);
    })();
    // 교사가 관리자설정에서 저장하면 즉시 반영(타 기기는 다음 로드 때).
    const handler = () => load();
    window.addEventListener("menuLocks:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("menuLocks:changed", handler);
    };
  }, [load]);

  const value = useMemo(
    () => ({ lockedItemIds, ready }),
    [lockedItemIds, ready],
  );

  return (
    <MenuLocksContext.Provider value={value}>
      {children}
    </MenuLocksContext.Provider>
  );
};

export default MenuLocksContext;
