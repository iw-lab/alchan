// src/pages/my-assets/MyAssets.js - Firestore 직접 조회 방식으로 수정된 최종 버전
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
  writeBatch,
  arrayUnion,
  getDocs,
  collection,
  query,
  where,
  functions,
  httpsCallable,
} from "../../firebase";
import { limit, runTransaction } from "firebase/firestore";
import { formatKoreanCurrency } from '../../utils/numberFormatter';
import { logActivity, ACTIVITY_TYPES } from '../../utils/firestoreHelpers';
import LoginWarning from "../../components/LoginWarning";
import TransferModal from "../../components/modals/TransferModal";
import { AlchanLoading } from "../../components/AlchanLayout";
import { DailyRewardBanner } from "../../components/DailyReward";

import { logger } from "../../utils/logger";
export default function MyAssets() {
  const {
    user,
    userDoc,
    users, // 전체 사용자 목록 (송금 대상 찾기 등에서 필요)
    classmates, // '나'를 제외한 학급 친구 목록 (송금, 선물 모달용)
    allClassMembers, // 🔥 [추가] '나'를 포함한 학급 전체 구성원 목록 (기부 내역 모달용)
    loading: authLoading,
    updateUser: updateUserInAuth,
    addCashToUserById,
    deductCash,
    optimisticUpdate,
  } = useAuth();

  const userId = user?.uid;
  const userName =
    userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";
  const currentUserClassCode = userDoc?.classCode;

  // 🔥 [최적화 1] 상태 및 레퍼런스
  const [assetsLoading, setAssetsLoading] = useState(true);
  const loadingRef = useRef(false); // 로딩 중복 방지용 플래그
  const dataFetchRef = useRef({}); // 데이터 페치 시간 추적용
  const [parkingBalance, setParkingBalance] = useState(0);
  const [deposits, setDeposits] = useState([]); // 예금 상품 목록
  const [savings, setSavings] = useState([]); // 적금 상품 목록
  const [loans, setLoans] = useState([]);
  const [realEstateAssets, setRealEstateAssets] = useState([]);
  const [totalNetAssets, setTotalNetAssets] = useState(0);
  const [goalDonations, setGoalDonations] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [forceReload, setForceReload] = useState(0); // 캐시 문제 해결을 위한 상태 변수

  // 🔥 [최적화 2] Firebase Functions 호출 함수들 (기부 제외)
  const getUserAssetsDataFunction = httpsCallable(functions, 'getUserAssetsData');
  const sellCouponFunction = httpsCallable(functions, 'sellCoupon');
  const giftCouponFunction = httpsCallable(functions, 'giftCoupon');

  // 🔥 [최적화 4] 캐시 유효 시간 설정
  const CACHE_DURATION = 60 * 60 * 1000; // 🔥 [최적화] 1시간 (Firestore 읽기 최소화)

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
        logger.error("[MyAssets] 쿠폰 가치 설정 로드 실패:", error);
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
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [showAllTransactions, setShowAllTransactions] = useState(false); // 거래 내역 펼치기/접기 상태

  // 🔥 [수정 1] 안전한 timestamp 변환 함수
  const safeTimestampToDate = (timestamp) => {
    try {
      // null이나 undefined인 경우
      if (!timestamp) {
        return new Date();
      }

      // 이미 Date 객체인 경우
      if (timestamp instanceof Date) {
        return isNaN(timestamp.getTime()) ? new Date() : timestamp;
      }

      // Firestore Timestamp 객체인 경우
      if (timestamp && typeof timestamp.toDate === 'function') {
        const date = timestamp.toDate();
        return isNaN(date.getTime()) ? new Date() : date;
      }

      // seconds 필드가 있는 Firestore Timestamp 형태인 경우
      if (timestamp && timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return isNaN(date.getTime()) ? new Date() : date;
      }

      // ISO 문자열인 경우
      if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? new Date() : date;
      }

      // 숫자 타임스탬프인 경우
      if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? new Date() : date;
      }

      // 기타 경우 현재 날짜 반환
      return new Date();
    } catch (error) {
      return new Date();
    }
  };

  // 🔥 [최적화 5] 캐시 유효성 확인 함수
  const isCacheValid = (cacheKey) => {
    const cachedTime = dataFetchRef.current[cacheKey];
    return cachedTime && (Date.now() - cachedTime) < CACHE_DURATION;
  };

  // 🔥 [최적화 6] localStorage 기반 캐시 함수들
  const getCachedFirestoreData = (key) => {
    try {
      const cached = localStorage.getItem(`firestore_cache_${key}_${userId}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (error) {
    }
    return null;
  };

  const setCachedFirestoreData = (key, data) => {
    try {
      const cacheItem = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(`firestore_cache_${key}_${userId}`, JSON.stringify(cacheItem));
    } catch (error) {
    }
  };

  // 🔥 [수정 2] 안전한 트랜잭션 기록 함수 - 로컬에서만 처리하고 나중에 배치로 동기화
  const addTransaction = async (userId, amount, description) => {
    try {
      // 먼저 로컬 저장소에 저장
      const localKey = `pending_transactions_${userId}`;
      const existing = localStorage.getItem(localKey);
      const pendingTransactions = existing ? JSON.parse(existing) : [];

      // 🔥 일관된 timestamp 형식 사용 - Date 객체 생성
      const now = new Date();
      const newTransaction = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: Number(amount) || 0, // 숫자로 안전하게 변환
        description: String(description) || "거래 내역", // 문자열로 안전하게 변환
        timestamp: now, // Date 객체로 직접 저장
        timestampISO: now.toISOString(), // ISO 문자열도 보관
        synced: false,
      };

      pendingTransactions.push(newTransaction);
      localStorage.setItem(localKey, JSON.stringify(pendingTransactions, (key, value) => {
        // Date 객체를 JSON으로 직렬화할 때 ISO 문자열로 변환
        if (key === 'timestamp' && value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }));

      // 로컬 상태 즉시 업데이트
      setTransactionHistory(prev => [newTransaction, ...prev.slice(0, 4)]);


      // 🔥 [수정 3] 백그라운드에서 비동기 동기화 (실패해도 메인 기능에 영향 없음)
      setTimeout(async () => {
        try {
          await syncPendingTransactions(userId);
        } catch (error) {
        }
      }, 1000);

    } catch (error) {
    }
  };

  // 🔥 [수정 4] 보류 중인 트랜잭션 동기화 함수
  const syncPendingTransactions = async (userId) => {
    const localKey = `pending_transactions_${userId}`;
    const pendingStr = localStorage.getItem(localKey);

    if (!pendingStr) return;

    try {
      const pendingTransactions = JSON.parse(pendingStr, (key, value) => {
        // JSON에서 Date 객체로 복원
        if (key === 'timestamp' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });

      const unsyncedTransactions = pendingTransactions.filter(tx => !tx.synced);

      if (unsyncedTransactions.length === 0) return;

      const batch = writeBatch(db);
      const userTransactionsRef = collection(db, "users", userId, "transactions");

      unsyncedTransactions.forEach(tx => {
        const docRef = doc(userTransactionsRef);
        batch.set(docRef, {
          amount: tx.amount,
          description: tx.description,
          timestamp: serverTimestamp(), // Firestore에는 serverTimestamp 사용
          localTimestamp: tx.timestampISO || tx.timestamp, // 로컬 타임스탬프도 보존
          syncedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      // 동기화 완료 표시
      const updatedTransactions = pendingTransactions.map(tx =>
        unsyncedTransactions.find(utx => utx.id === tx.id)
          ? { ...tx, synced: true }
          : tx
      );

      localStorage.setItem(localKey, JSON.stringify(updatedTransactions, (key, value) => {
        if (key === 'timestamp' && value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }));

    } catch (error) {
    }
  };

  // 🔥 [핵심 수정] 데이터 덮어쓰기 방지를 위해 트랜잭션을 사용한 안전한 목표 생성 함수
  const createDefaultGoalForClass = useCallback(async (classCode, goalId) => {
    try {
      const goalDocRef = doc(db, "goals", goalId);
      const defaultGoalData = {
        classCode: classCode,
        targetAmount: 1000,
        progress: 0,
        donations: [],
        donationCount: 0,
        title: `${classCode} 학급 목표`,
        description: `${classCode} 학급의 쿠폰 목표입니다.`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      // 트랜잭션을 사용하여 문서가 없을 때만 안전하게 생성 (덮어쓰기 방지)
      await runTransaction(db, async (transaction) => {
        const goalDoc = await transaction.get(goalDocRef);
        if (!goalDoc.exists()) {
          transaction.set(goalDocRef, defaultGoalData);
          setCachedFirestoreData(`goal_${goalId}`, defaultGoalData);
        } else {
          const existingData = goalDoc.data();
          setCachedFirestoreData(`goal_${goalId}`, existingData);
        }
      });

    } catch (error) {
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 🔥 [수정] 목표 데이터 로드 함수 - 캐시 추가 및 최적화
  const loadGoalData = useCallback(async () => {
    if (!currentGoalId || !currentUserClassCode) {
      return;
    }

    // 🔥 캐시 먼저 확인
    const cacheKey = `goal_${currentGoalId}`;
    const cachedData = getCachedFirestoreData(cacheKey);

    if (cachedData) {
      setClassCouponGoal(Number(cachedData.targetAmount) || 1000);
      setGoalProgress(Number(cachedData.progress) || 0);

      const donations = Array.isArray(cachedData.donations) ? cachedData.donations : [];
      setGoalDonations(donations);

      const myDonations = donations.filter(d => d.userId === userId);
      const myTotal = myDonations.reduce((sum, d) => sum + d.amount, 0);
      setMyContribution(myTotal);

      return;
    }

    try {
      const goalDocRef = doc(db, "goals", currentGoalId);
      const goalDocSnap = await getDoc(goalDocRef);

      if (goalDocSnap.exists()) {
        const goalData = goalDocSnap.data();

        // 목표 정보 업데이트
        setClassCouponGoal(Number(goalData.targetAmount) || 1000);
        setGoalProgress(Number(goalData.progress) || 0);

        // 기부 내역 처리
        const donations = Array.isArray(goalData.donations)
          ? goalData.donations.map((donation) => {
            let processedTimestamp;
            if (donation.timestamp && donation.timestamp.toDate) {
              processedTimestamp = donation.timestamp.toDate().toISOString();
            } else if (donation.timestamp && donation.timestamp.seconds) {
              processedTimestamp = new Date(donation.timestamp.seconds * 1000).toISOString();
            } else if (donation.timestampISO) {
              processedTimestamp = donation.timestampISO;
            } else if (typeof donation.timestamp === 'string') {
              processedTimestamp = donation.timestamp;
            } else {
              processedTimestamp = new Date().toISOString();
            }

            return {
              ...donation,
              amount: Number(donation.amount) || 0,
              timestamp: processedTimestamp,
              userId: donation.userId || '',
              userName: donation.userName || '알 수 없는 사용자',
              message: donation.message || '',
              classCode: donation.classCode || currentUserClassCode,
            };
          })
          : [];

        setGoalDonations(donations);

        // 내 기여 계산
        const myDonations = donations.filter(d => d.userId === userId);
        const myTotal = myDonations.reduce((sum, d) => sum + d.amount, 0);
        setMyContribution(myTotal);

        // 🔥 캐시에 저장
        setCachedFirestoreData(cacheKey, goalData);
      } else {
        // 목표 문서가 없으면 기본값 생성
        logger.log('[MyAssets] 목표 문서가 없어 기본값 생성');
        await createDefaultGoalForClass(currentUserClassCode, currentGoalId);
      }
    } catch (error) {
      logger.error('[MyAssets] 목표 데이터 로드 실패:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGoalId, currentUserClassCode, userId, createDefaultGoalForClass]);

  const loadMyAssetsData = useCallback(async () => {
    if (!userId || !db) {
      setAssetsLoading(false);
      return;
    }

    // 이미 로딩 중이면 중복 실행 방지
    if (loadingRef.current) {
      logger.log('[MyAssets] ⏸️ 이미 로딩 중이므로 중복 실행 방지');
      return;
    }

    loadingRef.current = true;
    setAssetsLoading(true);

    try {
      // 🔥 [최적화] 모든 잠재적 경로를 쿼리합니다 (limit 추가)
      const realEstateRef1 = query(collection(db, "classes", currentUserClassCode, "realEstateProperties"), where("owner", "==", userId), limit(50));
      const realEstateRef2 = query(collection(db, "ClassStock", currentUserClassCode, "students", userId, "realestates"), limit(50));
      const realEstateRef3 = query(collection(db, "realEstate"), where("ownerId", "==", userId), limit(50));

      const [snap1, snap2, snap3] = await Promise.all([
        getDocs(realEstateRef1),
        getDocs(realEstateRef2),
        getDocs(realEstateRef3),
      ]);

      const allRealEstateAssets = [];
      snap1.forEach(doc => allRealEstateAssets.push({ id: doc.id, ...doc.data() }));
      snap2.forEach(doc => allRealEstateAssets.push({ id: doc.id, ...doc.data() }));
      snap3.forEach(doc => allRealEstateAssets.push({ id: doc.id, ...doc.data() }));

      // 파킹통장 데이터 조회 (모든 잠재적 경로)
      const parkingRef1 = doc(db, "users", userId, "financials", "parkingAccount");
      const parkingRef2 = collection(db, "ClassStock", currentUserClassCode, "students", userId, "parkingAccounts");

      const [parkingSnap1, parkingSnap2] = await Promise.all([
        getDoc(parkingRef1),
        getDocs(parkingRef2),
      ]);

      let totalParkingBalance = 0;
      if (parkingSnap1.exists()) {
        totalParkingBalance += parkingSnap1.data().balance || 0;
      }

      parkingSnap2.forEach(doc => {
        totalParkingBalance += doc.data().balance || 0;
      });

      setParkingBalance(totalParkingBalance);

      // 🔥 [최적화] 가입 상품 조회 (예금, 적금, 대출 모두 products 컬렉션에 저장됨)
      const productsRef = query(collection(db, "users", userId, "products"), limit(50));
      const productsSnap = await getDocs(productsRef);

      const depositsData = [];
      const savingsData = [];
      const loansData = [];

      productsSnap.forEach(docSnap => {
        const product = {
          id: docSnap.id,
          ...docSnap.data(),
          maturityDate: docSnap.data().maturityDate?.toDate ? docSnap.data().maturityDate.toDate() : docSnap.data().maturityDate
        };
        if (product.type === 'deposit') depositsData.push(product);
        else if (product.type === 'savings') savingsData.push(product);
        else if (product.type === 'loan') loansData.push(product);
      });

      setDeposits(depositsData);
      setSavings(savingsData);
      setLoans(loansData);

      setRealEstateAssets(allRealEstateAssets);

      // 🔥 [최적화] 목표 데이터는 별도 useEffect에서 로드 (중복 호출 방지)
      // loadGoalData()는 [user, currentGoalId] 의존성의 useEffect에서 호출됨

      // 🔥 거래 내역 로드 - activity_logs + transactions 컬렉션 모두 조회
      let activityData = [];
      let transactionsData = [];

      // 1. activity_logs 컬렉션에서 활동 가져오기 (인덱스 불필요 - 클라이언트 정렬)
      try {
        const activityLogsRef = query(
          collection(db, "activity_logs"),
          where("classCode", "==", currentUserClassCode),
          where("userId", "==", userId),
          limit(50)
        );
        const activityLogsSnap = await getDocs(activityLogsRef);
        activityData = activityLogsSnap.docs
          .map(doc => {
            const data = doc.data();
            const desc = data.description || data.type || '거래 내역';
            return {
              id: doc.id,
              amount: data.amount || 0,
              description: desc === 'undefined' ? '거래 내역' : desc,
              timestamp: data.timestamp,
              type: data.type,
              couponAmount: data.couponAmount || 0,
              source: 'activity_logs'
            };
          })
          // 현금 또는 쿠폰 변동이 있는 항목만 필터링
          .filter(tx => tx.amount !== 0 || tx.couponAmount !== 0);
      } catch (activityError) {
        logger.log('[MyAssets] activity_logs 조회 실패:', activityError);
      }

      // 2. 기존 transactions 서브컬렉션에서도 조회 (하위 호환성)
      try {
        const transactionsRef = query(
          collection(db, "users", userId, "transactions"),
          limit(50)
        );
        const transactionsSnap = await getDocs(transactionsRef);
        transactionsData = transactionsSnap.docs
          .map(doc => {
            const data = doc.data();
            const desc = data.description || '거래 내역';
            return {
              id: doc.id,
              amount: data.amount || 0,
              description: (!desc || desc === 'undefined') ? '거래 내역' : desc,
              timestamp: data.timestamp || data.createdAt,
              type: data.type || 'transaction',
              source: 'transactions'
            };
          })
          .filter(tx => tx.amount !== 0);
      } catch (transactionsError) {
        logger.log('[MyAssets] transactions 조회 실패:', transactionsError);
      }

      // 두 소스 합치기 (중복 제거는 ID 기반)
      const allTransactions = [...activityData, ...transactionsData];

      // timestamp 기준으로 정렬
      allTransactions.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp?.seconds * 1000 || 0);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp?.seconds * 1000 || 0);
        return dateB - dateA;
      });

      // 최근 20개만 유지
      setTransactionHistory(allTransactions.slice(0, 20));

    } catch (fallbackError) {
      logger.error('[MyAssets] 🚨 클라이언트 측 직접 조회 실패:', fallbackError);
    } finally {
      setAssetsLoading(false);
      loadingRef.current = false;
    }
  }, [userId, currentUserClassCode]); // loadGoalData 제거하여 무한 루프 방지

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authLoading && user) {
      loadMyAssetsData();
    } else if (!authLoading && !user) {
      setAssetsLoading(false);
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      setTotalNetAssets(0);
      setMyContribution(0);
      setClassCouponGoal(1000);
      setGoalProgress(0);
      setCouponValue(1000);
      setGoalDonations([]);
      setTransactionHistory([]);
    } else if (authLoading) {
      setAssetsLoading(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]); // loadMyAssetsData 제거하여 무한 루프 방지

  useEffect(() => {
    const cashValue = Number(userDoc?.cash) || 0;
    const couponMonetaryValue = (Number(userDoc?.coupons) || 0) * Number(couponValue);
    const realEstateValue = realEstateAssets.reduce(
      (sum, asset) => sum + (Number(asset.price) || 0),
      0
    );
    // 예금 총액 (balance 기준)
    const depositsTotal = deposits.reduce(
      (sum, deposit) => sum + (Number(deposit.balance) || 0),
      0
    );
    // 적금 총액 (balance 기준)
    const savingsTotal = savings.reduce(
      (sum, saving) => sum + (Number(saving.balance) || 0),
      0
    );
    // 대출 총액 (balance 기준 - remainingPrincipal이 없으면 balance 사용)
    const loanTotal = loans.reduce(
      (sum, loan) => sum + (Number(loan.remainingPrincipal) || Number(loan.balance) || 0),
      0
    );
    const calculatedTotalAssets =
      cashValue +
      couponMonetaryValue +
      Number(parkingBalance) +
      depositsTotal +
      savingsTotal +
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
    realEstateAssets,
    loans,
  ]);

  useEffect(() => {
    setGoalAchieved(goalProgress >= classCouponGoal && classCouponGoal > 0);
  }, [goalProgress, classCouponGoal]);

  // 🔥 [수정] 목표 데이터 폴링 제거 - 캐시로 충분함
  // 초기 로드만 수행하고 폴링은 하지 않음 (불필요한 Firestore 조회 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || !currentGoalId) {
      return;
    }

    loadGoalData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentGoalId]); // loadGoalData 제거하여 무한 루프 방지

  // 🔥 [수정] 기부 처리 함수 - 캐시 무효화 개선
  const handleDonateCoupon = async (amount, memo) => {
    if (!userId || !currentUserClassCode) {
      alert("사용자 또는 학급 정보가 없어 기부할 수 없습니다.");
      return false;
    }

    const donationAmount = parseInt(amount, 10);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      alert("유효한 쿠폰 수량을 입력해주세요.");
      return false;
    }

    // 쿠폰 보유량 확인
    const currentCoupons = Number(userDoc?.coupons) || 0;
    if (currentCoupons < donationAmount) {
      alert(`쿠폰이 부족합니다. (보유: ${currentCoupons}개, 필요: ${donationAmount}개)`);
      return false;
    }

    setAssetsLoading(true);

    // 낙관적 업데이트 (UI 즉시 반영)
    const previousProgress = goalProgress;
    const previousMyContribution = myContribution;
    const previousDonations = goalDonations;

    const newDonation = {
      userId: userId,
      userName: userName,
      amount: donationAmount,
      timestamp: new Date().toISOString(),
      timestampISO: new Date().toISOString(),
      message: memo || '',
      classCode: currentUserClassCode,
    };

    setGoalProgress(prev => prev + donationAmount);
    setMyContribution(prev => prev + donationAmount);
    setGoalDonations(prev => [...prev, newDonation]);

    // 🔥 쿠폰 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ coupons: -donationAmount });
    }

    try {
      // 1. 사용자 쿠폰 차감 (AuthContext 사용)
      const couponDeducted = await updateUserInAuth({
        coupons: increment(-donationAmount)
      });

      if (!couponDeducted) {
        throw new Error("쿠폰 차감에 실패했습니다.");
      }

      // 2. Firestore 트랜잭션으로 목표 업데이트
      const goalDocRef = doc(db, "goals", currentGoalId);

      await runTransaction(db, async (transaction) => {
        const goalDoc = await transaction.get(goalDocRef);

        if (!goalDoc.exists()) {
          throw new Error("목표 문서를 찾을 수 없습니다.");
        }

        const firestoreDonation = {
          userId: userId,
          userName: userName,
          amount: donationAmount,
          timestamp: serverTimestamp(),
          timestampISO: new Date().toISOString(),
          message: memo || '',
          classCode: currentUserClassCode,
        };

        // progress 증가 및 donations 배열에 추가
        transaction.update(goalDocRef, {
          progress: increment(donationAmount),
          donations: arrayUnion(firestoreDonation),
          updatedAt: serverTimestamp(),
        });
      });

      // 3. donations 컬렉션에도 기록 (선택사항, 히스토리 추적용)
      const donationRecordRef = doc(collection(db, "donations"));
      await setDoc(donationRecordRef, {
        userId: userId,
        userName: userName,
        amount: donationAmount,
        timestamp: serverTimestamp(),
        timestampISO: new Date().toISOString(),
        message: memo || '',
        classCode: currentUserClassCode,
        goalId: currentGoalId,
      });

      // 4. 트랜잭션 기록
      await addTransaction(userId, -donationAmount * couponValue, `학급 목표에 ${donationAmount}쿠폰 기부`);

      // 🔥 활동 로그 기록 (쿠폰 기부)
      logActivity(db, {
        classCode: currentUserClassCode,
        userId: userId,
        userName: userName,
        type: ACTIVITY_TYPES.COUPON_DONATE,
        description: `학급 목표에 쿠폰 ${donationAmount}개 기부`,
        couponAmount: -donationAmount,
        metadata: {
          goalId: currentGoalId,
          goalProgress: goalProgress + donationAmount,
          message: memo || ''
        }
      });

      // 🔥 5. 캐시 무효화 (모든 관련 캐시 삭제)
      const cacheKey = `goal_${currentGoalId}`;
      localStorage.removeItem(`firestore_cache_${cacheKey}_${userId}`);
      localStorage.removeItem(`goalDonationHistory_${currentUserClassCode}_goal`);

      alert(`${donationAmount}개 쿠폰 기부가 완료되었습니다!`);
      setShowDonateModal(false);

      // 🔥 6. 최신 데이터 다시 로드 (캐시가 삭제되었으므로 Firestore에서 가져옴)
      setTimeout(() => {
        loadGoalData();
      }, 500);

      return true;
    } catch (error) {
      logger.error('[MyAssets] 기부 오류:', error);
      alert(`기부 오류: ${error.message}`);

      // 에러 발생 시 낙관적 업데이트 롤백
      setGoalProgress(previousProgress);
      setMyContribution(previousMyContribution);
      setGoalDonations(previousDonations);

      // 쿠폰도 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: donationAmount });
      }

      return false;
    } finally {
      setAssetsLoading(false);
    }
  };

  // 🔥 [수정] 기부 내역 복구를 위한 강제 새로고침 함수
  const forceRefreshGoalData = async () => {
    if (!currentGoalId || !currentUserClassCode) {
      alert("학급 정보가 없습니다.");
      return;
    }

    setAssetsLoading(true);

    try {
      // 모든 관련 캐시 삭제
      const cacheKey = `goal_${currentGoalId}`;
      localStorage.removeItem(`firestore_cache_${cacheKey}_${userId}`);
      localStorage.removeItem(`firestore_cache_settings_${userId}`);
      localStorage.removeItem(`goalDonationHistory_${currentUserClassCode}_goal`);

      logger.log('[MyAssets] 캐시 삭제 완료, Firestore에서 최신 데이터 로드 중...');

      // 🔥 Firestore에서 직접 최신 데이터 가져오기
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
              processedTimestamp = new Date(donation.timestamp.seconds * 1000).toISOString();
            } else if (donation.timestampISO) {
              processedTimestamp = donation.timestampISO;
            } else if (typeof donation.timestamp === 'string') {
              processedTimestamp = donation.timestamp;
            } else {
              processedTimestamp = new Date().toISOString();
            }

            return {
              ...donation,
              amount: Number(donation.amount) || 0,
              timestamp: processedTimestamp,
              userId: donation.userId || '',
              userName: donation.userName || '알 수 없는 사용자',
              message: donation.message || '',
              classCode: donation.classCode || currentUserClassCode,
            };
          })
          : [];

        setGoalDonations(freshDonations);

        // 내 기여도 재계산
        const myDonations = freshDonations.filter(d => d.userId === userId);
        const myTotal = myDonations.reduce((sum, d) => sum + d.amount, 0);
        setMyContribution(myTotal);

        // 캐시에 저장
        setCachedFirestoreData(cacheKey, latestGoalData);

        alert(`목표 데이터 새로고침 완료!\n목표 진행률: ${latestGoalData.progress || 0}/${latestGoalData.targetAmount || 1000}\n기부 내역: ${freshDonations.length}개\n내 기여도: ${myTotal}개`);
      } else {
        alert("목표 문서를 찾을 수 없습니다. 관리자에게 문의해주세요.");
      }
    } catch (error) {
      logger.error('[MyAssets] 데이터 새로고침 오류:', error);
      alert(`데이터 새로고침 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setAssetsLoading(false);
    }
  };

  // 🔥 [추가] 개발자용 디버그 정보 표시 함수
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

    alert(`디버그 정보가 콘솔에 출력되었습니다.\n기부 내역: ${goalDonations.length}개\n목표 진행률: ${goalProgress}/${classCouponGoal}`);
  };

  // 🔥 [핵심 수정] 'resetCouponGoal' 함수에 async 키워드 추가
  const resetCouponGoal = async () => {
    if (!userDoc?.isAdmin && !userDoc?.isSuperAdmin) {
      alert("관리자만 초기화 가능합니다.");
      return;
    }
    if (!currentUserClassCode || !currentGoalId) {
      alert("학급 코드나 목표 정보가 없어 초기화할 수 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `정말로 ${currentUserClassCode} 학급의 쿠폰 목표와 기여 기록을 초기화하시겠습니까?`
      )
    )
      return;

    setIsResettingGoal(true);
    try {
      const batch = writeBatch(db);
      const goalRef = doc(db, "goals", currentGoalId);

      // 🔥 [최적화] 사용자 조회에 limit 추가
      const usersQuery = query(
        collection(db, "users"),
        where("classCode", "==", currentUserClassCode),
        limit(100)
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
        progress: 0,
        donations: [],
        donationCount: 0,
        updatedAt: serverTimestamp(),
        resetAt: serverTimestamp(),
        resetBy: userId,
      });

      await batch.commit();

      // 🔥 [최적화 23] 초기화 후 관련 캐시 모두 삭제
      localStorage.removeItem(`goalDonationHistory_${currentUserClassCode}_goal`);
      localStorage.removeItem(`firestore_cache_goal_${currentGoalId}_${userId}`);

      setMyContribution(0);
      setGoalProgress(0);
      setGoalDonations([]);

      alert(`학급(${currentUserClassCode})의 쿠폰 목표와 기여 기록이 초기화되었습니다.`);
    } catch (error) {
      alert(`목표 초기화 오류: ${error.message}`);
    } finally {
      setIsResettingGoal(false);
    }
  };

  const handleSellCoupon = async () => {
    const amount = parseInt(sellAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("유효한 수량을 입력해주세요.");
      return;
    }

    // 🔥 쿠폰 차감 및 현금 증가 즉시 UI 업데이트 (낙관적 업데이트)
    const cashGained = amount * couponValue;
    if (optimisticUpdate) {
      optimisticUpdate({ coupons: -amount, cash: cashGained });
    }

    setAssetsLoading(true);
    try {
      await sellCouponFunction({ amount });

      // 🔥 활동 로그 기록 (쿠폰 판매)
      logActivity(db, {
        classCode: currentUserClassCode,
        userId: userId,
        userName: userName,
        type: ACTIVITY_TYPES.COUPON_USE,
        description: `쿠폰 ${amount}개 판매 (${cashGained.toLocaleString()}원)`,
        amount: cashGained,
        couponAmount: -amount,
        metadata: {
          couponsSold: amount,
          cashReceived: cashGained,
          couponValue: couponValue
        }
      });

      alert(`${amount}개 쿠폰을 판매했습니다.`);
      setShowSellCouponModal(false);
      setSellAmount("");
      // 🔥 [최적화] Firebase Function이 자동으로 userDoc를 업데이트하므로
      // AuthContext의 실시간 리스너가 자동으로 UI를 갱신함 (loadMyAssetsData 제거)
    } catch (error) {
      alert(`판매 오류: ${error.message}`);

      // 실패 시 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: amount, cash: -cashGained });
      }
    } finally {
      setAssetsLoading(false);
    }
  };

  const handleGiftCoupon = async () => {
    const recipientUser = users.find((u) => u.id === giftRecipient);
    const amount = parseInt(giftAmount, 10);

    if (!recipientUser) {
      alert("받는 사람을 선택해주세요.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 수량을 입력해주세요.");
      return;
    }

    if (window.confirm(`${recipientUser.name}님에게 쿠폰 ${amount}개를 선물하시겠습니까?`)) {
      // 🔥 쿠폰 즉시 UI 업데이트 (낙관적 업데이트)
      if (optimisticUpdate) {
        optimisticUpdate({ coupons: -amount });
      }

      setAssetsLoading(true);
      try {
        await giftCouponFunction({ recipientId: recipientUser.id, amount, message: "" });

        // 🔥 활동 로그 기록 (쿠폰 선물 발송)
        logActivity(db, {
          classCode: currentUserClassCode,
          userId: userId,
          userName: userName,
          type: ACTIVITY_TYPES.COUPON_GIFT_SEND,
          description: `${recipientUser.name}님에게 쿠폰 ${amount}개 선물`,
          couponAmount: -amount,
          metadata: {
            recipientId: recipientUser.id,
            recipientName: recipientUser.name
          }
        });

        // 🔥 활동 로그 기록 (쿠폰 선물 수신) - 받는 사람도 기록
        logActivity(db, {
          classCode: currentUserClassCode,
          userId: recipientUser.id,
          userName: recipientUser.name,
          type: ACTIVITY_TYPES.COUPON_GIFT_RECEIVE,
          description: `${userName}님으로부터 쿠폰 ${amount}개 수신`,
          couponAmount: amount,
          metadata: {
            senderId: userId,
            senderName: userName
          }
        });

        alert("쿠폰 선물이 완료되었습니다.");
        setShowGiftCouponModal(false);
        setGiftRecipient("");
        setGiftAmount("");
        // 🔥 [최적화] Firebase Function이 자동으로 userDoc를 업데이트하므로
        // AuthContext의 실시간 리스너가 자동으로 UI를 갱신함 (loadMyAssetsData 제거)
      } catch (error) {
        alert(`선물 오류: ${error.message}`);

        // 실패 시 롤백
        if (optimisticUpdate) {
          optimisticUpdate({ coupons: amount });
        }
      } finally {
        setAssetsLoading(false);
      }
    }
  };

  const handleTransferMoney = async () => {
    setAssetsLoading(true);
    try {
      if (
        !userDoc ||
        !userId ||
        !db ||
        !users ||
        !deductCash ||
        !addCashToUserById
      ) {
        alert("필수 정보가 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      const amount = parseInt(transferAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        alert("올바른 송금액을 입력해주세요.");
        return;
      }

      if ((Number(userDoc.cash) || 0) < amount) {
        alert("보유 현금이 부족합니다.");
        return;
      }

      const recipientUser = users.find((u) => u.id === transferRecipient);
      if (!recipientUser) {
        alert("송금 대상을 찾을 수 없습니다. 목록을 새로고침하고 다시 시도해주세요.");
        return;
      }

      if (recipientUser.id === userId) {
        alert("자기 자신에게는 송금할 수 없습니다.");
        return;
      }

      const recipientName = recipientUser.name || recipientUser.nickname || "사용자";

      // 사용자의 요청에 따라 확인 창을 제거합니다.
      const deductSuccess = await deductCash(amount, `${recipientName}님에게 송금`);
      if (deductSuccess) {
        const addSuccess = await addCashToUserById(recipientUser.id, amount, `${userName}님으로부터 입금`);
        if (addSuccess) {
          // 🔥 활동 로그 기록 (송금 발송)
          logActivity(db, {
            classCode: currentUserClassCode,
            userId: userId,
            userName: userName,
            type: ACTIVITY_TYPES.TRANSFER_SEND,
            description: `${recipientName}님에게 ${amount.toLocaleString()}원 송금`,
            amount: -amount,
            metadata: {
              recipientId: recipientUser.id,
              recipientName: recipientName
            }
          });

          // 🔥 활동 로그 기록 (송금 수신) - 받는 사람도 기록
          logActivity(db, {
            classCode: currentUserClassCode,
            userId: recipientUser.id,
            userName: recipientName,
            type: ACTIVITY_TYPES.TRANSFER_RECEIVE,
            description: `${userName}님으로부터 ${amount.toLocaleString()}원 입금`,
            amount: amount,
            metadata: {
              senderId: userId,
              senderName: userName
            }
          });

          alert("송금이 완료되었습니다.");
          setShowTransferModal(false);
          setTransferRecipient("");
          setTransferAmount("");
        } else {
          alert("받는 사람에게 현금을 전달하는 데 실패했습니다. 송금이 취소됩니다.");
          // 송금 실패 시 차감했던 금액을 다시 복원합니다.
          await addCashToUserById(userId, amount, "송금 실패로 인한 복원");
        }
      } else {
        alert("계좌에서 현금을 인출하는 데 실패했습니다.");
      }
    } catch (error) {
      logger.error("!!! 송금 처리 중 예기치 않은 오류 발생 !!!", error);
      alert(`송금 중 오류가 발생했습니다: ${error.message}`);
      // 실패 시 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ cash: parseInt(transferAmount, 10) || 0 });
      }
    } finally {
      setAssetsLoading(false);
    }
  };

  const handleForceRefresh = () => {
    // 캐시 삭제
    const cacheKey = `myAssets_${userId}`;
    localStorage.removeItem(`firestore_cache_${cacheKey}_${userId}`);

    logger.log('[MyAssets] 🔄 캐시 삭제 및 강제 새로고침');

    // 데이터 다시 로드
    loadMyAssetsData();
  };

  const renderTitle = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <h2
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#00fff2",
          borderBottom: "2px solid rgba(0, 255, 242, 0.2)",
          paddingBottom: "10px",
          margin: 0,
          textShadow: "0 0 10px rgba(0, 255, 242, 0.3)",
        }}
      >
        나의 자산 현황 💳
      </h2>
      <button
        onClick={handleForceRefresh}
        disabled={assetsLoading}
        style={{
          padding: "8px 16px",
          backgroundColor: "rgba(0, 255, 242, 0.1)",
          color: "#00fff2",
          border: "1px solid rgba(0, 255, 242, 0.3)",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "600",
          cursor: assetsLoading ? "not-allowed" : "pointer",
          opacity: assetsLoading ? 0.6 : 1,
          transition: "all 0.2s ease",
        }}
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
      <div
        style={{
          padding: "0",
          background: "transparent",
          marginBottom: "25px",
        }}
      >
        {/* 보유 현금 - 메인 강조 카드 */}
        <div
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: "20px",
            padding: "30px",
            marginBottom: "20px",
            boxShadow: "0 10px 30px rgba(102, 126, 234, 0.3)",
            border: "none",
          }}
        >
          <div style={{ marginBottom: "10px" }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "16px", fontWeight: "500" }}>
              💰 보유 현금
            </span>
          </div>
          <div style={{
            fontSize: "42px",
            fontWeight: "800",
            color: "#ffffff",
            letterSpacing: "-1px",
            marginBottom: "15px",
            textAlign: "right"
          }}>
            {displayCash.toLocaleString()} <span style={{ fontSize: "28px", fontWeight: "600" }}>원</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowTransferModal(true)}
              style={{
                padding: "14px 28px",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                color: "#667eea",
                border: "none",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                transition: "all 0.3s ease",
              }}
              disabled={assetsLoading || authLoading}
              onMouseOver={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
              }}
              onMouseOut={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
              }}
            >
              💸 송금하기
            </button>
          </div>
        </div>

        {/* 최근 입출금 내역 - 보유 현금 바로 밑에 배치 */}
        <div style={{ marginBottom: "20px" }}>
          <h4
            style={{
              fontSize: "15px",
              color: "#e8e8ff",
              fontWeight: "700",
              marginBottom: "12px",
            }}
          >
            💳 최근 입출금 내역
          </h4>
          {transactionHistory.length > 0 ? (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {displayedTransactions.map((tx) => {
                  let displayDate = "날짜 없음";
                  try {
                    const validDate = safeTimestampToDate(tx.timestamp);
                    displayDate = validDate.toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    });
                  } catch (dateError) {
                    displayDate = "오늘";
                  }

                  const txAmount = Number(tx.amount) || 0;
                  const rawDesc = tx.description;
                  const txDescription = (!rawDesc || rawDesc === 'undefined' || rawDesc === 'null') ? "거래 내역" : String(rawDesc);

                  return (
                    <div
                      key={tx.id || Math.random()}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "14px",
                        color: "#a0a0c0",
                        padding: "14px 16px",
                        backgroundColor: txAmount > 0 ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)",
                        border: txAmount > 0 ? "1px solid rgba(5, 150, 105, 0.3)" : "1px solid rgba(220, 38, 38, 0.3)",
                        borderRadius: "10px",
                      }}
                    >
                      <span
                        style={{
                          flex: "1",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginRight: "10px",
                          fontWeight: "500",
                          color: "#e8e8ff"
                        }}
                      >
                        {displayDate} • {txDescription}
                      </span>
                      <span
                        style={{
                          fontWeight: "700",
                          fontSize: "15px",
                          color: txAmount > 0 ? "#34d399" : "#f87171",
                          minWidth: "110px",
                          textAlign: "right",
                        }}
                      >
                        {txAmount > 0 ? "+" : ""}
                        {txAmount.toLocaleString()}원
                      </span>
                    </div>
                  );
                })}
              </div>
              {transactionHistory.length > 5 && (
                <button
                  onClick={() => setShowAllTransactions(!showAllTransactions)}
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "12px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#a0a0c0",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = "#f9fafb";
                  }}
                >
                  {showAllTransactions ? "▲ 접기" : `▼ ${transactionHistory.length - 5}개 더 보기`}
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: "13px",
                color: "#6b7280",
                textAlign: "center",
                padding: "20px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderRadius: "10px",
                border: "1px dashed rgba(255, 255, 255, 0.1)"
              }}
            >
              최근 거래 내역이 없습니다.
            </div>
          )}
        </div>

        {/* 총 순자산 - 두 번째 강조 카드 */}
        <div
          style={{
            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            borderRadius: "20px",
            padding: "25px 30px",
            marginBottom: "20px",
            boxShadow: "0 10px 30px rgba(240, 147, 251, 0.3)",
            border: "none",
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "16px", fontWeight: "500" }}>
              📊 총 순자산
            </span>
          </div>
          <div style={{
            fontSize: "38px",
            fontWeight: "800",
            color: "#ffffff",
            letterSpacing: "-1px",
            textAlign: "right"
          }}>
            {Number(totalNetAssets).toLocaleString()} <span style={{ fontSize: "24px", fontWeight: "600" }}>원</span>
          </div>
          <p style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "rgba(255,255,255,0.8)",
            margin: "8px 0 0 0"
          }}>
            현금 + 쿠폰가치 + 파킹통장 + 예금 + 적금 + 부동산 - 대출
          </p>
        </div>

        {/* 파킹통장 */}
        <div style={{ marginBottom: "20px" }}>
          <h4
            style={{
              fontSize: "15px",
              color: "#e8e8ff",
              fontWeight: "700",
              marginBottom: "12px",
            }}
          >
            🅿️ 파킹통장
          </h4>
          <div
            style={{
              background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
              borderRadius: "14px",
              padding: "20px",
              border: "none",
              boxShadow: "0 4px 15px rgba(6, 182, 212, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500", fontSize: "14px" }}>
                잔액
              </span>
              <span
                style={{
                  fontWeight: "800",
                  fontSize: "26px",
                  color: "#ffffff",
                  letterSpacing: "-0.5px",
                  textAlign: "right",
                  display: "block"
                }}
              >
                {Number(parkingBalance).toLocaleString()}<span style={{ fontSize: "18px", fontWeight: "600" }}>원</span>
              </span>
            </div>
          </div>
          <p style={{ marginTop: "10px", fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>
            파킹통장 메뉴에서 입출금 및 상품 가입 가능
          </p>
        </div>

        {/* 기타 자산 정보 - 깔끔한 카드 */}
        <div
          style={{
            padding: "25px",
            background: "rgba(20, 20, 35, 0.4)",
            borderRadius: "16px",
            border: "1px solid rgba(0, 255, 242, 0.1)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >

          {/* 보유 쿠폰 */}
          <div
            style={{
              marginBottom: "20px",
            }}
          >
            <h4
              style={{
                fontSize: "15px",
                color: "#374151",
                fontWeight: "700",
                marginBottom: "12px",
              }}
            >
              🎟️ 보유 쿠폰
            </h4>
            <div
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                borderRadius: "14px",
                padding: "20px",
                border: "none",
                boxShadow: "0 4px 15px rgba(251, 191, 36, 0.2)",
              }}
            >
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div style={{ width: "100%" }}>
                  <div style={{
                    fontSize: "26px",
                    fontWeight: "800",
                    color: "#ffffff",
                    letterSpacing: "-0.5px",
                    textAlign: "right"
                  }}>
                    {displayCoupons.toLocaleString()} <span style={{ fontSize: "18px", fontWeight: "600" }}>개</span>
                  </div>
                  <div style={{
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: "500",
                    marginTop: "4px",
                    textAlign: "right"
                  }}>
                    1쿠폰 = {Number(couponValue).toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>
          </div>
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
        사용자 데이터를 불러오는 중입니다. 잠시 후에도 이 메시지가 보이면 앱을 새로고침하거나 재로그인해주세요.
      </div>
    );
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
    <div className="w-full min-h-full" style={{ backgroundColor: "#0a0a12" }}>
      <div className="w-full px-4 md:px-6 lg:px-8 py-6">
        {renderTitle()}

        {/* 일일 출석 보상 배너 */}
        <DailyRewardBanner
          userId={userId}
          onClaim={async (reward) => {
            try {
              // 실제 현금 지급
              const userRef = doc(db, "users", userId);
              await setDoc(userRef, {
                cash: increment(reward),
                updatedAt: serverTimestamp(),
              }, { merge: true });

              // 활동 로그 기록
              await logActivity(db, {
                userId,
                userName,
                classCode: currentUserClassCode,
                type: "일일 출석 보상",
                description: `일일 출석 보상으로 ${reward.toLocaleString()}원 획득`,
                amount: reward,
                metadata: { rewardType: "daily_streak" }
              });

              // 로컬 상태 업데이트
              if (optimisticUpdate) {
                optimisticUpdate({ cash: (userDoc?.cash || 0) + reward });
              }

              logger.log(`Daily reward claimed and added: ${reward}`);
            } catch (error) {
              logger.error("일일 보상 지급 오류:", error);
              alert("보상 지급 중 오류가 발생했습니다. 다시 시도해주세요.");
            }
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
          />
        )}

      </div>
    </div>
  );
}