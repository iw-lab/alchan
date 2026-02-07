// src/ParkingAccount.js
import React, { useState, useEffect, useCallback } from "react";
import { db, doc, getDoc, setDoc, serverTimestamp, updateDoc, increment, runTransaction, collection, getDocs, deleteDoc, query, where, limit } from "../../firebase";
import { format, isToday, differenceInDays, isPast } from 'date-fns';
import { PiggyBank, Landmark, HandCoins, Wallet, X, TrendingUp, Building2 } from 'lucide-react';
import { formatKoreanCurrency } from '../../utils/numberFormatter';
import { logActivity, ACTIVITY_TYPES } from '../../utils/firestoreHelpers';

import { logger } from "../../utils/logger";
// 선생님(관리자) 계정 찾기 - 같은 학급의 관리자
const getTeacherAccount = async (classCode) => {
  if (!classCode) return null;

  try {
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("classCode", "==", classCode),
      where("isAdmin", "==", true),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const teacherDoc = snapshot.docs[0];
      return {
        id: teacherDoc.id,
        ...teacherDoc.data()
      };
    }
    return null;
  } catch (error) {
    logger.error("선생님 계정 조회 오류:", error);
    return null;
  }
};

// --- Tailwind class helpers ---
const cls = {
  container: "font-sans bg-transparent p-8 min-h-0",
  message: (type) => `px-5 py-4 rounded-xl mb-7 text-center text-base font-medium shadow-sm ${
    type === 'error'
      ? 'text-red-400 bg-red-500/10 border border-red-500/30'
      : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
  }`,
  grid: "grid gap-7 max-w-[1200px] mx-auto",
  card: "bg-[rgba(20,20,35,0.6)] shadow-[0_6px_20px_rgba(0,0,0,0.2)] rounded-2xl p-8 border border-white/5 backdrop-blur-[10px]",
  cardHeader: "flex items-center gap-4 mb-6 pb-5 border-b-2 border-white/5",
  cardTitle: "text-[26px] font-bold text-white tracking-tight drop-shadow-[0_0_10px_rgba(0,255,242,0.3)]",
  tabContainer: "flex border-b-2 border-white/10 mb-5 gap-2",
  tabButton: (isActive) => `px-6 py-3 border-none cursor-pointer text-[17px] rounded-t-lg transition-all duration-200 -mb-0.5 ${
    isActive
      ? 'bg-indigo-500/20 font-bold text-cyber-cyan border-b-[3px] border-b-cyber-cyan drop-shadow-[0_0_5px_rgba(0,255,242,0.3)]'
      : 'font-medium text-slate-400 border-b-[3px] border-b-transparent'
  }`,
  button: (disabled, variant = 'primary') => `text-white px-5 py-3 rounded-[10px] border border-white/10 text-[15px] font-semibold transition-all duration-200 ${
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 hover:brightness-110'
  } ${
    variant === 'primary' ? 'bg-sky-700/80' : variant === 'danger' ? 'bg-red-600/80' : variant === 'success' ? 'bg-emerald-600/80' : 'bg-gray-600'
  }`,
  noProduct: "text-center text-slate-400 py-8 text-base italic",
  input: "w-full py-3.5 px-4 bg-black/20 border-2 border-white/10 rounded-[10px] mb-4 text-base text-white transition-colors duration-200 focus:outline-none focus:border-cyber-cyan focus:ring-2 focus:ring-cyber-cyan/10",
  modalOverlay: "fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] backdrop-blur-[8px]",
  modalContent: "bg-[#1a1a2e] p-8 rounded-2xl w-[90%] max-w-[450px] relative shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-white/10 text-slate-200",
  modalTitle: "text-2xl font-bold mb-5 text-white drop-shadow-[0_0_10px_rgba(0,255,242,0.3)]",
  modalCloseBtn: "absolute top-5 right-5 bg-transparent border-none cursor-pointer text-slate-400 transition-colors duration-200 hover:text-white",
};

// --- Helper Functions & Sub-Components ---
const formatCurrency = (amount) => (typeof amount === 'number' ? Math.round(amount).toLocaleString() : '0');

// 일복리 계산
const calculateCompoundInterest = (principal, dailyRate, days) => {
  if (principal <= 0 || !dailyRate || days <= 0) return { interest: 0, total: principal };
  const total = principal * Math.pow(1 + dailyRate / 100, days);
  const interest = total - principal;
  return { interest: Math.round(interest), total: Math.round(total) };
};

// 일일 이자 계산 (메모이제이션으로 최적화)
const calculateDailyInterest = (principal, dailyRate) => {
  // 콘솔 로그 제거 - 성능 최적화
  return Math.round(principal * (dailyRate / 100));
};

const ICON_MAP = {
  parking: <Wallet size={28} className="text-sky-700" />,
  deposits: <Landmark size={28} className="text-emerald-600" />,
  savings: <PiggyBank size={28} className="text-violet-600" />,
  loans: <HandCoins size={28} className="text-red-600" />,
};

