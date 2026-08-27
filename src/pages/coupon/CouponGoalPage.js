// src/pages/coupon/CouponGoalPage.js - 쿠폰 목표 전용 페이지
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
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
  writeBatch,
  serverTimestamp,
  runTransaction,
} from "../../firebase";
import CouponGoal from "../../components/CouponGoal";
import LoginWarning from "../../components/LoginWarning";
import { clearLocalStoragePreserving } from "../../utils/storageReset";
import DonateCouponModal from "../../components/modals/DonateCouponModal";
import SellCouponModal from "../../components/modals/SellCouponModal";
import GiftCouponModal from "../../components/modals/GiftCouponModal";
import DonationHistoryModal from "../../components/modals/DonationHistoryModal";
import { AlchanLoading } from "../../components/AlchanLayout";
import {
  safeTimestampToDate,
  getCachedFirestoreData,
  setCachedFirestoreData,
} from "../../utils/firestoreHelpers";

import {
  openPickOn,
  openPickOnForPrize,
  listenForPickOnResult,
  buildEntriesFromDonations,
  PICKON_DEFAULT_TAX,
} from "../../utils/pickOn";
import { formatMoney } from "../../utils/numberFormatter";
import { logger } from "../../utils/logger";
import { Target, Wrench, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { promptDialog } from "../../utils/promptDialog";
export default function CouponGoalPage() {
  const {
    user,
    userDoc,
    users,
    classmates,
    allClassMembers,
    loading: authLoading,
    optimisticUpdate,
    isAdmin: isAdminFn,
    isSuperAdmin: isSuperAdminFn,
  } = useAuth();

  const canManageGoal =
    !!(
      userDoc?.isAdmin ||
      userDoc?.isSuperAdmin ||
      userDoc?.isTeacher ||
      isAdminFn?.() ||
      isSuperAdminFn?.()
    );

  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  const [assetsLoading, setAssetsLoading] = useState(true);
  const loadingRef = useRef(false);
  const loadGoalDataRef = useRef(null); // 🔥 loadGoalData 함수를 저장할 ref
  const actionLockRef = useRef(false); // 🔒 쿠폰 판매/선물 이중제출(더블클릭) 방지 — CF 멱등키 부재 시 클라 1차 방어
  const [goalDonations, setGoalDonations] = useState([]);

  const donateCouponFunction = useMemo(
    () => httpsCallable(functions, "donateCoupon"),
    [],
  );
  const sellCouponFunction = useMemo(
    () => httpsCallable(functions, "sellCoupon"),
    [],
  );
  const giftCouponFunction = useMemo(
    () => httpsCallable(functions, "giftCoupon"),
    [],
  );

  const CACHE_DURATION = 5 * 60 * 1000;

  const currentGoalId = currentUserClassCode
    ? `${currentUserClassCode}_goal`
    : null;

  const [classCouponGoal, setClassCouponGoal] = useState(1000);
  const [couponValue, setCouponValue] = useState(1000);

  // 🔥 [버그 수정] Firestore에서 쿠폰 가치 설정 로드
  useEffect(() => {
    const loadCouponValueFromSettings = async () => {
      try {
        const settingsRef = doc(db, "settings", "mainSettings");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          if (settingsData.couponValue) {
            setCouponValue(Number(settingsData.couponValue));
          }
        }
      } catch (error) {
        logger.error("[CouponGoalPage] 쿠폰 가치 설정 로드 실패:", error);
      }
    };

    if (userId) {
      loadCouponValueFromSettings();
    }
  }, [userId]);
  const [goalProgress, setGoalProgress] = useState(0);
  const [myContribution, setMyContribution] = useState(0);
  const [goalAchieved, setGoalAchieved] = useState(false);
  const [isResettingGoal, setIsResettingGoal] = useState(false);

  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showSellCouponModal, setShowSellCouponModal] = useState(false);
  const [sellAmount, setSellAmount] = useState("");
  const [showGiftCouponModal, setShowGiftCouponModal] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [showDonationHistoryModal, setShowDonationHistoryModal] =
    useState(false);

  // 🔥 [최적화] 데이터 처리 헬퍼 함수 (캐시/Firestore 공용)
  const processGoalData = useCallback(
    (goalData) => {
      setClassCouponGoal(Number(goalData.targetAmount) || 1000);
      setGoalProgress(Number(goalData.progress) || 0);

      // 응모 내역 처리 - timestamp 일관성 유지
      const donations = Array.isArray(goalData.donations)
        ? goalData.donations.map((donation) => {
            let processedTimestamp;
            if (donation.timestamp && donation.timestamp.toDate) {
              processedTimestamp = donation.timestamp.toDate().toISOString();
            } else if (donation.timestamp && donation.timestamp.seconds) {
              processedTimestamp = new Date(
                donation.timestamp.seconds * 1000,
              ).toISOString();
            } else if (donation.timestampISO) {
              processedTimestamp = donation.timestampISO;
            } else if (typeof donation.timestamp === "string") {
              processedTimestamp = donation.timestamp;
            } else {
              processedTimestamp = new Date().toISOString();
            }

            return {
              ...donation,
              amount: Number(donation.amount) || 0,
              timestamp: processedTimestamp,
              userId: donation.userId || "",
              userName: donation.userName || "알 수 없는 사용자",
              message: donation.message || "",
              classCode: donation.classCode || currentUserClassCode,
            };
          })
        : [];

      setGoalDonations(donations);

      // 내 기여도 계산
      const myDonations = donations.filter((d) => d.userId === userId);
      const myTotal = myDonations.reduce((sum, d) => sum + d.amount, 0);
      setMyContribution(myTotal);
    },
    [currentUserClassCode, userId],
  );

  // 🔥 loadGoalData 함수 - useCallback 제거하고 일반 함수로 변경
  const loadGoalData = async (forceRefresh = false) => {
    if (!userId || !currentUserClassCode || !currentGoalId) {
      setAssetsLoading(false);
      return;
    }

    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setAssetsLoading(true);

    try {
      // 🔥 [최적화] 캐시 우선 로드 - Firestore 읽기 절감
      const cacheKey = `goal_${currentGoalId}`;
      if (!forceRefresh) {
        const cachedData = getCachedFirestoreData(
          cacheKey,
          userId,
          CACHE_DURATION,
        );
        if (cachedData) {
          processGoalData(cachedData);
          setAssetsLoading(false);
          loadingRef.current = false;
          return;
        }
      }

      // 🔥 Firestore에서 최신 데이터 가져오기
      const goalDocRef = doc(db, "goals", currentGoalId);
      const goalDocSnap = await getDoc(goalDocRef);

      if (goalDocSnap.exists()) {
        const goalData = goalDocSnap.data();

        // 🔥 [최적화] 공용 헬퍼 함수로 처리
        processGoalData(goalData);

        // 🔥 캐시에 저장
        const cacheKey = `goal_${currentGoalId}`;
        setCachedFirestoreData(cacheKey, userId, goalData);
      } else {
        logger.warn("[CouponGoalPage] 목표 문서가 존재하지 않습니다");
      }
    } catch (error) {
      logger.error("[CouponGoalPage] 목표 데이터 로드 실패:", error);
    } finally {
      setAssetsLoading(false);
      loadingRef.current = false;
    }
  };

  // 🔥 ref에 loadGoalData 함수 저장
  loadGoalDataRef.current = loadGoalData;

  // 🔥 초기 로드 useEffect - loadGoalDataRef 사용
  useEffect(() => {
    if (!authLoading && user && currentUserClassCode && currentGoalId) {
      if (loadGoalDataRef.current) {
        loadGoalDataRef.current();
      }
    } else if (!authLoading && !user) {
      setAssetsLoading(false);
    } else if (authLoading) {
      setAssetsLoading(true);
    }
  }, [authLoading, user, currentUserClassCode, currentGoalId]);

  // 🔥 [제거] userDoc.myContribution 사용 중단 - donations 배열에서 직접 계산
  // useEffect(() => {
  //   if (userDoc) {
  //     setMyContribution(userDoc.myContribution || 0);
  //   }
  // }, [userDoc]);

  useEffect(() => {
    setGoalAchieved(goalProgress >= classCouponGoal && classCouponGoal > 0);
  }, [goalProgress, classCouponGoal]);

  const handleDonateCoupon = async (amount, memo) => {
    if (!userId || !currentUserClassCode || !userDoc) {
      toast.error("사용자 또는 학급 정보가 없어 응모할 수 없습니다.");
      return false;
    }

    const donationAmount = parseInt(amount, 10);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      toast.error("유효한 쿠폰 수량을 입력해주세요.");
      return false;
    }

    // 🔥 쿠폰 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ coupons: -donationAmount });
    }
    setMyContribution((prev) => prev + donationAmount);
    setGoalProgress((prev) => prev + donationAmount);

    // 🔥 로딩 상태 표시
    setAssetsLoading(true);

    try {
      // Call the server function in the background
      const result = await donateCouponFunction({
        amount: donationAmount,
        message: memo,
        // 🔒 batch7-b(codex MEDIUM #6): 멱등키로 중복클릭/재시도 이중 기부 차단.
        idempotencyKey:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `donate_${userId}_${Date.now()}`,
      });

      // 🔥 캐시 무효화
      const cacheKey = `goal_${currentGoalId}`;
      localStorage.removeItem(`firestore_cache_${cacheKey}_${userId}`);
      localStorage.removeItem(
        `goalDonationHistory_${currentUserClassCode}_goal`,
      );

      // 🔥 즉시 최신 데이터 로드
      loadingRef.current = false;
      if (loadGoalDataRef.current) {
        await loadGoalDataRef.current();
      }

      toast.success(`${donationAmount} 쿠폰 응모 완료!`);
      setShowDonateModal(false);

      return true;
    } catch (error) {
      logger.error("[CouponGoalPage] 응모 오류 (상세):", {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack,
      });
      toast.error(`응모 오류: ${error.message}`);

      // 실패 시 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: donationAmount });
      }

      return false;
    } finally {
      setAssetsLoading(false);
    }
  };

  const forceRefreshGoalData = async () => {
    if (!currentGoalId || !currentUserClassCode) {
      toast.error("학급 정보가 없습니다.");
      return;
    }

    setAssetsLoading(true);

    try {
      localStorage.removeItem(
        `firestore_cache_goal_${currentGoalId}_${userId}`,
      );

      const goalDocRef = doc(db, "goals", currentGoalId);
      const goalDocSnap = await getDoc(goalDocRef);

      if (goalDocSnap.exists()) {
        const latestGoalData = goalDocSnap.data();

        setClassCouponGoal(Number(latestGoalData.targetAmount) || 1000);
        setGoalProgress(Number(latestGoalData.progress) || 0);

        const freshDonations = Array.isArray(latestGoalData.donations)
          ? latestGoalData.donations.map((donation) => {
              let processedTimestamp;
              if (donation.timestamp && donation.timestamp.toDate) {
                processedTimestamp = donation.timestamp.toDate().toISOString();
              } else if (donation.timestamp && donation.timestamp.seconds) {
                processedTimestamp = new Date(
                  donation.timestamp.seconds * 1000,
                ).toISOString();
              } else if (donation.timestampISO) {
                processedTimestamp = donation.timestampISO;
              } else if (typeof donation.timestamp === "string") {
                processedTimestamp = donation.timestamp;
              } else {
                processedTimestamp = new Date().toISOString();
              }

              return {
                ...donation,
                amount: Number(donation.amount) || 0,
                timestamp: processedTimestamp,
                userId: donation.userId || "",
                userName: donation.userName || "알 수 없는 사용자",
                message: donation.message || "",
                classCode: donation.classCode || currentUserClassCode,
              };
            })
          : [];

        setGoalDonations(freshDonations);
        setCachedFirestoreData(`goal_${currentGoalId}`, userId, latestGoalData);

        toast.success(
          `목표 데이터 새로고침 완료!\n목표 진행률: ${latestGoalData.progress || 0}/${latestGoalData.targetAmount || 1000}\n응모 내역: ${freshDonations.length}개`,
        );
      } else {
        toast.error("목표 문서를 찾을 수 없습니다. 관리자에게 문의해주세요.");
      }
    } catch (error) {
      toast.error(`데이터 새로고침 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setAssetsLoading(false);
    }
  };

  const showDebugInfo = () => {
    const debugInfo = {
      userId,
      currentUserClassCode,
      currentGoalId,
      goalProgress,
      classCouponGoal,
      myContribution,
      donationsCount: goalDonations.length,
      donations: goalDonations,
      userCoupons: userDoc?.coupons,
      userCash: userDoc?.cash,
    };

    logger.log("[CouponGoalPage Debug]", debugInfo);
    toast.success(
      `디버그 정보가 콘솔에 출력되었습니다.\n응모 내역: ${goalDonations.length}개\n목표 진행률: ${goalProgress}/${classCouponGoal}`,
    );
  };

  const resetCouponGoal = async () => {
    if (!canManageGoal) {
      toast.error("교사/관리자만 초기화 가능합니다.");
      return;
    }
    if (!currentUserClassCode || !currentGoalId) {
      toast.error("학급 코드나 목표 정보가 없어 초기화할 수 없습니다.");
      return;
    }
    if (
      !(await confirmDialog(
        `정말로 ${currentUserClassCode} 학급의 쿠폰 목표와 기여 기록을 초기화하시겠습니까?`, { danger: true, confirmText: "초기화하기" }))
    ) {
      return;
    }

    setIsResettingGoal(true);
    try {
      // 🎯 서버(CF)에서 권한 검증 + admin SDK로 일괄 리셋.
      //    클라 writeBatch는 firestore.rules의 isAdmin()을 요구해 isTeacher-only
      //    교사 계정에서 권한 오류로 막혔으므로 CF 호출로 통일.
      const resetFn = httpsCallable(functions, "resetCouponGoal");
      await resetFn({});

      localStorage.removeItem(
        `goalDonationHistory_${currentUserClassCode}_goal`,
      );
      localStorage.removeItem(
        `firestore_cache_goal_${currentGoalId}_${userId}`,
      );

      setMyContribution(0);
      setGoalProgress(0);
      setGoalDonations([]);

      toast.success(
        `학급(${currentUserClassCode})의 쿠폰 목표와 기여 기록이 초기화되었습니다.`,
      );
    } catch (error) {
      toast.error(`목표 초기화 오류: ${error.message}`);
    } finally {
      setIsResettingGoal(false);
    }
  };

  const [isSettingNewGoal, setIsSettingNewGoal] = useState(false);

  // 🎰 목표 달성 후 추첨 — 응모한 쿠폰 장수가 그대로 당첨 확률이 된다.
  // 추첨 자체는 외부 정적 페이지(뽑기ON)가 하고, 여기서는 명단만 넘긴다.
  // 쿠폰은 건드리지 않는다. 다만 상금을 정하면 추첨 뒤에 현금이 오간다(아래 참고).
  // 🎰 랜덤뽑기 — 1등 상금을 정하면 추첨이 끝나는 즉시 국고에서 자동 지급된다.
  //
  // 돈은 기존 서버 함수(transferCash)를 그대로 쓴다. 새 돈 경로를 만들지 않는 이유는,
  // 그 함수가 이미 ① 같은 학급인지 ② 국고 잔액이 되는지 ③ 같은 추첨으로 두 번
  // 나가지 않는지(멱등)를 서버에서 검사하고, 양쪽 거래내역까지 원자적으로 남기기 때문이다.
  // 보내는 사람이 교사 본인이므로 상금은 교사의 국고에서 실제로 빠져나간다(발행이 아니다).
  const prizeWatchRef = useRef(null);
  useEffect(() => () => prizeWatchRef.current?.(), []); // 화면을 떠나면 대기 해제

  const handleRandomDraw = async () => {
    // 앞선 추첨의 결과를 아직 기다리는 중이면, 그걸 버리는 일임을 먼저 알린다.
    // (안 알리면 앞 추첨의 당첨자가 조용히 사라지고 상금도 안 나간다.)
    if (prizeWatchRef.current) {
      const go = await confirmDialog(
        "아직 앞선 추첨의 결과를 기다리는 중입니다.\n\n" +
          "새로 시작하면 앞 추첨의 당첨자는 무시되고 상금도 지급되지 않습니다.\n" +
          "앞 추첨 창에서 결과가 나오는 것을 먼저 확인해 주세요.",
        { confirmText: "그래도 새로 추첨", danger: true },
      );
      if (!go) return;
      prizeWatchRef.current();
      prizeWatchRef.current = null;
    }
    const entries = buildEntriesFromDonations(goalDonations);
    if (!entries.length) {
      toast.error("응모 내역이 없어 추첨할 수 없습니다.");
      return;
    }
    const tickets = entries.reduce((s, e) => s + e.weight, 0);

    // 1) 상금 정하기 — 비워 두면 지급 없이 추첨만 한다
    let remembered = "";
    try {
      remembered = localStorage.getItem("pickon.prize") || "";
    } catch { /* 시크릿 모드 등 저장소가 막힌 환경 — 기억 없이 진행한다 */ }
    const raw = await promptDialog(
      "1등 상금을 얼마로 할까요?\n\n" +
        "· 추첨이 끝나면 1등에게 자동으로 지급됩니다.\n" +
        "· 선생님의 국고에서 빠져나갑니다.\n" +
        "· 지급을 원하지 않으면 비워 두고 확인을 누르세요.",
      remembered,
      { confirmText: "다음", inputMode: "numeric", placeholder: "예: 50000" },
    );
    if (raw === null) return; // 취소
    // ⚠️ 숫자 아닌 글자를 지워서 통과시키면 안 된다 — "1.5"가 15가 되고 "1e9"가 19가 된다.
    //    쉼표·공백·단위만 걷어내고, 그래도 숫자가 아니면 되묻는다.
    const cleaned = String(raw).trim().replace(/[,\s]/g, "").replace(/[가-힣]+$/, "");
    if (cleaned && !/^\d+$/.test(cleaned)) {
      toast.error("상금은 숫자만 입력해 주세요.");
      return;
    }
    const prize = cleaned ? Number(cleaned) : 0;
    if (!Number.isSafeInteger(prize) || prize < 0 || prize > 10000000000) {
      toast.error("상금이 올바르지 않습니다.");
      return;
    }
    try {
      localStorage.setItem("pickon.prize", prize ? String(prize) : "");
    } catch { /* 저장 못 해도 이번 추첨은 계속한다 */ }

    // 2) 세율 — 알찬의 다른 지급과 마찬가지로 상금에도 세금을 매긴다.
    //    기본 33%. 뗀 세금은 국고에 그대로 남는다(국고에서 세후 금액만 나간다).
    let taxRate = PICKON_DEFAULT_TAX;
    if (prize) {
      let rememberedTax = "";
      try {
        rememberedTax = localStorage.getItem("pickon.tax") ?? "";
      } catch { /* 저장소가 막힌 환경 */ }
      const rawTax = await promptDialog(
        "상금에 매길 세율(%)을 정해 주세요.\n\n" +
          "· 0을 넣으면 세금 없이 전액 지급합니다.\n" +
          "· 뗀 세금은 선생님의 국고에 그대로 남습니다.",
        rememberedTax === "" ? String(PICKON_DEFAULT_TAX) : rememberedTax,
        { confirmText: "다음", inputMode: "numeric", placeholder: "예: 33" },
      );
      if (rawTax === null) return;
      const t = String(rawTax).trim().replace(/[%\s]/g, "");
      if (t && !/^\d+(\.\d+)?$/.test(t)) {
        toast.error("세율은 0~100 사이 숫자로 입력해 주세요.");
        return;
      }
      taxRate = t === "" ? 0 : Number(t);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        toast.error("세율은 0~100 사이여야 합니다.");
        return;
      }
      try {
        localStorage.setItem("pickon.tax", String(taxRate));
      } catch { /* 저장 못 해도 계속 */ }
    }
    // 세금은 버림, 실지급은 남는 금액. 상금이 있으면 최소 1은 나가게 한다.
    const tax = Math.floor((prize * taxRate) / 100);
    const net = prize ? Math.max(1, prize - tax) : 0;

    // 2) 마지막 확인 — 돈이 나가는 것을 여기서 한 번만 확실히 알린다
    const money = prize
      ? `\n\n💰 상금 ${formatMoney(prize)}` +
        (tax > 0 ? ` · 세금 ${taxRate}% ${formatMoney(tax)}` : " · 세금 없음") +
        `\n   → 1등에게 실제 지급 ${formatMoney(net)} (선생님의 국고에서 나갑니다)` +
        `\n\n🔁 추첨 화면에서 '다시 추첨'을 누르면 판마다 또 지급됩니다.`
      : "\n\n(상금 지급 없이 추첨만 합니다.)";
    const ok = await confirmDialog(
      `응모자 ${entries.length}명 · 응모권 ${tickets}장으로 추첨을 시작합니다.\n\n` +
        `새 탭에서 추첨 화면이 열립니다. 명단은 주소의 # 뒤에 담겨 전달되며, ` +
        `추첨 사이트의 서버에는 저장되지 않습니다.` +
        money,
      { confirmText: prize ? "추첨하고 상금 주기" : "추첨 시작" },
    );
    if (!ok) return;

    // 3) 상금이 없으면 예전처럼 그냥 연다(결과를 돌려받을 이유가 없다)
    if (!prize) {
      const r = openPickOn(entries, {
        title: "쿠폰 목표 달성 추첨",
        mode: "race",
        winnerRule: "last",
        winnerCount: 1,
      });
      if (!r.ok) {
        toast.error(
          r.reason === "blocked"
            ? "팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요."
            : "응모 내역이 없어 추첨할 수 없습니다.",
        );
      }
      return;
    }

    // 4) 결과를 돌려받는 방식으로 연다
    const r = openPickOnForPrize(entries, {
      title: "쿠폰 목표 달성 추첨",
      mode: "race",
      winnerRule: "last",
      winnerCount: 1,
    });
    if (!r.ok) {
      toast.error("팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.");
      return;
    }

    const nameToUserId = new Map(entries.map((e) => [e.name, e.userId]));
    prizeWatchRef.current?.();
    prizeWatchRef.current = listenForPickOnResult({
      rid: r.rid,
      entries,
      nameToUserId,
      onWinner: async ({ userId: winnerId, name, mismatch, round }) => {
        // 판마다 지급한다 — 리스너는 살려 둔다(교사가 '다시 추첨'을 누를 수 있다).
        // 같은 판이 두 번 오는 것은 listenForPickOnResult 가 이미 막는다.
        if (mismatch) {
          toast.error(
            `1등이 ${name}으로 왔는데 명단의 자리와 맞지 않아 지급하지 않았습니다. ` +
              `추첨 화면에서 명단을 바꾸셨다면 다시 추첨해 주세요.`,
          );
          return;
        }
        if (!winnerId) {
          toast.error(
            `1등은 ${name}인데 학생을 찾지 못해 지급하지 못했습니다. ` +
              `직접 송금해 주세요.`,
          );
          return;
        }
        if (winnerId === userId) {
          toast.error("1등이 선생님 본인이라 지급하지 않았습니다.");
          return;
        }
        // 같은 추첨은 같은 멱등키를 쓴다 — 서버가 두 번 나가는 것을 막으므로
        // 재시도해도 안전하다(실패했을 때만 다시 부른다).
        const key = `pickon_${userId}_${round || r.rid}`;
        const pay = () =>
          httpsCallable(functions, "transferCash")({
            recipientId: winnerId,
            amount: net,
            message:
              tax > 0
                ? `🎰 뽑기ON 1등 상금 ${formatMoney(prize)} (세금 ${taxRate}% 공제)`
                : "🎰 뽑기ON 1등 상금",
            idempotencyKey: key,
          });
        try {
          await pay();
          toast.success(
            `🎉 ${name}님에게 상금 ${formatMoney(net)}을 지급했습니다.` +
              (tax > 0 ? ` (세금 ${taxRate}% ${formatMoney(tax)} 공제)` : ""),
          );
        } catch (e) {
          logger.error("뽑기ON 상금 지급 실패", e);
          // 추첨 창은 이미 닫혔을 수 있다 — 여기 말고는 '누구에게 얼마를' 이 남는 곳이 없다.
          const retry = await confirmDialog(
            `${name}님에게 상금 ${formatMoney(net)}을 지급하지 못했습니다.\n\n` +
              `사유: ${e?.message || "알 수 없는 오류"}\n\n` +
              `다시 시도할까요? (이미 지급됐다면 두 번 나가지 않습니다)`,
            { confirmText: "다시 시도" },
          );
          if (retry) {
            try {
              await pay();
              toast.success(
                `🎉 ${name}님에게 상금 ${formatMoney(net)}을 지급했습니다.` +
              (tax > 0 ? ` (세금 ${taxRate}% ${formatMoney(tax)} 공제)` : ""),
              );
              return;
            } catch (e2) {
              logger.error("뽑기ON 상금 재지급 실패", e2);
            }
          }
          toast.error(
            `${name}님에게 상금 ${formatMoney(net)}이 지급되지 않았습니다. ` +
              `송금 화면에서 직접 보내 주세요.`,
          );
        }
      },
    });
    toast.success("추첨이 끝나면 1등에게 상금이 자동으로 지급됩니다.");
  };

  const setNewGoal = async () => {
    if (!canManageGoal) {
      toast.error("교사/관리자만 새 목표를 설정할 수 있습니다.");
      return;
    }
    if (!currentUserClassCode || !currentGoalId) {
      toast.error("학급 코드나 목표 정보가 없어 설정할 수 없습니다.");
      return;
    }
    const input = await promptDialog(
      "새 쿠폰 목표 수량을 입력하세요 (기존 기여·진행률은 0으로 초기화됩니다)",
      String(Math.max(classCouponGoal * 2, 100)),
      { inputMode: "numeric", confirmText: "목표 설정", danger: true },
    );
    if (input === null) return;
    const newTarget = parseInt(input, 10);
    if (!Number.isFinite(newTarget) || newTarget <= 0) {
      toast.error("1 이상의 숫자를 입력해주세요.");
      return;
    }
    if (
      !(await confirmDialog(
        `새 목표를 ${newTarget.toLocaleString()}쿠폰으로 설정하고 기존 진행률/기여 기록을 초기화합니다. 진행할까요?`, { danger: true, confirmText: "초기화하기" }))
    ) {
      return;
    }

    setIsSettingNewGoal(true);
    try {
      const batch = writeBatch(db);
      const goalRef = doc(db, "goals", currentGoalId);

      const usersQuery = query(
        collection(db, "users"),
        where("classCode", "==", currentUserClassCode),
      );
      const usersSnapshot = await getDocs(usersQuery);
      usersSnapshot.forEach((userDocument) => {
        const userRef = doc(db, "users", userDocument.id);
        batch.update(userRef, {
          myContribution: 0,
          updatedAt: serverTimestamp(),
        });
      });

      batch.update(goalRef, {
        targetAmount: newTarget,
        progress: 0,
        donations: [],
        donationCount: 0,
        updatedAt: serverTimestamp(),
        resetAt: serverTimestamp(),
        resetBy: userId,
      });

      await batch.commit();

      localStorage.removeItem(
        `goalDonationHistory_${currentUserClassCode}_goal`,
      );
      localStorage.removeItem(
        `firestore_cache_goal_${currentGoalId}_${userId}`,
      );

      setClassCouponGoal(newTarget);
      setMyContribution(0);
      setGoalProgress(0);
      setGoalDonations([]);
      setGoalAchieved(false);

      toast.success(`새 목표(${newTarget.toLocaleString()}쿠폰)가 설정되었습니다.`);
    } catch (error) {
      toast.error(`새 목표 설정 오류: ${error.message}`);
    } finally {
      setIsSettingNewGoal(false);
    }
  };

  const handleSellCoupon = async () => {
    if (actionLockRef.current) return; // 🔒 이중제출 방지
    const amount = parseInt(sellAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error("유효한 수량을 입력해주세요.");
      return;
    }

    actionLockRef.current = true;
    // 🔒 lock 획득 직후 곧바로 try 진입 — 사이에서 throw 시 finally 미도달로 ref 영구잠금 방지
    try {
      // 🔥 낙관적 업데이트 (try 안에서 — 예외 시에도 finally가 lock 해제)
      if (optimisticUpdate) {
        optimisticUpdate({
          coupons: -amount,
          cash: amount * couponValue,
        });
      }
      setAssetsLoading(true);
      await sellCouponFunction({ amount, idempotencyKey: crypto.randomUUID() });
      toast.success(`${amount}개 쿠폰을 판매했습니다.`);
      setShowSellCouponModal(false);
      setSellAmount("");

      // 🔥 ref를 통해 데이터 다시 로드
      setTimeout(() => {
        loadingRef.current = false;
        if (loadGoalDataRef.current) {
          loadGoalDataRef.current();
        }
      }, 500);
    } catch (error) {
      toast.error(`판매 오류: ${error.message}`);
      // 🔄 CF 실패 시 낙관적 업데이트 롤백(전역 userDoc 잔액 desync 방지)
      if (optimisticUpdate) {
        optimisticUpdate({
          coupons: amount,
          cash: -amount * couponValue,
        });
      }
    } finally {
      setAssetsLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleGiftCoupon = async () => {
    if (actionLockRef.current) return; // 🔒 이중제출(더블클릭 이중선물) 방지
    logger.log("handleGiftCoupon called"); // 함수 호출 확인 로그
    const recipientUser = users.find((u) => u.id === giftRecipient);
    const amount = parseInt(giftAmount, 10);

    if (!recipientUser) {
      toast.error("받는 사람을 선택해주세요.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error("올바른 수량을 입력해주세요.");
      return;
    }

    // ⚠️ confirm 취소 시 낙관적 차감이 남지 않도록 confirm을 낙관적 업데이트보다 먼저 확인
    if (
      !(await confirmDialog(
        `${recipientUser.name}님에게 쿠폰 ${amount}개를 선물하시겠습니까?`, { danger: true }))
    ) {
      return; // 취소 — 아직 아무 것도 차감하지 않음
    }

    actionLockRef.current = true;
    // 🔒 lock 획득 직후 곧바로 try 진입 — 사이에서 throw 시 finally 미도달로 ref 영구잠금 방지
    try {
      // 낙관적 업데이트 (confirm 통과 후, try 안에서 — 예외 시에도 finally가 lock 해제)
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: -amount });
      }
      setAssetsLoading(true);
      await giftCouponFunction({
        recipientId: recipientUser.id,
        amount,
        message: "",
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("쿠폰 선물이 완료되었습니다.");
      setShowGiftCouponModal(false);
      setGiftRecipient("");
      setGiftAmount("");

      // 🔥 ref를 통해 데이터 다시 로드
      setTimeout(() => {
        loadingRef.current = false;
        if (loadGoalDataRef.current) {
          loadGoalDataRef.current();
        }
      }, 500);
    } catch (error) {
      toast.error(`선물 오류: ${error.message}`);
      // 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: amount });
      }
    } finally {
      setAssetsLoading(false);
      actionLockRef.current = false;
    }
  };

  if (authLoading || assetsLoading) {
    return <AlchanLoading />;
  }

  if (!user) {
    return <LoginWarning />;
  }

  if (!currentUserClassCode && !authLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
          fontSize: "1.2em",
          color: "#ef4444",
        }}
      >
        학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요.
      </div>
    );
  }

  return (
    <div className="w-full min-h-full">
      <div className="w-full px-4 md:px-6 lg:px-8 py-6">
        <h2 className="text-2xl font-bold gradient-text border-b-2 border-indigo-200 pb-3 mb-6 flex items-center gap-2">
          <Target size={26} className="text-indigo-600" />
          쿠폰 목표
        </h2>

        {currentUserClassCode && currentGoalId && (
          <>
            <CouponGoal
              classCouponGoal={classCouponGoal}
              goalProgress={goalProgress}
              myContribution={myContribution}
              currentCoupons={Number(userDoc?.coupons) || 0}
              couponValue={couponValue}
              setShowDonateModal={setShowDonateModal}
              setShowSellCouponModal={setShowSellCouponModal}
              setShowDonationHistoryModal={setShowDonationHistoryModal}
              setShowGiftCouponModal={setShowGiftCouponModal}
              goalAchieved={goalAchieved}
              resetGoalButton={canManageGoal ? resetCouponGoal : null}
              isResettingGoal={isResettingGoal}
              setNewGoalButton={
                canManageGoal && goalAchieved ? setNewGoal : null
              }
              isSettingNewGoal={isSettingNewGoal}
              randomDrawButton={
                canManageGoal && goalAchieved ? handleRandomDraw : null
              }
            />

            {/* 🔒 개발/운영용 진단 도구 — 학생 화면에는 노출하지 않는다(교사만).
                (캐시 삭제는 로컬 데이터를 지우므로 학생이 무심코 누르면 작성 중인 글이 날아감) */}
            {canManageGoal && (
            <div className="glass-card rounded-2xl mt-5 p-4">
              <h4
                style={{
                  fontSize: "14px",
                  color: "#475569",
                  marginBottom: "10px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Wrench size={15} />
                데이터 관리 도구
              </h4>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={forceRefreshGoalData}
                  disabled={assetsLoading}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "#17a2b8",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: "500",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <RefreshCw size={13} />
                  목표 데이터 새로고침
                </button>
                <button
                  onClick={showDebugInfo}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: "500",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Search size={13} />
                  디버그 정보 확인
                </button>
                <button
                  onClick={() => {
                    // 게시판 작성 중 글·사용중 아이템 표시는 보존(utils/storageReset.js)
                    clearLocalStoragePreserving();
                    // ⚠️ 여기엔 토스트를 띄우지 않는다. alert 은 확인을 누른 **뒤에**
                    //    새로고침했지만 토스트는 안 멈춘다 — 뜨자마자 reload 가 페이지째
                    //    지워서 아무도 못 본다. 새로고침 자체가 눈에 보이는 결과라
                    //    알림이 없어도 무슨 일이 일어났는지 안다.
                    window.location.reload();
                  }}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: "500",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Trash2 size={13} />
                  캐시 삭제 후 새로고침
                </button>
              </div>
              <p
                style={{
                  fontSize: "11px",
                  color: "#868e96",
                  marginTop: "8px",
                  marginBottom: "0",
                  lineHeight: "1.4",
                }}
              >
                • 응모 내역이 표시되지 않으면 "목표 데이터 새로고침" 버튼을
                클릭하세요
                <br />
                • 문제가 지속되면 "캐시 삭제 후 새로고침"을 시도해보세요
                <br />• 현재 상태: 응모 내역 {goalDonations.length}개, 목표
                진행률 {goalProgress}/{classCouponGoal}
              </p>
            </div>
            )}
          </>
        )}

        {showDonateModal && currentUserClassCode && currentGoalId && (
          <DonateCouponModal
            showDonateModal={showDonateModal}
            setShowDonateModal={setShowDonateModal}
            currentCoupons={Number(userDoc?.coupons) || 0}
            onDonate={handleDonateCoupon}
            classCode={currentUserClassCode}
          />
        )}
        {showSellCouponModal && (
          <SellCouponModal
            showSellCouponModal={showSellCouponModal}
            setShowSellCouponModal={setShowSellCouponModal}
            currentCoupons={Number(userDoc?.coupons) || 0}
            couponValue={couponValue}
            sellAmount={sellAmount}
            setSellAmount={setSellAmount}
            SellCoupon={handleSellCoupon}
          />
        )}
        {showGiftCouponModal && (
          <GiftCouponModal
            showGiftCouponModal={showGiftCouponModal}
            setShowGiftCouponModal={setShowGiftCouponModal}
            recipients={classmates}
            giftRecipient={giftRecipient}
            setGiftRecipient={setGiftRecipient}
            giftAmount={giftAmount}
            setGiftAmount={setGiftAmount}
            handleGiftCoupon={handleGiftCoupon}
            currentCoupons={Number(userDoc?.coupons) || 0}
            userId={userId}
          />
        )}
        {showDonationHistoryModal && currentUserClassCode && currentGoalId && (
          <DonationHistoryModal
            showDonationHistoryModal={showDonationHistoryModal}
            setShowDonationHistoryModal={setShowDonationHistoryModal}
            students={allClassMembers || []}
            classCode={currentUserClassCode}
            donations={goalDonations}
          />
        )}
      </div>
    </div>
  );
}
