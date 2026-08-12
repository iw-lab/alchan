/**
 * 학생의 금융 상품(`users/{uid}/products`)을 **한 번만** 읽어 세 자동처리 훅에 나눠 준다.
 *
 * 종전엔 useAutoLoanRepay·useAutoSavingsDeposit·useAutoDepositMature 가 같은 서브컬렉션을
 * 각자 조회했다. 세 쿼리는 `type` 조건만 달랐고, 그중 `savings` 는 두 쿼리에 겹쳐 **같은 문서를
 * 두 번** 읽었다. 게다가 Firestore 는 **결과가 0건인 쿼리에도 읽기 1건을 과금**하므로,
 * 상품이 하나도 없는 학생(아마 대다수)도 세션당 3읽기를 쓰고 있었다.
 *
 * 두 번째 문제는 빈도였다. 세 훅 모두 `visibilitychange` 마다 재조회했는데,
 * 원래 주석이 밝힌 목적은 "**다음 날** 진입 케이스 커버"다. 만기·납입은 날짜가 바뀔 때만
 * 달라지므로, **날짜가 실제로 바뀐 경우에만** 다시 읽으면 목적을 그대로 지키면서
 * 탭 전환마다의 조회가 전부 사라진다. 교실에서 탭 전환은 하루 수십 번 일어난다.
 *
 * 결과: 마운트당 3 → 1, 탭 포커스당 3 → 0(날짜가 바뀐 첫 포커스만 1).
 *
 * ⚠️ 필터를 걸지 않고 전량 읽는다. 이 서브컬렉션에는 loan·savings·deposit 세 종류만
 *    들어간다(functions/index.js 의 상품 생성부). netAssets.js 도 같은 이유로 전량 읽고
 *    메모리에서 분류한다 — 같은 규약을 따른다. 새 복합 인덱스가 필요 없다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
// 데이터 계층(src/firebase)을 경유한다 — 화면·훅이 firebase/firestore 를 직접 부르면
// 나중에 읽기 방식을 바꿀 때 고칠 파일이 그만큼 늘어난다(scripts/debt-ratchet.mjs 의 지표).
import { db, collection, getDocs } from "../firebase";
import { logger } from "../utils/logger";
// 만기·납입 판정은 전부 KST 자정 경계를 쓴다. 순수 유틸로 빼 두어 테스트에서 직접 부른다.
import { kstDateString } from "../utils/kstDate";

/**
 * 마지막으로 상품을 읽은 KST 날짜. key = uid.
 * **모듈 레벨**이라 컴포넌트가 재마운트돼도 살아남는다.
 * 이게 억제하는 건 `visibilitychange` 재조회뿐이다 — 마운트 시에는 날짜와 무관하게 항상 읽는다
 * (새로 들어온 사람에게 낡은 목록을 보여주지 않기 위해서다).
 */
const lastFetchedDate = new Map();

export function useStudentProducts(userDoc) {
  const [products, setProducts] = useState(null); // null = 아직 안 읽음
  // 진행 중인 조회가 **누구 것인지** 기억한다. boolean 하나로는 계정이 바뀌는 순간을 못 가른다.
  const inFlightForRef = useRef(null);

  const userId = userDoc?.uid;
  const isStaff = !!(
    userDoc?.isAdmin ||
    userDoc?.isSuperAdmin ||
    userDoc?.isTeacher
  );

  const load = useCallback(
    async (reason) => {
      if (!db || !userId || isStaff) return;
      // 같은 사용자에 대한 중복 조회만 막는다.
      // ⚠️ 예전엔 `inFlightRef`(boolean) 하나였다. A 조회 중에 B 로 전환하면 B 의 조회가
      //    통째로 생략되고, 뒤늦게 도착한 A 의 응답이 B 화면에 A 의 상품을 앉혔다.
      //    그러면 자동처리 훅들이 남의 productId 로 CF 를 부른다(서버가 소유권을 막지만
      //    애초에 부르지 않는 게 맞다). 그래서 "누구의 조회인가"를 들고 다닌다.
      if (inFlightForRef.current === userId) return;
      inFlightForRef.current = userId;
      try {
        const snap = await getDocs(
          collection(db, "users", userId, "products"),
        );
        // 응답이 도착했을 때 이미 다른 사용자로 바뀌었으면 버린다.
        if (inFlightForRef.current !== userId) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lastFetchedDate.set(userId, kstDateString());
        setProducts(list);
        logger.log(
          `[상품] ${list.length}건 로드 (${reason}) — 자동 상환/납입/만기 훅이 공유`,
        );
      } catch (err) {
        // 실패해도 마지막 조회 날짜를 찍지 않는다 → 다음 트리거에서 다시 시도한다.
        logger.error("[상품] 로드 실패:", err);
      } finally {
        if (inFlightForRef.current === userId) inFlightForRef.current = null;
      }
    },
    [userId, isStaff],
  );

  useEffect(() => {
    // ⚠️ 계정이 바뀌면 **먼저 비운다.** 안 비우면 새 로드가 끝나기 전까지 이전 사용자의
    //    상품 목록이 남아, 소비 훅들이 남의 productId 로 CF(repayLoan 등)를 부른다.
    //    서버가 소유권을 검증해 실제 피해로 이어지진 않지만, 애초에 부르지 않는 게 맞다.
    setProducts(null);

    if (!userId || isStaff) return;

    load("마운트");

    // 날짜가 바뀐 뒤 첫 복귀에서만 다시 읽는다. 그게 이 리스너의 원래 목적이다.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (lastFetchedDate.get(userId) === kstDateString()) return;
      load("날짜 변경");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, isStaff, load]);

  return products;
}

export default useStudentProducts;