const SubscribedProductItem = ({ product, onCancel, onMaturity }) => {
  const isMatured = product.maturityDate && new Date() >= product.maturityDate;
  const daysRemaining = product.maturityDate ? Math.max(0, differenceInDays(product.maturityDate, new Date())) : 0;
  const dailyRate = product.rate; // 연이율을 일이율로 변환

  const { interest, total } = calculateCompoundInterest(
    product.balance,
    product.rate, // 일복리
    product.termInDays
  );

  const dailyInterestAmount = calculateDailyInterest(product.balance, product.rate);

  return (
    <div className={`p-5 border-2 rounded-xl mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.2)] ${
      isMatured ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-black/20'
    }`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-bold text-lg text-slate-200 mb-1">{product.name}</div>
          {isMatured && <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[13px] font-semibold">만기</span>}
        </div>
        <span className="text-xl font-bold text-cyber-cyan">{formatCurrency(product.balance)}원</span>
      </div>

      <div className="text-[15px] text-slate-400 mt-4 grid gap-2.5 bg-black/20 p-4 rounded-lg">
        <div className="flex justify-between">
          <span className="font-medium">금리 (일):</span>
          <span className="font-bold text-cyber-cyan">{product.rate}%</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium">일일 이자:</span>
          <span className="font-bold text-emerald-400">+{formatCurrency(dailyInterestAmount)}원/일</span>
        </div>
        {product.maturityDate && (
          <>
            <div className="flex justify-between">
              <span className="font-medium">만기일:</span>
              <span className="font-semibold text-slate-200">{format(product.maturityDate, 'yyyy-MM-dd')}</span>
            </div>
            {!isMatured && (
              <div className="flex justify-between">
                <span className="font-medium">남은 기간:</span>
                <span className="font-semibold text-cyber-cyan">{daysRemaining}일</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-dashed border-white/10 my-4"></div>

      <div className="text-[15px] text-slate-200 grid gap-2.5 bg-cyber-cyan/5 p-4 rounded-lg border border-cyber-cyan/10">
        <div className="flex justify-between">
          <span className="font-semibold">만기 시 이자 (세전):</span>
          <span className="font-bold text-emerald-400 text-[17px]">+{formatCurrency(interest)}원</span>
        </div>
        <div className="flex justify-between text-[17px]">
          <span className="font-bold">만기 시 총액:</span>
          <span className="font-bold text-cyber-cyan">{formatCurrency(total)}원</span>
        </div>
      </div>

      <div className="mt-5 text-right">
        {isMatured ? (
          <button
            onClick={onMaturity}
            className={cls.button(false, 'success') + ' px-5 py-2.5 text-[15px]'}
          >
            만기 수령 ({formatCurrency(total)}원)
          </button>
        ) : (
          <button
            onClick={onCancel}
            className={cls.button(false, 'danger') + ' px-5 py-2.5 text-[15px]'}
          >
            {product.type === 'loan' ? '대출 상환' : '중도 해지'}
          </button>
        )}
      </div>
    </div>
  );
};

const AvailableProductItem = ({ product, onSubscribe }) => {
  const dailyRate = product.dailyRate;
  const { interest: projectedInterest } = calculateCompoundInterest(100000, dailyRate, product.termInDays);

  return (
    <div className="p-5 border-2 border-white/10 rounded-xl mb-3 flex justify-between items-center bg-black/20 shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-200">
      <div>
        <div className="font-bold text-lg text-slate-200 mb-2">{product.name}</div>
        <div className="text-[15px] text-slate-400 mb-1.5">
          <strong className="text-cyber-cyan">일 {product.dailyRate}%</strong> (기간: {product.termInDays}일)
        </div>
        <div className="text-sm text-emerald-400 font-semibold">
          <TrendingUp size={14} className="inline mr-1" />
          10만원 가입 시 예상 이자: +{formatCurrency(projectedInterest)}원
        </div>
      </div>
      <button
        onClick={onSubscribe}
        className={cls.button(false) + ' px-6 py-3 text-base'}
      >
        가입
      </button>
    </div>
  );
};

const ProductSection = ({ title, icon, subscribedProducts, availableProducts, onSubscribe, onCancel, onMaturity }) => {
  const [activeTab, setActiveTab] = useState('subscribed');
  return (
    <div className={cls.card}>
      <div className={cls.cardHeader}>
        {icon}
        <h2 className={cls.cardTitle}>{title}</h2>
      </div>
      <div className={cls.tabContainer}>
        <button
          onClick={() => setActiveTab('subscribed')}
          className={cls.tabButton(activeTab === 'subscribed')}
        >
          가입한 상품
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={cls.tabButton(activeTab === 'available')}
        >
          가입 가능한 상품
        </button>
      </div>
      <div>
        {activeTab === 'subscribed' && (
          subscribedProducts.length > 0
            ? subscribedProducts.map(p => (
              <SubscribedProductItem
                key={p.id}
                product={p}
                onCancel={() => onCancel(p)}
                onMaturity={() => onMaturity(p)}
              />
            ))
            : <p className={cls.noProduct}>가입한 상품이 없습니다.</p>
        )}
        {activeTab === 'available' && (
          availableProducts.length > 0
            ? availableProducts.map(p => (
              <AvailableProductItem
                key={p.id}
                product={p}
                onSubscribe={() => onSubscribe(p)}
              />
            ))
            : <p className={cls.noProduct}>가입 가능한 상품이 없습니다.</p>
        )}
      </div>
    </div>
  );
};

const SubscriptionModal = ({ isOpen, onClose, product, onConfirm, isProcessing }) => {
  const [amount, setAmount] = useState("");

  if (!isOpen || !product) return null;

  const numAmount = parseFloat(amount);
  const dailyRate = product.dailyRate;
  const { interest: projectedInterest, total: projectedTotal } = !isNaN(numAmount) && numAmount > 0
    ? calculateCompoundInterest(numAmount, dailyRate, product.termInDays)
    : { interest: 0, total: 0 };

  return (
    <div className={cls.modalOverlay} onClick={onClose}>
      <div className={cls.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={cls.modalCloseBtn} aria-label="닫기"><X size={24} /></button>
        <h3 className={cls.modalTitle}>{product.name} 가입</h3>

        <div className="mb-5 p-4 bg-cyber-cyan/5 rounded-[10px] border border-cyber-cyan/20">
          <div className="text-[15px] text-slate-400 mb-2">
            <strong className="text-cyber-cyan">금리:</strong> 일 {product.dailyRate}% (일복리)
          </div>
          <div className="text-[15px] text-slate-400">
            <strong className="text-cyber-cyan">기간:</strong> {product.termInDays}일
          </div>
        </div>

        <p className="mb-3 text-base font-semibold text-slate-200">가입 금액을 입력해주세요</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cls.input}
          placeholder={`${formatCurrency(product.minAmount || 0)}원 이상`}
          autoFocus
        />

        {numAmount > 0 && (
          <div className="mb-5 p-4 bg-emerald-500/10 rounded-[10px] border border-emerald-500/30">
            <div className="text-[15px] text-emerald-400 mb-1.5">
              예상 만기 이자: <strong>+{formatCurrency(projectedInterest)}원</strong>
            </div>
            <div className="text-base text-emerald-400 font-bold">
              만기 시 총액: {formatCurrency(projectedTotal)}원
            </div>
          </div>
        )}

        <button
          onClick={() => { onConfirm(amount); setAmount(""); }}
          disabled={isProcessing || !amount}
          className={cls.button(isProcessing || !amount) + ' w-full text-[17px] py-4'}
        >
          {isProcessing ? '처리 중...' : '가입하기'}
        </button>
      </div>
    </div>
  );
};

const ParkingAccountSection = ({ balance, dailyInterest, onDeposit, onWithdraw, isProcessing, userCash }) => {
  const [amount, setAmount] = useState("");

  return (
    <div className="bg-gradient-to-br from-[rgba(6,78,117,0.85)] to-[rgba(20,40,60,0.9)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] rounded-2xl p-8 border border-[rgba(0,180,216,0.25)] backdrop-blur-[10px]">
      <div className="flex items-center gap-4 mb-6 pb-5 border-b-2 border-[rgba(0,180,216,0.2)]">
        <Wallet size={32} className="text-cyan-300" />
        <h2 className="text-[26px] font-bold text-[#e0f7fa] tracking-tight drop-shadow-[0_0_10px_rgba(0,255,242,0.3)]">파킹통장</h2>
      </div>

      {/* 보유현금 표시 */}
      <div className="bg-[rgba(0,180,216,0.15)] px-4 py-3 rounded-[10px] mb-4 backdrop-blur-[10px] flex justify-between items-center border border-[rgba(0,180,216,0.2)]">
        <span className="text-base font-medium text-slate-400">보유 현금</span>
        <span className="text-xl font-bold text-[#e0f7fa]">{formatCurrency(userCash || 0)}원</span>
      </div>

      <div className="text-[42px] font-bold text-[#e0f7fa] mb-2">
        {formatCurrency(balance)}원
      </div>

      <p className="text-base text-[#e0f7fa]/80 mb-4 font-medium">
        매일 이자가 자동 지급되는 자유 입출금 통장
      </p>

      <div className="bg-[rgba(0,180,216,0.12)] p-4 rounded-[10px] mb-6 backdrop-blur-[10px] border border-[rgba(0,180,216,0.2)]">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={20} className="text-cyan-300" />
          <span className="text-[15px] font-semibold text-slate-400">일일 이자 수익</span>
        </div>
        <div className="text-[28px] font-bold text-cyan-300">
          +{formatCurrency(dailyInterest)}원/일
        </div>
        <div className="text-sm mt-1.5 text-slate-400/90">
          (일 1% 복리 기준)
        </div>
      </div>

      <div className="flex gap-2.5">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액 입력"
          className="flex-1 py-3.5 px-4 bg-black/30 border border-[rgba(0,180,216,0.3)] rounded-[10px] text-[17px] text-white focus:outline-none focus:border-cyber-cyan"
          disabled={isProcessing}
        />
        <button
          onClick={() => { onDeposit(amount); setAmount(""); }}
          disabled={isProcessing}
          className={cls.button(isProcessing, 'success') + ' text-[17px] px-6 py-3.5'}
        >
          입금
        </button>
        <button
          onClick={() => { onWithdraw(amount); setAmount(""); }}
          disabled={isProcessing}
          className={cls.button(isProcessing) + ' !bg-slate-500/50 text-[17px] px-6 py-3.5'}
        >
          출금
        </button>
      </div>
    </div>
  );
};

// --- Main Component ---
const ParkingAccount = ({
  auth = {},
  depositProducts = [],
  installmentProducts = [],
  loanProducts = [],
  activeView = 'parking',
  onViewChange,
  onLoadUserProducts,
  allUserProducts = [],
  onDeleteUserProduct
}) => {
  const { user, userDoc, loading, refreshUserDocument, isAdmin, addCash, deductCash } = auth;
  const userId = user?.uid;

  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [parkingBalance, setParkingBalance] = useState(0);
  const [parkingDailyInterest, setParkingDailyInterest] = useState(0);
  const [userDeposits, setUserDeposits] = useState([]);
  const [userSavings, setUserSavings] = useState([]);
  const [userLoans, setUserLoans] = useState([]);
  const [modal, setModal] = useState({ isOpen: false, product: null, type: '' });
  const [currentCash, setCurrentCash] = useState(userDoc?.cash || 0);

  const displayMessage = (text, type = "info", duration = 3000) => {
    setMessage(text);
    setMessageType(type);
    if (duration) setTimeout(() => setMessage(null), duration);
  };

  const loadAllData = useCallback(async () => {
    if (!userId) return;
    setIsProcessing(true);
    try {
      // 파킹통장 처리
      const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
      const parkingRateProduct = depositProducts.length > 0 ? depositProducts[0] : null;

      if (parkingRateProduct) {
        const parkingDoc = await getDoc(parkingRef);
        if (parkingDoc.exists()) {
          const data = parkingDoc.data();
          const lastInterestDate = data.lastInterestDate?.toDate();

          if (!lastInterestDate || !isToday(lastInterestDate)) {
            const daysToApply = lastInterestDate ? differenceInDays(new Date(), lastInterestDate) : 1;
            if (daysToApply > 0) {
              const dailyRate = (parkingRateProduct.dailyRate || 0.0027); // 기본 1% 연이율을 일로 환산한 값과 유사하게
              const { interest } = calculateCompoundInterest(data.balance || 0, dailyRate, daysToApply);

              if (interest > 0) {
                await updateDoc(parkingRef, {
                  balance: increment(interest),
                  lastInterestDate: serverTimestamp()
                });
                displayMessage(`파킹통장 이자 ${formatCurrency(interest)}원이 지급되었습니다.`, 'success');
              }
            }
          }
        } else {
          // 파킹통장이 없으면 생성
          await setDoc(parkingRef, {
            balance: 0,
            lastInterestDate: serverTimestamp()
          });
        }
      }

      // 최종 잔액 조회
      const finalParkingDoc = await getDoc(parkingRef);
      if (finalParkingDoc.exists()) {
        const balance = finalParkingDoc.data().balance || 0;
        setParkingBalance(balance);

        // 일일 이자 계산 (1% 기준)
        const dailyRate = 1; // 1% 일일 이자율
        const dailyInterest = calculateDailyInterest(balance, dailyRate);
        setParkingDailyInterest(dailyInterest);
      }

      // 가입 상품 조회
      const productsRef = collection(db, "users", userId, "products");
      const snapshot = await getDocs(productsRef);
      const deposits = [], savings = [], loans = [];

      snapshot.forEach(docSnap => {
        const product = {
          id: docSnap.id,
          ...docSnap.data(),
          maturityDate: docSnap.data().maturityDate?.toDate ? docSnap.data().maturityDate.toDate() : docSnap.data().maturityDate
        };
        if (product.type === 'deposit') deposits.push(product);
        else if (product.type === 'savings') savings.push(product);
        else if (product.type === 'loan') loans.push(product);
      });

      setUserDeposits(deposits);
      setUserSavings(savings);
      setUserLoans(loans);
    } catch (error) {
      logger.error("데이터 로드 오류:", error);
      displayMessage("데이터를 불러오는 데 실패했습니다.", "error");
    } finally {
      setIsProcessing(false);
    }
  }, [userId, depositProducts]);

  useEffect(() => {
    if (!loading && userId) loadAllData();
  }, [userId, loading, loadAllData]);

  // userDoc의 cash가 변경될 때마다 currentCash 업데이트
  useEffect(() => {
    if (userDoc?.cash !== undefined) {
      setCurrentCash(userDoc.cash);
      logger.log("[ParkingAccount] currentCash 업데이트:", userDoc.cash);
    }
  }, [userDoc?.cash]);

  const handleOpenModal = (product, type) => setModal({ isOpen: true, product, type });
  const handleCloseModal = () => setModal({ isOpen: false, product: null, type: '' });

  const handleSubscribe = async (subscribeAmount) => {
    logger.log("--- handleSubscribe 시작 ---");
    const amount = parseFloat(subscribeAmount);
    const { product, type } = modal;

    logger.log("가입할 상품:", product);
    logger.log(`가입 유형: ${type}, 가입 금액: ${amount}`);

    if (isNaN(amount) || amount <= 0) {
      logger.error("유효하지 않은 금액:", subscribeAmount);
      return displayMessage("유효한 금액을 입력하세요.", "error");
    }
    if (product.minAmount && amount < product.minAmount) {
      logger.error(`최소 가입 금액 미달: ${amount} < ${product.minAmount}`);
      return displayMessage(`최소 가입 금액은 ${formatCurrency(product.minAmount)}원입니다.`, "error");
    }
    if (product.maxAmount && amount > product.maxAmount) {
      logger.error(`최대 가입 한도 초과: ${amount} > ${product.maxAmount}`);
      return displayMessage(`최대 가입 한도는 ${formatCurrency(product.maxAmount)}원입니다.`, "error");
    }

    setIsProcessing(true);
    handleCloseModal(); // UX 개선을 위해 모달 즉시 닫기

    // --- 선생님 계정 조회 ---
    const teacherAccount = await getTeacherAccount(userDoc?.classCode);
    if (!teacherAccount) {
      displayMessage("선생님(은행) 계정을 찾을 수 없습니다. 관리자에게 문의하세요.", "error");
      setIsProcessing(false);
      return;
    }
    logger.log("선생님 계정:", teacherAccount.name, teacherAccount.id);

    // --- 낙관적 업데이트 (Optimistic Update) ---
    const tempId = `temp_${Date.now()}`;
    const maturityDate = new Date(Date.now() + product.termInDays * 24 * 60 * 60 * 1000);
    const optimisticProduct = {
      id: tempId,
      name: product.name,
      termInDays: product.termInDays,
      rate: product.dailyRate,
      balance: amount,
      startDate: new Date(),
      maturityDate: maturityDate,
      type: type === 'deposits' ? 'deposit' : (type === 'savings' ? 'savings' : 'loan'),
      isOptimistic: true // 임시 데이터임을 표시
    };

    // 상품 목록 낙관적 업데이트
    if (optimisticProduct.type === 'deposit') {
      setUserDeposits(prev => [...prev, optimisticProduct]);
    } else if (optimisticProduct.type === 'savings') {
      setUserSavings(prev => [...prev, optimisticProduct]);
    } else if (optimisticProduct.type === 'loan') {
      setUserLoans(prev => [...prev, optimisticProduct]);
    }

    // 현금 보유량 낙관적 업데이트
    const cashChangeAmount = type === 'loans' ? amount : -amount;
    setCurrentCash(prev => prev + cashChangeAmount); // 로컬 UI 상태만 먼저 업데이트

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const teacherRef = doc(db, "users", teacherAccount.id);

        const userSnapshot = await transaction.get(userRef);
        const teacherSnapshot = await transaction.get(teacherRef);

        if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
        if (!teacherSnapshot.exists()) throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

        const currentCashInDb = userSnapshot.data()?.cash ?? 0;
        const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;

        // 예금/적금: 학생 현금 확인
        if (type !== 'loans' && currentCashInDb < amount) {
          throw new Error("보유 현금이 부족합니다.");
        }

        // 대출: 선생님(은행) 현금 확인
        if (type === 'loans' && teacherCashInDb < amount) {
          throw new Error("은행(선생님)에 대출 가능한 자금이 부족합니다.");
        }

        const newProductData = {
          name: product.name,
          termInDays: product.termInDays,
          rate: product.dailyRate,
          balance: amount,
          startDate: serverTimestamp(),
          maturityDate: maturityDate,
          type: type === 'deposits' ? 'deposit' : (type === 'savings' ? 'savings' : 'loan'),
          teacherId: teacherAccount.id, // 선생님 계정 ID 저장
          teacherName: teacherAccount.name || '선생님'
        };

        const newProductRef = doc(collection(db, "users", userId, "products"));
        transaction.set(newProductRef, newProductData);

        // 예금/적금: 학생 → 선생님
        // 대출: 선생님 → 학생
        if (type === 'loans') {
          // 대출: 선생님에서 학생으로
          transaction.update(userRef, { cash: increment(amount) });
          transaction.update(teacherRef, { cash: increment(-amount) });
        } else {
          // 예금/적금: 학생에서 선생님으로
          transaction.update(userRef, { cash: increment(-amount) });
          transaction.update(teacherRef, { cash: increment(amount) });
        }
      });

      const actionText = type === 'loans' ? '대출' : '가입';
      displayMessage(`${product.name} ${actionText}이 완료되었습니다. (선생님 계정과 연동)`, "success");

      // 🔥 활동 로그 기록 (예금/적금/대출 가입)
      const activityType = type === 'deposits' ? ACTIVITY_TYPES.DEPOSIT_CREATE
        : type === 'savings' ? ACTIVITY_TYPES.DEPOSIT_CREATE
          : ACTIVITY_TYPES.LOAN_CREATE;
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: activityType,
        description: `${product.name} ${type === 'loans' ? '대출' : '가입'} (${formatCurrency(amount)}원) - 선생님 계정 연동`,
        amount: cashChangeAmount,
        metadata: {
          productName: product.name,
          productType: type,
          termInDays: product.termInDays,
          dailyRate: product.dailyRate,
          maturityDate: maturityDate.toISOString(),
          teacherId: teacherAccount.id,
          teacherName: teacherAccount.name
        }
      });

      // 서버 데이터로 다시 로드하여 낙관적 업데이트 결과 교체
      await loadAllData();
      if (refreshUserDocument) refreshUserDocument();

    } catch (error) {
      logger.error("가입 처리 중 오류 발생:", error);
      displayMessage(`처리 오류: ${error.message}`, "error");

      // --- 낙관적 업데이트 롤백 ---
      if (optimisticProduct.type === 'deposit') {
        setUserDeposits(prev => prev.filter(p => p.id !== tempId));
      } else if (optimisticProduct.type === 'savings') {
        setUserSavings(prev => prev.filter(p => p.id !== tempId));
      } else if (optimisticProduct.type === 'loan') {
        setUserLoans(prev => prev.filter(p => p.id !== tempId));
      }

      // 현금 롤백 (로컬 UI)
      setCurrentCash(prev => prev - cashChangeAmount);

    } finally {
      setIsProcessing(false);
    }
  };

  // 만기 수령
  const handleMaturity = async (product) => {
    logger.log("--- handleMaturity 시작 ---");
    logger.log("처리할 상품:", product);

    const { id, name, type, balance, termInDays, rate, teacherId } = product;
    const isLoan = type === 'loan';

    if (!userId) {
      displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
      logger.error("handleMaturity: userId가 없습니다.");
      return;
    }

    const dailyRate = rate;
    const { total, interest } = calculateCompoundInterest(balance, dailyRate, termInDays);

    logger.log(`계산 결과: 원금=${balance}, 이자=${interest}, 총액=${total}`);

    const confirmMsg = isLoan
      ? `대출 만기 상환: 원금 ${formatCurrency(balance)}원 + 이자 ${formatCurrency(interest)}원 = ${formatCurrency(total)}원을 상환하시겠습니까?`
      : `만기 수령: 원금 ${formatCurrency(balance)}원 + 이자 ${formatCurrency(interest)}원 = ${formatCurrency(total)}원을 수령하시겠습니까?`;

    if (!window.confirm(confirmMsg)) {
      logger.log("사용자가 만기 처리를 취소했습니다.");
      return;
    }

    setIsProcessing(true);
    logger.log("만기 처리 시작...");

    // 선생님 계정 조회 (저장된 teacherId 사용 또는 새로 조회)
    let teacherAccountId = teacherId;
    if (!teacherAccountId) {
      const teacherAccount = await getTeacherAccount(userDoc?.classCode);
      if (!teacherAccount) {
        displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
        setIsProcessing(false);
        return;
      }
      teacherAccountId = teacherAccount.id;
    }
    logger.log("선생님 계정 ID:", teacherAccountId);

    try {
      const productRef = doc(db, "users", userId, "products", String(id));
      logger.log("Firestore 문서 참조:", productRef.path);

      await runTransaction(db, async (transaction) => {
        logger.log("트랜잭션 시작");
        const userRef = doc(db, "users", userId);
        const teacherRef = doc(db, "users", teacherAccountId);

        const userSnapshot = await transaction.get(userRef);
        const teacherSnapshot = await transaction.get(teacherRef);

        if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
        if (!teacherSnapshot.exists()) throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

        const currentCashInDb = userSnapshot.data()?.cash ?? 0;
        const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;

        if (isLoan) {
          // 대출 만기 상환: 학생 → 선생님 (원금+이자)
          if (currentCashInDb < total) {
            throw new Error(`상환금이 부족합니다. (필요: ${formatCurrency(total)}원, 보유: ${formatCurrency(currentCashInDb)}원)`);
          }
          transaction.update(userRef, { cash: increment(-total) });
          transaction.update(teacherRef, { cash: increment(total) });
          logger.log(`대출 상환: 학생 -${total}, 선생님 +${total}`);
        } else {
          // 예금/적금 만기 수령: 선생님 → 학생 (원금+이자)
          if (teacherCashInDb < total) {
            throw new Error(`은행(선생님)에 지급할 자금이 부족합니다. (필요: ${formatCurrency(total)}원)`);
          }
          transaction.update(userRef, { cash: increment(total) });
          transaction.update(teacherRef, { cash: increment(-total) });
          logger.log(`만기 수령: 학생 +${total}, 선생님 -${total}`);
        }

        transaction.delete(productRef);
        logger.log("상품 문서 삭제 예약");
        logger.log("트랜잭션 커밋 시도");
      });

      logger.log("트랜잭션 성공");

      const successMsg = isLoan
        ? `대출 상환 완료: ${formatCurrency(total)}원 (선생님 계정으로 이체)`
        : `만기 수령 완료: ${formatCurrency(total)}원 (선생님 계정에서 지급)`;
      displayMessage(successMsg, "success");

      // 🔥 활동 로그 기록 (예금 만기 / 대출 상환)
      const activityType = isLoan ? ACTIVITY_TYPES.LOAN_REPAY : ACTIVITY_TYPES.DEPOSIT_MATURITY;
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: activityType,
        description: isLoan
          ? `대출 만기 상환: ${name} (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(interest)}) - 선생님 계정으로`
          : `${name} 만기 수령 (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(interest)}) - 선생님 계정에서`,
        amount: isLoan ? -total : total,
        metadata: {
          productName: name,
          productType: type,
          principal: balance,
          interest,
          total,
          teacherId: teacherAccountId
        }
      });

      // 백그라운드에서 userDoc 갱신
      if (refreshUserDocument) {
        logger.log("userDoc 갱신 시작");
        refreshUserDocument().then(() => {
          logger.log("[ParkingAccount] 만기 처리 후 userDoc 갱신 완료");
        });
      }

      logger.log("전체 데이터 다시 로드");
      await loadAllData();

    } catch (error) {
      logger.error("만기 처리 중 오류 발생:", error);
      displayMessage(`처리 오류: ${error.message}`, "error");
      // 에러 발생 시 currentCash 롤백
      if (userDoc?.cash !== undefined) {
        logger.log("오류 발생으로 현금 롤백:", userDoc.cash);
        setCurrentCash(userDoc.cash);
      }
    } finally {
      setIsProcessing(false);
      logger.log("--- handleMaturity 종료 ---");
    }
  };

  // 중도 해지
  const handleCancelEarly = async (product) => {
    logger.log("--- handleCancelEarly 시작 ---");
    logger.log("중도 해지할 상품:", product);

    const { id, name, type, balance } = product;
    const isLoan = type === 'loan';

    if (!userId) {
      displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
      logger.error("handleCancelEarly: userId가 없습니다.");
      return;
    }

    const confirmMessage = isLoan
      ? `대출금 ${formatCurrency(balance)}원을 상환하시겠습니까?`
      : `'${name}'을(를) 중도 해지하시겠습니까? (이자 없이 원금만 반환됩니다)`;

    if (!window.confirm(confirmMessage)) {
      logger.log("사용자가 중도 해지를 취소했습니다.");
      return;
    }

    setIsProcessing(true);
    logger.log("중도 해지 처리 시작...");

    // 선생님 계정 조회 (저장된 teacherId 사용 또는 새로 조회)
    const teacherId = product.teacherId;
    let teacherAccountId = teacherId;
    if (!teacherAccountId) {
      const teacherAccount = await getTeacherAccount(userDoc?.classCode);
      if (!teacherAccount) {
        displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
        setIsProcessing(false);
        return;
      }
      teacherAccountId = teacherAccount.id;
    }
    logger.log("선생님 계정 ID:", teacherAccountId);

    // --- 낙관적 업데이트 (Optimistic Update) ---
    const originalProducts = {
      deposit: [...userDeposits],
      savings: [...userSavings],
      loan: [...userLoans]
    };
    const originalCash = currentCash;

    const cashChangeAmount = isLoan ? -balance : balance;
    setCurrentCash(prev => prev + cashChangeAmount);

    if (type === 'deposit') {
      setUserDeposits(prev => prev.filter(p => p.id !== id));
    } else if (type === 'savings') {
      setUserSavings(prev => prev.filter(p => p.id !== id));
    } else if (type === 'loan') {
      setUserLoans(prev => prev.filter(p => p.id !== id));
    }

    try {
      const productRef = doc(db, "users", userId, "products", String(id));
      logger.log("Firestore 문서 참조:", productRef.path);

      await runTransaction(db, async (transaction) => {
        logger.log("트랜잭션 시작");
        const userRef = doc(db, "users", userId);
        const teacherRef = doc(db, "users", teacherAccountId);

        const userSnapshot = await transaction.get(userRef);
        const teacherSnapshot = await transaction.get(teacherRef);

        if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
        if (!teacherSnapshot.exists()) throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

        const currentCashInDb = userSnapshot.data()?.cash ?? 0;
        const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;
        logger.log(`현재 보유 현금 (DB): ${currentCashInDb}, 선생님 보유 현금: ${teacherCashInDb}`);

        if (isLoan) {
          // 대출 중도 상환: 학생 → 선생님 (원금만)
          if (currentCashInDb < balance) {
            throw new Error("대출금을 상환하기에 현금이 부족합니다.");
          }
          transaction.update(userRef, { cash: increment(-balance) });
          transaction.update(teacherRef, { cash: increment(balance) });
          logger.log(`대출 중도 상환: 학생 -${balance}, 선생님 +${balance}`);
        } else {
          // 예금/적금 중도 해지: 선생님 → 학생 (원금만, 이자 없음)
          if (teacherCashInDb < balance) {
            throw new Error(`은행(선생님)에 지급할 자금이 부족합니다. (필요: ${formatCurrency(balance)}원)`);
          }
          transaction.update(userRef, { cash: increment(balance) });
          transaction.update(teacherRef, { cash: increment(-balance) });
          logger.log(`중도 해지: 학생 +${balance}, 선생님 -${balance}`);
        }

        transaction.delete(productRef);
        logger.log("상품 문서 삭제 예약");
        logger.log("트랜잭션 커밋 시도");
      });

      logger.log("트랜잭션 성공");

      const successMsg = isLoan
        ? `대출 상환 완료: ${formatCurrency(balance)}원 (선생님 계정으로 이체)`
        : `중도 해지 완료: 원금 ${formatCurrency(balance)}원 반환 (선생님 계정에서 지급)`;
      displayMessage(successMsg, "success");

      // 🔥 활동 로그 기록 (중도 해지 / 대출 상환)
      const activityType = isLoan ? ACTIVITY_TYPES.LOAN_REPAY : ACTIVITY_TYPES.DEPOSIT_WITHDRAW;
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: activityType,
        description: isLoan
          ? `대출 중도 상환: ${name} (${formatCurrency(balance)}원) - 선생님 계정으로`
          : `중도 해지: ${name} (원금 ${formatCurrency(balance)}원) - 선생님 계정에서`,
        amount: cashChangeAmount,
        metadata: {
          productName: name,
          productType: type,
          principal: balance,
          isEarlyCancellation: true,
          teacherId: teacherAccountId
        }
      });

      // 백그라운드에서 userDoc 갱신
      if (refreshUserDocument) {
        logger.log("userDoc 갱신 시작");
        refreshUserDocument();
      }
      await loadAllData();

    } catch (error) {
      logger.error("중도 해지 처리 중 오류 발생:", error);
      displayMessage(`처리 오류: ${error.message}`, "error");

      // --- 낙관적 업데이트 롤백 ---
      setUserDeposits(originalProducts.deposit);
      setUserSavings(originalProducts.savings);
      setUserLoans(originalProducts.loan);
      setCurrentCash(originalCash);

    } finally {
      setIsProcessing(false);
      logger.log("--- handleCancelEarly 종료 ---");
    }
  };

  const handleParkingDeposit = async (amountStr) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return displayMessage("유효한 금액을 입력하세요.", "error");

    setIsProcessing(true);
    const previousParkingBalance = parkingBalance; // Store for rollback
    const previousCurrentCash = currentCash; // Store for rollback

    // Optimistically update UI for parking balance
    setParkingBalance(prev => prev + amount);

    try {
      // 먼저 사용자 현금 차감 (AuthContext의 deductCash 사용)
      const cashDeducted = await deductCash(amount, `파킹통장 입금: ${formatCurrency(amount)}원`);
      if (!cashDeducted) {
        throw new Error("보유 현금 차감에 실패했습니다.");
      }

      await runTransaction(db, async (transaction) => {
        const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
        const parkingSnapshot = await transaction.get(parkingRef);

        if (parkingSnapshot.exists()) {
          transaction.update(parkingRef, { balance: increment(amount) });
        } else {
          transaction.set(parkingRef, { balance: amount, lastInterestDate: serverTimestamp() });
        }
      });

      displayMessage(`${formatCurrency(amount)}원 입금 완료.`, "success");

      // 🔥 활동 로그 기록 (파킹통장 입금)
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: ACTIVITY_TYPES.PARKING_DEPOSIT,
        description: `파킹통장 입금 ${formatCurrency(amount)}원`,
        amount: -amount,
        metadata: { parkingBalance: parkingBalance + amount }
      });

      await loadAllData(); // Reconcile parkingBalance and other products
    } catch (error) {
      displayMessage(`처리 오류: ${error.message}`, "error");
      // Rollback UI on error
      setParkingBalance(previousParkingBalance);
      setCurrentCash(previousCurrentCash);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParkingWithdraw = async (amountStr) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return displayMessage("유효한 금액을 입력하세요.", "error");

    setIsProcessing(true);
    const previousParkingBalance = parkingBalance; // Store for rollback
    const previousCurrentCash = currentCash; // Store for rollback

    // Optimistically update UI for parking balance
    setParkingBalance(prev => prev - amount);

    try {
      await runTransaction(db, async (transaction) => {
        const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
        const parkingSnapshot = await transaction.get(parkingRef);
        const currentParkingBalance = parkingSnapshot.data()?.balance ?? 0;

        if (currentParkingBalance < amount) throw new Error("파킹통장 잔액이 부족합니다.");

        transaction.update(parkingRef, { balance: increment(-amount) });
      });

      // 사용자 현금 추가 (AuthContext의 addCash 사용)
      const cashAdded = await addCash(amount, `파킹통장 출금: ${formatCurrency(amount)}원`);
      if (!cashAdded) {
        throw new Error("보유 현금 추가에 실패했습니다.");
      }

      displayMessage(`${formatCurrency(amount)}원 출금 완료.`, "success");

      // 🔥 활동 로그 기록 (파킹통장 출금)
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: ACTIVITY_TYPES.PARKING_WITHDRAW,
        description: `파킹통장 출금 ${formatCurrency(amount)}원`,
        amount: amount,
        metadata: { parkingBalance: parkingBalance - amount }
      });

      await loadAllData(); // Reconcile parkingBalance and other products
    } catch (error) {
      displayMessage(`처리 오류: ${error.message}`, "error");
      // Rollback UI on error
      setParkingBalance(previousParkingBalance);
      setCurrentCash(previousCurrentCash);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminDeleteSubscribedProduct = async (product) => {
    if (!isAdmin()) {
      displayMessage("관리자 권한이 필요합니다.", "error");
      return;
    }

    if (!window.confirm(`정말로 이 상품(${product.name})을 강제로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const productRef = doc(db, "users", product.userId, "products", product.id);
      await deleteDoc(productRef);
      displayMessage("상품이 강제로 삭제되었습니다.", "success");
      loadAllData();
    } catch (error) {
      logger.error("관리자 상품 삭제 중 오류:", error);
      displayMessage(`삭제 처리 오류: ${error.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className={cls.container}>금융 정보를 불러오는 중입니다...</div>;
  if (!user) return <div className={cls.container}>로그인이 필요합니다.</div>;

  const mainTabClass = (isActive) => `px-6 py-3 border-none cursor-pointer text-[17px] rounded-t-lg transition-all duration-200 -mb-0.5 ${
    isActive
      ? 'bg-cyber-cyan/10 font-bold text-cyber-cyan border-b-[3px] border-b-cyber-cyan'
      : 'font-medium text-slate-400 border-b-[3px] border-b-transparent'
  }`;

  return (
    <div className={cls.container}>
      {/* 탭 메뉴 */}
      <div className="flex gap-2.5 mb-6 border-b-2 border-white/10 relative">
        <button
          onClick={() => onViewChange && onViewChange('parking')}
          className={mainTabClass(activeView === 'parking')}
        >
          나의 금융 현황
        </button>
        {isAdmin && isAdmin() && (
          <>
            <button
              onClick={() => onViewChange && onViewChange('admin')}
              className={mainTabClass(activeView === 'admin')}
            >
              상품 관리
            </button>
            <button
              onClick={() => {
                if (onViewChange) onViewChange('userProducts');
                if (onLoadUserProducts) onLoadUserProducts();
              }}
              className={mainTabClass(activeView === 'userProducts')}
            >
              유저 상품 조회
            </button>
          </>
        )}
      </div>

      {message && <div className={cls.message(messageType)}>{message}</div>}

      {/* 유저 상품 조회 화면 */}
      {activeView === 'userProducts' && isAdmin && isAdmin() && (
        <div className="bg-[rgba(20,20,35,0.6)] rounded-2xl p-8 shadow-[0_6px_20px_rgba(0,0,0,0.3)] border border-white/5">
          <h2 className="text-2xl font-bold mb-4 text-white">
            유저별 가입 상품 조회 및 관리
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            클래스 내 모든 유저의 가입 상품을 조회하고 필요시 강제 삭제할 수 있습니다.
          </p>

          {allUserProducts.length === 0 ? (
            <p className="text-center p-10 text-slate-400">
              가입된 상품이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b-2 border-white/10">
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">사용자</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">상품명</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">종류</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">잔액/금액</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">금리(일)</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">기간(일)</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">만기일</th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-400">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {allUserProducts.map((product, index) => {
                    const typeLabel = product.type === 'deposit' ? '예금' :
                      product.type === 'savings' ? '적금' :
                        product.type === 'loan' ? '대출' : '기타';
                    return (
                      <tr key={`${product.userId}-${product.id}-${index}`} className="border-b border-white/5">
                        <td className="p-3 text-sm text-slate-200">{product.userName}</td>
                        <td className="p-3 text-sm text-slate-200">{product.name}</td>
                        <td className="p-3 text-sm text-slate-200">{typeLabel}</td>
                        <td className="p-3 text-sm text-cyber-cyan">{formatKoreanCurrency(product.balance || 0)}원</td>
                        <td className="p-3 text-sm text-slate-200">{product.rate}%</td>
                        <td className="p-3 text-sm text-slate-200">{product.termInDays}일</td>
                        <td className="p-3 text-sm text-slate-200">
                          {product.maturityDate
                            ? new Date(product.maturityDate).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => onDeleteUserProduct && onDeleteUserProduct(product)}
                            className={cls.button(false, 'danger') + ' text-xs px-3 py-1.5'}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-5 text-right text-slate-400 text-sm">
                총 {allUserProducts.length}개의 상품
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기존 금융 현황 화면 */}
      {activeView === 'parking' && (
        <div className={cls.grid}>
          <ParkingAccountSection
            balance={parkingBalance}
            dailyInterest={parkingDailyInterest}
            onDeposit={handleParkingDeposit}
            onWithdraw={handleParkingWithdraw}
            isProcessing={isProcessing}
            userCash={currentCash}
          />
          <ProductSection
            title="예금"
            icon={ICON_MAP.deposits}
            subscribedProducts={userDeposits}
            availableProducts={depositProducts}
            onSubscribe={(p) => handleOpenModal(p, 'deposits')}
            onCancel={handleCancelEarly}
            onMaturity={handleMaturity}
            isAdmin={isAdmin()}
            onAdminDelete={handleAdminDeleteSubscribedProduct}
          />
          <ProductSection
            title="적금"
            icon={ICON_MAP.savings}
            subscribedProducts={userSavings}
            availableProducts={installmentProducts}
            onSubscribe={(p) => handleOpenModal(p, 'savings')}
            onCancel={handleCancelEarly}
            onMaturity={handleMaturity}
            isAdmin={isAdmin()}
            onAdminDelete={handleAdminDeleteSubscribedProduct}
          />
          <ProductSection
            title="대출"
            icon={ICON_MAP.loans}
            subscribedProducts={userLoans}
            availableProducts={loanProducts}
            onSubscribe={(p) => handleOpenModal(p, 'loans')}
            onCancel={handleCancelEarly}
            onMaturity={handleMaturity}
            isAdmin={isAdmin()}
            onAdminDelete={handleAdminDeleteSubscribedProduct}
          />
        </div>
      )}
      <SubscriptionModal
        isOpen={modal.isOpen}
        onClose={handleCloseModal}
        product={modal.product}
        onConfirm={handleSubscribe}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default ParkingAccount;
