// src/pages/my-assets/MyAssets.js - Firestore 직접 조회 방식으로 수정된 최종 버전
import { fetchClassCouponValue } from "../../utils/classCoupon";
import { getCurrencyUnit, normalizeCurrencyText } from "../../utils/numberFormatter";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  functions,
  httpsCallable,
} from "../../firebase";
import { limit, orderBy } from "firebase/firestore";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { safeTimestampToDate, getCachedFirestoreData, setCachedFirestoreData } from "../../utils/firestoreHelpers";
import LoginWarning from "../../components/LoginWarning";
import TransferModal from "../../components/modals/TransferModal";
import { AlchanLoading } from "../../components/AlchanLayout";
import { DailyRewardBanner } from "../../components/DailyReward";

import { logger } from "../../utils/logger";
import { dropDuplicateActivityRows } from "../../utils/ledgerDedupe";
import { toast } from "../../utils/toast";
export default function MyAssets() {
  const {
    user,
    userDoc,
    users, // 전체 사용자 목록 (송금 대상 찾기 등에서 필요)
    classmates, // '나'를 제외한 학급 친구 목록 (송금, 선물 모달용)
    // 🔥 [추가] '나'를 포함한 학급 전체 구성원 목록 (기부 내역 모달용)
    loading: authLoading,
    optimisticUpdate,
  } = useAuth();

  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  // 🔥 [최적화 1] 상태 및 레퍼런스
  const [assetsLoading, setAssetsLoading] = useState(true);
  const loadingRef = useRef(false);  // 데이터 페치 시간 추적용
  const [parkingBalance, setParkingBalance] = useState(0);
  const [deposits, setDeposits] = useState([]); // 예금 상품 목록
  const [savings, setSavings] = useState([]); // 적금 상품 목록
  const [loans, setLoans] = useState([]);
  const [realEstateAssets, setRealEstateAssets] = useState([]);
  const [stockValue, setStockValue] = useState(0); // 보유 주식 평가액
  const [totalNetAssets, setTotalNetAssets] = useState(0);
  const [transactionHistory, setTransactionHistory] = useState([]);

  // 🔥 [최적화 4] 캐시 유효 시간 설정
  const CACHE_DURATION = 60 * 60 * 1000; // 1시간 (Firestore 읽기 최소화)
  const [couponValue, setCouponValue] = useState(1000);

  // '내 자산' 페이지 방문 = 사이드바 거래 알림 배지 해제 신호
  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(`lastAssetViewAt:${userId}`, String(Date.now()));
      window.dispatchEvent(new Event("assets:viewed"));
    } catch { /* ignore */ }
  }, [userId]);

  // 🔥 [버그 수정] Firestore에서 쿠폰 가치 설정 로드
  useEffect(() => {
    // 쿠폰 가치는 학급별(utils/classCoupon.js) — 전역 mainSettings 는 다른 반 교사가 정한 값이었다
    let alive = true;
    const loadCouponValueFromSettings = async () => {
      try {
        const v = await fetchClassCouponValue(db, currentUserClassCode);
        if (alive) setCouponValue(v);
      } catch (error) {
        logger.error("[MyAssets] 쿠폰 가치 설정 로드 실패:", error);
      }
    };

    if (userId && currentUserClassCode) {   // 학급이 정해지기 전엔 읽지 않는다(기본값이 먼저 떴다 바뀌는 깜빡임)
      loadCouponValueFromSettings();
    }
    return () => { alive = false; };
  }, [userId, currentUserClassCode]);


  const [searchParams, setSearchParams] = useSearchParams();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  // 🔒 송금 중복 제출 차단(클라 lock): 매 호출마다 새 idempotencyKey라 서버 멱등만으론
  //    "빠른 두 번 클릭 = 서로 다른 정당한 송금 2건"을 못 막는다 → UI에서 재진입 차단.
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const transferSubmittingRef = useRef(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false); // 거래 내역 펼치기/접기 상태

  // URL 파라미터로 송금 모달 자동 열기
  useEffect(() => {
    if (searchParams.get("transfer") === "true") {
      setShowTransferModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const loadMyAssetsData = useCallback(async (force = false) => {
    if (!userId || !db) {
      setAssetsLoading(false);
      return;
    }

    // 이미 로딩 중이면 중복 실행 방지
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    // 🔥 [최적화] 캐시 데이터가 있으면 즉시 표시 (로딩 스피너 없이)
    const cachedAssets = getCachedFirestoreData(
      "myAssets",
      userId,
      CACHE_DURATION,
    );
    if (cachedAssets) {
      setParkingBalance(cachedAssets.parkingBalance || 0);
      setDeposits(cachedAssets.deposits || []);
      setSavings(cachedAssets.savings || []);
      setLoans(cachedAssets.loans || []);
      setRealEstateAssets(cachedAssets.realEstateAssets || []);
      setStockValue(cachedAssets.stockValue || 0);
      setTransactionHistory(cachedAssets.transactionHistory || []);
      setAssetsLoading(false); // 캐시로 즉시 로딩 해제
    } else {
      setAssetsLoading(true);
    }

    // 🔥 [최적화] 강제 새로고침이 아니고, 최근(90초 이내) 조회한 캐시가 있으면
    // 9개 네트워크 쿼리를 생략 — 페이지 급속 재진입 시 중복 read 방지.
    // 거래 후 자산 목록은 원래 마운트/수동 새로고침에서만 갱신되며(헤더 현금은
    // AuthContext 실시간 리스너가 즉시 반영), 수동 새로고침 버튼은 force=true로 우회한다.
    // 🔥 [읽기최적화] 90초 → 5분. 1시간 표시 캐시가 즉시 그려지고(헤더 현금은
    //   AuthContext 실시간 리스너로 항상 최신), 자산(부동산·예적금·대출)은 자주 안 바뀌며
    //   수동 새로고침 버튼이 force=true로 우회하므로 재방문 9쿼리(150+ read)만 안전하게 절감.
    const ASSETS_REFETCH_THROTTLE = 5 * 60 * 1000; // 5분
    if (!force && getCachedFirestoreData("myAssets", userId, ASSETS_REFETCH_THROTTLE)) {
      loadingRef.current = false;
      return;
    }

    try {
      // 🔥 [최적화] 모든 쿼리를 하나의 Promise.all로 병렬 실행
      const realEstateRef1 = query(
        collection(db, "classes", currentUserClassCode, "realEstateProperties"),
        where("owner", "==", userId),
        limit(50),
      );
      // 🔻 [2026-08-03] 레거시 자산 소스 3개 제거 — 부동산 `ClassStock/{cc}/students/{uid}/realestates`,
      //    전역 `realEstate`, 파킹 `ClassStock/{cc}/students/{uid}/parkingAccounts`.
      //    프로덕션 전수 실측(전 학급 7개·학생 88명): 세 경로 모두 문서 0건. 항상 빈 결과를
      //    돌려주면서 "나의 자산"을 열 때마다 읽기만 나가고 있었다. 정식 소스는 각각
      //    `classes/{cc}/realEstateProperties`(owner==uid)와 `users/{uid}/financials/parkingAccount`
      //    이며, 순자산 원장(src/utils/netAssets.js)도 정식 소스만 읽는다(이중경로 해소).
      const parkingRef1 = doc(
        db,
        "users",
        userId,
        "financials",
        "parkingAccount",
      );
      const productsRef = query(
        collection(db, "users", userId, "products"),
        limit(50),
      );
      // 주식: 보유 포트폴리오 + 전역 시세 미러(Settings/centralStocksCache). 과거 MyAssets는
      // 주식을 아예 로드하지 않아 "총 순자산"에서 주식 평가액이 누락됐다.
      const portfolioRef = collection(db, "users", userId, "portfolio");
      const stockCacheRef = doc(db, "Settings", "centralStocksCache");
      // 🔻 [읽기 절감 2026-07-25] 세 소스에서 각 50건(=최대 150문서)을 읽어놓고
      //    아래에서 병합·정렬 후 `slice(0, 20)`으로 20건만 쓰고 있었다.
      //    세 소스 모두 timestamp 내림차순이므로, 자기 소스에서 21위 밖인 항목은
      //    전체 상위 20위에 들 수 없다 → 각 소스 20건만 읽어도 **결과가 완전히 동일**하다.
      //    (150 → 60문서. 화면의 '더 보기'도 최대 20건까지만 펼치므로 표시량 변화 없음)
      const TX_FETCH_LIMIT = 20;
      // 🔴 **activity_logs 만 더 읽는다** (2026-08-28).
      //    위 절감 논리("자기 소스 21위 밖은 전체 20위에 못 든다")는 **거르기 전** 기준이라
      //    맞는데, 이 소스는 읽고 **나서** `amount !== 0 || couponAmount !== 0` 으로 거른다.
      //    그런데 activity_logs 에는 돈이 안 움직인 기록(할일 승인 요청·아이템 사용·게임 등)이
      //    훨씬 많아서 — 표본 3,000건 중 절반이 그렇다 — 최근 20칸을 그것들이 채워 버리면
      //    **진짜 거래가 창 밖으로 밀려나 거래내역에서 사라진다.** 선생님이 신고한
      //    "최근 거래가 잘 입력이 안 된다"의 세 번째 경로가 이것이다.
      //    ⚠️ 쿼리에서 걸러내는 게 정석이지만 classCode+userId+timestamp 에 amount 조건을
      //       더하면 **새 복합 인덱스**가 필요하고, 이 저장소는 CI 가 인덱스를 배포하지 않는다.
      //       그래서 창을 넓히는 쪽을 택했다(+40문서/방문, 서울 단가로 무시할 수준).
      const ACTIVITY_FETCH_LIMIT = 60;
      const activityLogsRef = query(
        collection(db, "activity_logs"),
        where("classCode", "==", currentUserClassCode),
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(ACTIVITY_FETCH_LIMIT),
      );
      const transactionsRef = query(
        collection(db, "users", userId, "transactions"),
        orderBy("timestamp", "desc"),
        limit(TX_FETCH_LIMIT),
      );
      const rootTransactionsRef = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(TX_FETCH_LIMIT),
      );

      const [
        snap1,
        parkingSnap1,
        productsSnap,
        portfolioSnap,
        stockCacheSnap,
        activityLogsSnap,
        transactionsSnap,
        rootTransactionsSnap,
      ] = await Promise.all([
        getDocs(realEstateRef1),
        getDoc(parkingRef1),
        getDocs(productsRef),
        getDocs(portfolioRef).catch(() => ({ docs: [] })),
        getDoc(stockCacheRef).catch(() => null),
        getDocs(activityLogsRef).catch(() => ({ docs: [] })),
        getDocs(transactionsRef).catch(() => ({ docs: [] })),
        getDocs(rootTransactionsRef).catch(() => ({ docs: [] })),
      ]);

      // 부동산 처리 — 소스가 `classes/{cc}/realEstateProperties` 하나뿐이라 문서 id가
      // 이미 유일하다(과거의 3소스 id 중복제거는 그래서 제거했다 — 단일 컬렉션에서는 무의미).
      const allRealEstateAssets = snap1.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 주식 평가액 = Σ(보유수량 × 현재가), 상장 종목만(미러는 isListed==true만 담음)
      const stockList = stockCacheSnap && stockCacheSnap.exists()
        ? (stockCacheSnap.data().stocks || [])
        : [];
      let computedStockValue = 0;
      portfolioSnap.docs.forEach((d) => {
        const h = d.data();
        const qty = Number(h.quantity) || 0;
        if (qty <= 0) return;
        const sid = h.stockId != null ? h.stockId : d.id;
        const info = stockList.find((s) => String(s.id) === String(sid));
        if (info && info.isListed) {
          computedStockValue += (Number(info.price) || 0) * qty;
        }
      });

      // 파킹통장 처리 — 정식 소스 `users/{uid}/financials/parkingAccount` 하나.
      const totalParkingBalance = parkingSnap1.exists()
        ? parkingSnap1.data().balance || 0
        : 0;
      setParkingBalance(totalParkingBalance);

      // 상품(예금/적금/대출) 처리
      const depositsData = [];
      const savingsData = [];
      const loansData = [];
      productsSnap.forEach((docSnap) => {
        const product = {
          id: docSnap.id,
          ...docSnap.data(),
          maturityDate: docSnap.data().maturityDate?.toDate
            ? docSnap.data().maturityDate.toDate()
            : docSnap.data().maturityDate,
        };
        if (product.type === "deposit") depositsData.push(product);
        else if (product.type === "savings") savingsData.push(product);
        else if (product.type === "loan") loansData.push(product);
      });
      setDeposits(depositsData);
      setSavings(savingsData);
      setLoans(loansData);
      setRealEstateAssets(allRealEstateAssets);
      setStockValue(computedStockValue);

      // 거래 내역 처리
      const activityData = (activityLogsSnap.docs || [])
        .map((doc) => {
          const data = doc.data();
          const desc = data.description || data.type || "거래 내역";
          return {
            id: doc.id,
            amount: data.amount || 0,
            description: desc === "undefined" ? "거래 내역" : desc,
            timestamp: data.timestamp,
            type: data.type,
            weekKey: data.weekKey,
            couponAmount: data.couponAmount || 0,
            source: "activity_logs",
          };
        })
        .filter((tx) => tx.amount !== 0 || tx.couponAmount !== 0);

      const parseTransactionDocs = (docs) =>
        (docs || [])
          .map((doc) => {
            const data = doc.data();
            const desc = data.description || "거래 내역";
            return {
              id: doc.id,
              amount: data.amount || 0,
              description: !desc || desc === "undefined" ? "거래 내역" : desc,
              timestamp: data.timestamp || data.createdAt,
              type: data.type || "transaction",
              weekKey: data.weekKey,
              source: "transactions",
            };
          })
          .filter((tx) => tx.amount !== 0);

      const transactionsData = parseTransactionDocs(transactionsSnap.docs);
      const rootTransactionsData = parseTransactionDocs(rootTransactionsSnap.docs);

      // 중복 제거 (같은 ID의 문서)
      const seenIds = new Set(transactionsData.map((tx) => tx.id));
      const uniqueRootData = rootTransactionsData.filter((tx) => !seenIds.has(tx.id));

      // 🔥 activity_logs와 transactions 서브컬렉션 사이 cross-dedupe
      // payWeeklySalariesLogic 등 일부 함수가 두 컬렉션에 같은 거래를 각각 저장 →
      // UI에서 1건이 2건으로 보이는 버그 방지. type+weekKey 기준 매칭.
      const activityDedupeKey = new Set(
        activityData
          .filter((tx) => tx.weekKey && tx.type)
          .map((tx) => `${tx.type}_${tx.weekKey}`),
      );
      const dedupedTransactionsData = transactionsData.filter((tx) => {
        if (!tx.weekKey || !tx.type) return true;
        return !activityDedupeKey.has(`${tx.type}_${tx.weekKey}`);
      });
      const dedupedUniqueRootData = uniqueRootData.filter((tx) => {
        if (!tx.weekKey || !tx.type) return true;
        return !activityDedupeKey.has(`${tx.type}_${tx.weekKey}`);
      });

      // 🔴 **같은 돈 한 번이 두 줄로 보이던 문제** (2026-08-30 라이브 실측).
      //    위 weekKey 대조는 **주급만** 걸렀다 — 상점 구매·국고 되팔기·송금은 그대로 두 줄이었다.
      //    판정은 순수 함수로 뺐다(utils/ledgerDedupe.js). 근거·창 크기·1:1 인 이유는 그 파일에.
      const ledgerRows = [...dedupedTransactionsData, ...dedupedUniqueRootData];
      const activityWithoutDuplicates = dropDuplicateActivityRows(
        activityData,
        ledgerRows,
      );

      const allTransactions = [...activityWithoutDuplicates, ...ledgerRows];
      allTransactions.sort((a, b) => {
        const dateA = a.timestamp?.toDate
          ? a.timestamp.toDate()
          : new Date(a.timestamp?.seconds * 1000 || 0);
        const dateB = b.timestamp?.toDate
          ? b.timestamp.toDate()
          : new Date(b.timestamp?.seconds * 1000 || 0);
        return dateB - dateA;
      });
      const recentTransactions = allTransactions.slice(0, 20);
      setTransactionHistory(recentTransactions);

      // 🔥 [최적화] 결과를 localStorage에 캐시 (다음 로드시 즉시 표시)
      setCachedFirestoreData("myAssets", userId, {
        parkingBalance: totalParkingBalance,
        deposits: depositsData,
        savings: savingsData,
        loans: loansData,
        realEstateAssets: allRealEstateAssets,
        stockValue: computedStockValue,
        transactionHistory: recentTransactions.map((tx) => ({
          ...tx,
          timestamp: tx.timestamp?.toDate
            ? tx.timestamp.toDate().toISOString()
            : tx.timestamp?.seconds
              ? new Date(tx.timestamp.seconds * 1000).toISOString()
              : null,
        })),
      });
    } catch (fallbackError) {
      logger.error(
        "[MyAssets] 🚨 클라이언트 측 직접 조회 실패:",
        fallbackError,
      );
    } finally {
      setAssetsLoading(false);
      loadingRef.current = false;
    }
  }, [userId, currentUserClassCode, CACHE_DURATION]);

  // ⚡ loadMyAssetsData 를 deps 에 넣지 않는다 — 이 함수는 렌더마다 새 신원이라
  //    넣으면 로드 → 상태변경 → 재렌더 → 다시 로드로 Firestore 읽기가 폭주한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authLoading && user) {
      loadMyAssetsData();
    } else if (!authLoading && !user) {
      setAssetsLoading(false);
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      setStockValue(0);
      setTotalNetAssets(0);
      setCouponValue(1000);
      setTransactionHistory([]);
    } else if (authLoading) {
      setAssetsLoading(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]); // loadMyAssetsData 제거하여 무한 루프 방지

  useEffect(() => {
    const cashValue = Number(userDoc?.cash) || 0;
    const couponMonetaryValue =
      (Number(userDoc?.coupons) || 0) * Number(couponValue);
    const realEstateValue = realEstateAssets.reduce(
      (sum, asset) => sum + (Number(asset.price) || Number(asset.value) || 0),
      0,
    );
    // 예금 총액 (balance 기준)
    const depositsTotal = deposits.reduce(
      (sum, deposit) => sum + (Number(deposit.balance) || 0),
      0,
    );
    // 적금 총액 (balance 기준)
    const savingsTotal = savings.reduce(
      (sum, saving) => sum + (Number(saving.balance) || 0),
      0,
    );
    // 대출 총액 (balance 기준 - remainingPrincipal이 없으면 balance 사용)
    const loanTotal = loans.reduce(
      (sum, loan) =>
        sum + (Number(loan.remainingPrincipal) || Number(loan.balance) || 0),
      0,
    );
    const calculatedTotalAssets =
      cashValue +
      couponMonetaryValue +
      Number(parkingBalance) +
      depositsTotal +
      savingsTotal +
      Number(stockValue) +
      realEstateValue -
      loanTotal;

    setTotalNetAssets(calculatedTotalAssets);
  }, [
    userDoc?.cash,
    userDoc?.coupons,
    couponValue,
    parkingBalance,
    deposits,
    savings,
    stockValue,
    realEstateAssets,
    loans,
  ]);


  const handleTransferMoney = async () => {
    // 🔒 재진입 차단(클라 lock) — 빠른 더블클릭/재시도로 인한 이중 송금 방지
    if (transferSubmittingRef.current) return;
    transferSubmittingRef.current = true;
    setTransferSubmitting(true);
    setAssetsLoading(true);
    try {
      if (!userDoc || !userId || !functions || !users) {
        toast.error("필수 정보가 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      const amount = parseInt(transferAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        toast.error("올바른 송금액을 입력해주세요.");
        return;
      }

      if ((Number(userDoc.cash) || 0) < amount) {
        toast.error("보유 현금이 부족합니다.");
        return;
      }

      const recipientUser = users.find((u) => u.id === transferRecipient);
      if (!recipientUser) {
        toast.error(
          "송금 대상을 찾을 수 없습니다. 목록을 새로고침하고 다시 시도해주세요.",
        );
        return;
      }

      if (recipientUser.id === userId) {
        toast.error("자기 자신에게는 송금할 수 없습니다.");
        return;
      }

      // 🔒 서버(CF)에서 원자적 송금 처리: senderId=auth.uid 강제, 양방향 increment,
      //    잔액검증·같은학급·멱등·lastIncomingTransferAt·활동로그 모두 서버가 담당.
      //    (구 클라 2단계 write는 money glitch·부분실패 증발 위험 → 제거)
      const transferFn = httpsCallable(functions, "transferCash");
      const result = await transferFn({
        recipientId: recipientUser.id,
        amount,
        message: "",
        idempotencyKey: crypto.randomUUID(),
      });

      if (result?.data?.success) {
        // 잔액은 Firestore 리스너가 갱신 (수동 cash write 금지 — CF increment 덮어쓰기 방지)
        toast.success("송금이 완료되었습니다.");
        setShowTransferModal(false);
        setTransferRecipient("");
        setTransferAmount("");
      } else {
        toast.error("송금에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } catch (error) {
      logger.error("!!! 송금 처리 중 오류 발생 !!!", error);
      // Firebase Functions 클라 SDK는 code를 `functions/<code>` 형태로 준다.
      if (error?.code === "functions/already-exists") {
        toast.error("이미 처리된 송금입니다.");
      } else {
        toast.error(`송금 중 오류가 발생했습니다: ${error?.message || "알 수 없는 오류"}`);
      }
    } finally {
      setAssetsLoading(false);
      setTransferSubmitting(false);
      transferSubmittingRef.current = false;
    }
  };

  const handleForceRefresh = () => {
    // 캐시 삭제 (setCachedFirestoreData가 쓰는 실제 키 = firestore_cache_myAssets_{userId})
    localStorage.removeItem(`firestore_cache_myAssets_${userId}`);
    // 과거 잘못된 키도 함께 정리 (하위호환)
    localStorage.removeItem(`firestore_cache_myAssets_${userId}_${userId}`);

    logger.log("[MyAssets] 🔄 캐시 삭제 및 강제 새로고침");

    // 데이터 다시 로드 (force=true로 재요청 throttle 우회)
    loadMyAssetsData(true);
  };

  const renderTitle = () => (
    <div className="flex justify-between items-center mb-5">
      <h2 className="text-2xl font-bold gradient-text border-b-2 border-indigo-200 pb-2.5 m-0">
        나의 자산 현황 💳
      </h2>
      <button
        onClick={handleForceRefresh}
        disabled={assetsLoading}
        className={`btn-glass px-4 py-2 text-sm ${
          assetsLoading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        🔄 새로고침
      </button>
    </div>
  );

  const renderAssetSummary = () => {
    const displayCash = Number(userDoc?.cash) || 0;
    const displayCoupons = Number(userDoc?.coupons) || 0;

    // 거래 내역 표시 개수 결정
    const displayedTransactions = showAllTransactions
      ? transactionHistory
      : transactionHistory.slice(0, 5);

    return (
      <div className="p-0 bg-transparent mb-6">
        {/* 보유 현금 - 메인 강조 카드 (glass) */}
        <div className="glass-card-strong rounded-3xl p-[30px] mb-5">
          <div className="mb-2.5">
            <span className="text-lg font-bold gradient-text">💰 보유 현금</span>
          </div>
          <div
            className="text-[40px] font-extrabold tracking-tight mb-4 text-right"
            style={{ color: displayCash < 0 ? "#dc2626" : "#0f172a" }}
          >
            {formatKoreanCurrency(displayCash)}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setShowTransferModal(true)}
              className="btn-gradient px-7 py-3.5 text-base"
              disabled={assetsLoading || authLoading}
            >
              💸 송금하기
            </button>
          </div>
        </div>

        {/* 총 순자산 + 파킹통장 + 보유 쿠폰 — 가장 중요한 요약이라 거래 내역보다 위에 둔다
            (기존엔 내역 아래라 스크롤해야 보였다. 2026-07-25 리뷰 C7) */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {/* 총 순자산 */}
          <div className="glass-card rounded-2xl p-4 border-l-4" style={{ borderLeftColor: "#ec4899" }}>
            <div className="mb-1">
              <span className="text-sm font-semibold text-pink-600">📊 총 순자산</span>
            </div>
            <div
              className="text-xl md:text-2xl font-extrabold tracking-tight text-right"
              style={{ color: Number(totalNetAssets) < 0 ? "#dc2626" : "#0f172a" }}
            >
              {formatKoreanCurrency(Number(totalNetAssets))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500 leading-tight">
              현금+쿠폰+파킹+예적금+부동산-대출
            </p>
          </div>

          {/* 파킹통장 */}
          <div className="glass-card rounded-2xl p-4 border-l-4" style={{ borderLeftColor: "#06b6d4" }}>
            <div className="mb-1">
              <span className="text-sm font-semibold text-cyan-600">🅿️ 파킹통장</span>
            </div>
            <div className="text-xl md:text-2xl font-extrabold tracking-tight text-right text-slate-900">
              {formatKoreanCurrency(Number(parkingBalance))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500 text-right">
              입출금 및 상품 가입
            </p>
          </div>

          {/* 보유 쿠폰 */}
          <div className="glass-card rounded-2xl p-4 border-l-4" style={{ borderLeftColor: "#f59e0b" }}>
            <div className="mb-1">
              <span className="text-sm font-semibold text-amber-600">🎟️ 보유 쿠폰</span>
            </div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-right text-slate-900">
              {displayCoupons.toLocaleString()}
              <span className="text-base font-semibold text-slate-600"> 개</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500 text-right">
              1쿠폰 = {Number(couponValue).toLocaleString()}{getCurrencyUnit()}
            </p>
          </div>
        </div>

        {/* 최근 입출금 내역 */}
        <div className="mb-5">
          <h4 className="text-[15px] text-slate-700 font-bold mb-3">
            💳 최근 입출금 내역
          </h4>
          {transactionHistory.length > 0 ? (
            <div>
              <div className="flex flex-col gap-2">
                {displayedTransactions.map((tx) => {
                  let displayDate = "날짜 없음";
                  try {
                    const validDate = safeTimestampToDate(tx.timestamp);
                    displayDate = validDate.toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    });
                  } catch {
                    displayDate = "오늘";
                  }

                  const txAmount = Number(tx.amount) || 0;
                  const rawDesc = tx.description;
                  // 서버가 만든 문구엔 "원"이 하드코딩돼 있고 과거 기록은 서버를 고쳐도 안 바뀐다
                  // → 표시 시점에 현재 화폐 단위로 치환(2026-07-25).
                  const txDescription =
                    !rawDesc || rawDesc === "undefined" || rawDesc === "null"
                      ? "거래 내역"
                      : normalizeCurrencyText(String(rawDesc));

                  return (
                    <div
                      key={tx.id || Math.random()}
                      className={`flex justify-between items-center text-sm px-4 py-3.5 rounded-xl ${
                        txAmount > 0
                          ? "bg-emerald-50 border border-emerald-200"
                          : "bg-rose-50 border border-rose-200"
                      }`}
                    >
                      <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis mr-2.5 font-medium text-slate-700">
                        {displayDate} • {txDescription}
                      </span>
                      <span
                        className={`font-bold text-[15px] min-w-[110px] text-right ${
                          txAmount > 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {txAmount > 0 ? "+" : ""}
                        {formatKoreanCurrency(txAmount)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {transactionHistory.length > 5 && (
                <button
                  onClick={() => setShowAllTransactions(!showAllTransactions)}
                  className="w-full mt-3 p-3 bg-slate-100 text-slate-600 border border-slate-200 rounded-[10px] text-sm font-semibold cursor-pointer transition-all duration-200 hover:bg-slate-200"
                >
                  {showAllTransactions
                    ? "▲ 접기"
                    : `▼ ${transactionHistory.length - 5}개 더 보기`}
                </button>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-gray-500 text-center p-5 bg-slate-50 rounded-[10px] border border-dashed border-slate-200">
              최근 거래 내역이 없습니다.
            </div>
          )}
        </div>

      </div>
    );
  };

  if (authLoading || assetsLoading) {
    return <AlchanLoading />;
  }
  if (!user) {
    return <LoginWarning />;
  }
  if (!userDoc && !authLoading) {
    return (
      <div className="flex justify-center items-center h-[80vh] text-[1.2em] text-red-500">
        사용자 데이터를 불러오는 중입니다. 잠시 후에도 이 메시지가 보이면 앱을
        새로고침하거나 재로그인해주세요.
      </div>
    );
  }
  if (!currentUserClassCode && !authLoading) {
    return (
      <div className="flex justify-center items-center h-[80vh] text-[1.2em] text-red-500">
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
      </div>
    );
  }

  return (
    <div className="w-full min-h-full">
      <div className="w-full px-4 md:px-6 lg:px-8 py-6">
        {renderTitle()}

        {/* 일일 출석 보상 배너 */}
        <DailyRewardBanner
          userId={userId}
          onClaim={(reward) => {
            // 💰 실제 cash 지급·streak 갱신·audit 로그는 claimDailyReward CF가 한 트랜잭션으로 처리함.
            //    여기서는 화면 즉시 반영(델타)만 — 중복 지급 방지를 위해 클라는 cash를 쓰지 않는다.
            //    optimisticUpdate는 델타(증감분)만 받음(절대값 전달 시 두 배 가산 버그).
            if (optimisticUpdate) {
              optimisticUpdate({ cash: reward });
            }
            logger.log(`Daily reward claimed (server): ${reward}`);
          }}
        />

        {renderAssetSummary()}
        {showTransferModal && (
          <TransferModal
            showTransferModal={showTransferModal}
            setShowTransferModal={setShowTransferModal}
            recipients={classmates}
            transferRecipient={transferRecipient}
            setTransferRecipient={setTransferRecipient}
            transferAmount={transferAmount}
            setTransferAmount={setTransferAmount}
            handleTransfer={handleTransferMoney}
            userId={userId}
            userCash={Number(userDoc?.cash) || 0}
            isSubmitting={transferSubmitting}
          />
        )}
      </div>
    </div>
  );
}
