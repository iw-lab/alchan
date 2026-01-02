// src/ParkingAccount.js
import React, { useState, useEffect, useCallback } from "react";
import { db, doc, getDoc, setDoc, serverTimestamp, updateDoc, increment, runTransaction, collection, getDocs, deleteDoc } from "../../firebase";
import { format, isToday, differenceInDays, isPast } from 'date-fns';
import { PiggyBank, Landmark, HandCoins, Wallet, X, TrendingUp } from 'lucide-react';
import { formatKoreanCurrency } from '../../numberFormatter';
import { logActivity, ACTIVITY_TYPES } from '../../utils/firestoreHelpers';

// --- Styles ---
// --- Styles ---
const styles = {
  container: {
    fontFamily: 'sans-serif',
    backgroundColor: 'transparent',
    padding: '32px',
    minHeight: 'auto'
  },
  message: (type) => ({
    padding: '16px 20px',
    borderRadius: '12px',
    marginBottom: '28px',
    textAlign: 'center',
    fontSize: '16px',
    fontWeight: '500',
    color: type === 'error' ? '#f87171' : '#34d399',
    backgroundColor: type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: `1px solid ${type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
  }),
  grid: {
    display: 'grid',
    gap: '28px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  card: {
    backgroundColor: 'rgba(20, 20, 35, 0.6)',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2)',
    borderRadius: '16px',
    padding: '32px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(10px)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '2px solid rgba(255, 255, 255, 0.05)'
  },
  cardTitle: {
    fontSize: '26px',
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: '-0.5px',
    textShadow: '0 0 10px rgba(0, 255, 242, 0.3)'
  },
  tabContainer: {
    display: 'flex',
    borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '20px',
    gap: '8px'
  },
  tabButton: (isActive) => ({
    padding: '12px 24px',
    border: 'none',
    background: isActive ? 'rgba(99, 102, 241, 0.2)' : 'none',
    cursor: 'pointer',
    fontSize: '17px',
    fontWeight: isActive ? '700' : '500',
    color: isActive ? '#00fff2' : '#94a3b8',
    borderBottom: `3px solid ${isActive ? '#00fff2' : 'transparent'}`,
    marginBottom: '-2px',
    borderRadius: '8px 8px 0 0',
    transition: 'all 0.2s ease',
    textShadow: isActive ? '0 0 5px rgba(0, 255, 242, 0.3)' : 'none'
  }),
  button: (disabled, variant = 'primary') => ({
    backgroundColor: variant === 'primary' ? 'rgba(3, 105, 161, 0.8)' : (variant === 'danger' ? 'rgba(220, 38, 38, 0.8)' : (variant === 'success' ? 'rgba(5, 150, 105, 0.8)' : '#4b5563')),
    color: 'white',
    padding: '12px 20px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontSize: '15px',
    fontWeight: '600',
    boxShadow: disabled ? 'none' : '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
    ':hover': !disabled && {
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
      filter: 'brightness(1.1)'
    }
  }),
  noProduct: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: '32px 0',
    fontSize: '16px',
    fontStyle: 'italic'
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    marginBottom: '16px',
    fontSize: '16px',
    color: 'white',
    transition: 'border-color 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: '#00fff2',
      boxShadow: '0 0 0 2px rgba(0, 255, 242, 0.1)'
    }
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(8px)'
  },
  modalContent: {
    background: '#1a1a2e',
    padding: '32px',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '450px',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#e2e8f0'
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#fff',
    textShadow: '0 0 10px rgba(0, 255, 242, 0.3)'
  },
  modalCloseBtn: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    transition: 'color 0.2s ease',
    ':hover': {
      color: '#fff'
    }
  },
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
  parking: <Wallet size={28} style={{ color: '#0369a1' }} />,
  deposits: <Landmark size={28} style={{ color: '#059669' }} />,
  savings: <PiggyBank size={28} style={{ color: '#7c3aed' }} />,
  loans: <HandCoins size={28} style={{ color: '#dc2626' }} />,
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
    <div style={{
      padding: '20px',
      border: `2px solid ${isMatured ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
      borderRadius: '12px',
      marginBottom: '16px',
      background: isMatured ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.2)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '18px', color: '#e2e8f0', marginBottom: '4px' }}>{product.name}</div>
          {isMatured && <span style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600'
          }}>만기</span>}
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', color: '#00fff2' }}>{formatCurrency(product.balance)}원</span>
      </div>

      <div style={{ fontSize: '15px', color: '#94a3b8', marginTop: '16px', display: 'grid', gap: '10px', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '500' }}>금리 (일):</span>
          <span style={{ fontWeight: '700', color: '#00fff2' }}>{product.rate}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '500' }}>일일 이자:</span>
          <span style={{ fontWeight: '700', color: '#34d399' }}>+{formatCurrency(dailyInterestAmount)}원/일</span>
        </div>
        {product.maturityDate && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '500' }}>만기일:</span>
              <span style={{ fontWeight: '600', color: '#e2e8f0' }}>{format(product.maturityDate, 'yyyy-MM-dd')}</span>
            </div>
            {!isMatured && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '500' }}>남은 기간:</span>
                <span style={{ fontWeight: '600', color: '#00fff2' }}>{daysRemaining}일</span>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', margin: '16px 0' }}></div>

      <div style={{ fontSize: '15px', color: '#e2e8f0', display: 'grid', gap: '10px', backgroundColor: 'rgba(0, 255, 242, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 255, 242, 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '600' }}>만기 시 이자 (세전):</span>
          <span style={{ fontWeight: '700', color: '#34d399', fontSize: '17px' }}>+{formatCurrency(interest)}원</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px' }}>
          <span style={{ fontWeight: '700' }}>만기 시 총액:</span>
          <span style={{ fontWeight: '700', color: '#00fff2' }}>{formatCurrency(total)}원</span>
        </div>
      </div>

      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        {isMatured ? (
          <button
            onClick={onMaturity}
            style={{ ...styles.button(false, 'success'), padding: '10px 20px', fontSize: '15px' }}
          >
            만기 수령 ({formatCurrency(total)}원)
          </button>
        ) : (
          <button
            onClick={onCancel}
            style={{ ...styles.button(false, 'danger'), padding: '10px 20px', fontSize: '15px' }}
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
    <div style={{
      padding: '20px',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      marginBottom: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'rgba(0, 0, 0, 0.2)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      transition: 'all 0.2s ease'
    }}>
      <div>
        <div style={{ fontWeight: '700', fontSize: '18px', color: '#e2e8f0', marginBottom: '8px' }}>{product.name}</div>
        <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '6px' }}>
          <strong style={{ color: '#00fff2' }}>일 {product.dailyRate}%</strong> (기간: {product.termInDays}일)
        </div>
        <div style={{ fontSize: '14px', color: '#34d399', fontWeight: '600' }}>
          <TrendingUp size={14} style={{ display: 'inline', marginRight: '4px' }} />
          10만원 가입 시 예상 이자: +{formatCurrency(projectedInterest)}원
        </div>
      </div>
      <button
        onClick={onSubscribe}
        style={{ ...styles.button(false), padding: '12px 24px', fontSize: '16px' }}
      >
        가입
      </button>
    </div>
  );
};

const ProductSection = ({ title, icon, subscribedProducts, availableProducts, onSubscribe, onCancel, onMaturity }) => {
  const [activeTab, setActiveTab] = useState('subscribed');
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        {icon}
        <h2 style={styles.cardTitle}>{title}</h2>
      </div>
      <div style={styles.tabContainer}>
        <button
          onClick={() => setActiveTab('subscribed')}
          style={styles.tabButton(activeTab === 'subscribed')}
        >
          가입한 상품
        </button>
        <button
          onClick={() => setActiveTab('available')}
          style={styles.tabButton(activeTab === 'available')}
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
            : <p style={styles.noProduct}>가입한 상품이 없습니다.</p>
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
            : <p style={styles.noProduct}>가입 가능한 상품이 없습니다.</p>
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
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={styles.modalCloseBtn}><X size={24} /></button>
        <h3 style={styles.modalTitle}>{product.name} 가입</h3>

        <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'rgba(0, 255, 242, 0.05)', borderRadius: '10px', border: '1px solid rgba(0, 255, 242, 0.2)' }}>
          <div style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '8px' }}>
            <strong style={{ color: '#00fff2' }}>금리:</strong> 일 {product.dailyRate}% (일복리)
          </div>
          <div style={{ fontSize: '15px', color: '#94a3b8' }}>
            <strong style={{ color: '#00fff2' }}>기간:</strong> {product.termInDays}일
          </div>
        </div>

        <p style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#e2e8f0' }}>가입 금액을 입력해주세요</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={styles.input}
          placeholder={`${formatCurrency(product.minAmount || 0)}원 이상`}
          autoFocus
        />

        {numAmount > 0 && (
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ fontSize: '15px', color: '#34d399', marginBottom: '6px' }}>
              예상 만기 이자: <strong>+{formatCurrency(projectedInterest)}원</strong>
            </div>
            <div style={{ fontSize: '16px', color: '#34d399', fontWeight: '700' }}>
              만기 시 총액: {formatCurrency(projectedTotal)}원
            </div>
          </div>
        )}

        <button
          onClick={() => { onConfirm(amount); setAmount(""); }}
          disabled={isProcessing || !amount}
          style={{ ...styles.button(isProcessing || !amount), width: '100%', fontSize: '17px', padding: '16px' }}
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
    <div style={{
      ...styles.card,
      background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
      color: 'white',
      boxShadow: '0 8px 24px rgba(3, 105, 161, 0.3)'
    }}>
      <div style={{ ...styles.cardHeader, borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
        <Wallet size={32} style={{ color: 'white' }} />
        <h2 style={{ ...styles.cardTitle, color: 'white' }}>파킹통장</h2>
      </div>

      {/* 보유현금 표시 추가 */}
      <div style={{
        backgroundColor: 'rgba(255,255,255,0.15)',
        padding: '12px 16px',
        borderRadius: '10px',
        marginBottom: '16px',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: '16px', fontWeight: '500', opacity: 0.9 }}>보유 현금</span>
        <span style={{ fontSize: '20px', fontWeight: '700' }}>{formatCurrency(userCash || 0)}원</span>
      </div>

      <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
        {formatCurrency(balance)}원
      </div>

      <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', marginBottom: '16px', fontWeight: '500' }}>
        매일 이자가 자동 지급되는 자유 입출금 통장
      </p>

      <div style={{
        backgroundColor: 'rgba(255,255,255,0.15)',
        padding: '16px',
        borderRadius: '10px',
        marginBottom: '24px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <TrendingUp size={20} />
          <span style={{ fontSize: '15px', fontWeight: '600' }}>일일 이자 수익</span>
        </div>
        <div style={{ fontSize: '28px', fontWeight: '700' }}>
          +{formatCurrency(dailyInterest)}원/일
        </div>
        <div style={{ fontSize: '14px', marginTop: '6px', opacity: 0.9 }}>
          (일 1% 복리 기준)
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액 입력"
          style={{
            ...styles.input,
            marginBottom: 0,
            fontSize: '17px',
            flex: 1
          }}
          disabled={isProcessing}
        />
        <button
          onClick={() => { onDeposit(amount); setAmount(""); }}
          disabled={isProcessing}
          style={{
            ...styles.button(isProcessing, 'success'),
            fontSize: '17px',
            padding: '14px 24px'
          }}
        >
          입금
        </button>
        <button
          onClick={() => { onWithdraw(amount); setAmount(""); }}
          disabled={isProcessing}
          style={{
            ...styles.button(isProcessing),
            backgroundColor: 'rgba(255,255,255,0.25)',
            color: 'white',
            fontSize: '17px',
            padding: '14px 24px'
          }}
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
      console.error("데이터 로드 오류:", error);
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
      console.log("[ParkingAccount] currentCash 업데이트:", userDoc.cash);
    }
  }, [userDoc?.cash]);

  const handleOpenModal = (product, type) => setModal({ isOpen: true, product, type });
  const handleCloseModal = () => setModal({ isOpen: false, product: null, type: '' });

  const handleSubscribe = async (subscribeAmount) => {
    console.log("--- handleSubscribe 시작 ---");
    const amount = parseFloat(subscribeAmount);
    const { product, type } = modal;

    console.log("가입할 상품:", product);
    console.log(`가입 유형: ${type}, 가입 금액: ${amount}`);

    if (isNaN(amount) || amount <= 0) {
      console.error("유효하지 않은 금액:", subscribeAmount);
      return displayMessage("유효한 금액을 입력하세요.", "error");
    }
    if (product.minAmount && amount < product.minAmount) {
      console.error(`최소 가입 금액 미달: ${amount} < ${product.minAmount}`);
      return displayMessage(`최소 가입 금액은 ${formatCurrency(product.minAmount)}원입니다.`, "error");
    }
    if (product.maxAmount && amount > product.maxAmount) {
      console.error(`최대 가입 한도 초과: ${amount} > ${product.maxAmount}`);
      return displayMessage(`최대 가입 한도는 ${formatCurrency(product.maxAmount)}원입니다.`, "error");
    }

    setIsProcessing(true);
    handleCloseModal(); // UX 개선을 위해 모달 즉시 닫기

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
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");

        const currentCashInDb = userSnapshot.data()?.cash ?? 0;
        if (type !== 'loans' && currentCashInDb < amount) {
          throw new Error("보유 현금이 부족합니다.");
        }

        const newProductData = {
          name: product.name,
          termInDays: product.termInDays,
          rate: product.dailyRate,
          balance: amount,
          startDate: serverTimestamp(),
          maturityDate: maturityDate,
          type: type === 'deposits' ? 'deposit' : (type === 'savings' ? 'savings' : 'loan'),
        };

        const newProductRef = doc(collection(db, "users", userId, "products"));
        transaction.set(newProductRef, newProductData);
        transaction.update(userRef, { cash: increment(cashChangeAmount) });
      });

      displayMessage("상품 가입이 완료되었습니다.", "success");

      // 🔥 활동 로그 기록 (예금/적금/대출 가입)
      const activityType = type === 'deposits' ? ACTIVITY_TYPES.DEPOSIT_CREATE
        : type === 'savings' ? ACTIVITY_TYPES.DEPOSIT_CREATE
          : ACTIVITY_TYPES.LOAN_CREATE;
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: activityType,
        description: `${product.name} 가입 (${formatCurrency(amount)}원)`,
        amount: cashChangeAmount,
        metadata: {
          productName: product.name,
          productType: type,
          termInDays: product.termInDays,
          dailyRate: product.dailyRate,
          maturityDate: maturityDate.toISOString()
        }
      });

      // 서버 데이터로 다시 로드하여 낙관적 업데이트 결과 교체
      await loadAllData();
      if (refreshUserDocument) refreshUserDocument();

    } catch (error) {
      console.error("가입 처리 중 오류 발생:", error);
      displayMessage(`가입 처리 오류: ${error.message}`, "error");

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
    console.log("--- handleMaturity 시작 ---");
    console.log("처리할 상품:", product);

    const { id, name, type, balance, termInDays, rate } = product;
    const isLoan = type === 'loan';

    if (!userId) {
      displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
      console.error("handleMaturity: userId가 없습니다.");
      return;
    }

    const dailyRate = rate;
    const { total, interest } = calculateCompoundInterest(balance, dailyRate, termInDays);

    console.log(`계산 결과: 원금=${balance}, 이자=${interest}, 총액=${total}`);

    if (!window.confirm(`만기 수령: 원금 ${formatCurrency(balance)}원 + 이자 ${formatCurrency(interest)}원 = ${formatCurrency(total)}원을 수령하시겠습니까?`)) {
      console.log("사용자가 만기 수령을 취소했습니다.");
      return;
    }

    setIsProcessing(true);
    console.log("만기 처리 시작...");

    try {
      const productRef = doc(db, "users", userId, "products", String(id));
      console.log("Firestore 문서 참조:", productRef.path);

      await runTransaction(db, async (transaction) => {
        console.log("트랜잭션 시작");
        const userRef = doc(db, "users", userId);

        // 대출인 경우 상환, 예적금인 경우 수령
        const cashChange = isLoan ? -total : total;
        console.log(`현금 변경: ${cashChange}`);

        transaction.update(userRef, { cash: increment(cashChange) });
        console.log("사용자 현금 업데이트 예약");

        transaction.delete(productRef);
        console.log("상품 문서 삭제 예약");
        console.log("트랜잭션 커밋 시도");
      });

      console.log("트랜잭션 성공");

      displayMessage(`만기 수령 완료: ${formatCurrency(total)}원`, "success");

      // 🔥 활동 로그 기록 (예금 만기)
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: ACTIVITY_TYPES.DEPOSIT_MATURITY,
        description: `${name} 만기 수령 (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(interest)})`,
        amount: total,
        metadata: {
          productName: name,
          productType: type,
          principal: balance,
          interest,
          total
        }
      });

      // 백그라운드에서 userDoc 갱신
      if (refreshUserDocument) {
        console.log("userDoc 갱신 시작");
        refreshUserDocument().then(() => {
          console.log("[ParkingAccount] 만기 수령 후 userDoc 갱신 완료");
        });
      }

      console.log("전체 데이터 다시 로드");
      await loadAllData();

    } catch (error) {
      console.error("만기 처리 중 오류 발생:", error);
      displayMessage(`처리 오류: ${error.message}`, "error");
      // 에러 발생 시 currentCash 롤백
      if (userDoc?.cash !== undefined) {
        console.log("오류 발생으로 현금 롤백:", userDoc.cash);
        setCurrentCash(userDoc.cash);
      }
    } finally {
      setIsProcessing(false);
      console.log("--- handleMaturity 종료 ---");
    }
  };

  // 중도 해지
  const handleCancelEarly = async (product) => {
    console.log("--- handleCancelEarly 시작 ---");
    console.log("중도 해지할 상품:", product);

    const { id, name, type, balance } = product;
    const isLoan = type === 'loan';

    if (!userId) {
      displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
      console.error("handleCancelEarly: userId가 없습니다.");
      return;
    }

    const confirmMessage = isLoan
      ? `대출금 ${formatCurrency(balance)}원을 상환하시겠습니까?`
      : `'${name}'을(를) 중도 해지하시겠습니까? (이자 없이 원금만 반환됩니다)`;

    if (!window.confirm(confirmMessage)) {
      console.log("사용자가 중도 해지를 취소했습니다.");
      return;
    }

    setIsProcessing(true);
    console.log("중도 해지 처리 시작...");

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
      console.log("Firestore 문서 참조:", productRef.path);

      await runTransaction(db, async (transaction) => {
        console.log("트랜잭션 시작");
        const userRef = doc(db, "users", userId);
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists()) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }
        const currentCashInDb = userSnapshot.data()?.cash ?? 0;
        console.log(`현재 보유 현금 (DB): ${currentCashInDb}`);

        if (isLoan && currentCashInDb < balance) {
          throw new Error("대출금을 상환하기에 현금이 부족합니다.");
        }

        transaction.update(userRef, { cash: increment(cashChangeAmount) });
        console.log(`사용자 현금 변경 (${cashChangeAmount}) 예약`);

        transaction.delete(productRef);
        console.log("상품 문서 삭제 예약");
        console.log("트랜잭션 커밋 시도");
      });

      console.log("트랜잭션 성공");

      displayMessage(`${isLoan ? '대출 상환' : '중도 해지'} 완료. 원금 ${formatCurrency(balance)}원이 반환되었습니다.`, "success");

      // 🔥 활동 로그 기록 (중도 해지 / 대출 상환)
      const activityType = isLoan ? ACTIVITY_TYPES.LOAN_REPAY : ACTIVITY_TYPES.DEPOSIT_WITHDRAW;
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: userId,
        userName: userDoc?.name || '사용자',
        type: activityType,
        description: isLoan
          ? `대출 상환: ${name} (${formatCurrency(balance)}원)`
          : `중도 해지: ${name} (원금 ${formatCurrency(balance)}원 반환)`,
        amount: cashChangeAmount,
        metadata: {
          productName: name,
          productType: type,
          principal: balance,
          isEarlyCancellation: true
        }
      });

      // 백그라운드에서 userDoc 갱신
      if (refreshUserDocument) {
        console.log("userDoc 갱신 시작");
        refreshUserDocument();
      }
      await loadAllData();

    } catch (error) {
      console.error("중도 해지 처리 중 오류 발생:", error);
      displayMessage(`처리 오류: ${error.message}`, "error");

      // --- 낙관적 업데이트 롤백 ---
      setUserDeposits(originalProducts.deposit);
      setUserSavings(originalProducts.savings);
      setUserLoans(originalProducts.loan);
      setCurrentCash(originalCash);

    } finally {
      setIsProcessing(false);
      console.log("--- handleCancelEarly 종료 ---");
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
      console.error("관리자 상품 삭제 중 오류:", error);
      displayMessage(`삭제 처리 오류: ${error.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div style={styles.container}>금융 정보를 불러오는 중입니다...</div>;
  if (!user) return <div style={styles.container}>로그인이 필요합니다.</div>;

  return (
    <div style={styles.container}>
      {/* 탭 메뉴 */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '24px',
        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
        paddingBottom: '0',
        position: 'relative'
      }}>
        <button
          onClick={() => onViewChange && onViewChange('parking')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: activeView === 'parking' ? 'rgba(0, 255, 242, 0.1)' : 'none',
            cursor: 'pointer',
            fontSize: '17px',
            fontWeight: activeView === 'parking' ? '700' : '500',
            color: activeView === 'parking' ? '#00fff2' : '#94a3b8',
            borderBottom: `3px solid ${activeView === 'parking' ? '#00fff2' : 'transparent'}`,
            marginBottom: '-2px',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s ease'
          }}
        >
          나의 금융 현황
        </button>
        {isAdmin && isAdmin() && (
          <>
            <button
              onClick={() => onViewChange && onViewChange('admin')}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: activeView === 'admin' ? 'rgba(0, 255, 242, 0.1)' : 'none',
                cursor: 'pointer',
                fontSize: '17px',
                fontWeight: activeView === 'admin' ? '700' : '500',
                color: activeView === 'admin' ? '#00fff2' : '#94a3b8',
                borderBottom: `3px solid ${activeView === 'admin' ? '#00fff2' : 'transparent'}`,
                marginBottom: '-2px',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s ease'
              }}
            >
              상품 관리
            </button>
            <button
              onClick={() => {
                if (onViewChange) onViewChange('userProducts');
                if (onLoadUserProducts) onLoadUserProducts();
              }}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: activeView === 'userProducts' ? 'rgba(0, 255, 242, 0.1)' : 'none',
                cursor: 'pointer',
                fontSize: '17px',
                fontWeight: activeView === 'userProducts' ? '700' : '500',
                color: activeView === 'userProducts' ? '#00fff2' : '#94a3b8',
                borderBottom: `3px solid ${activeView === 'userProducts' ? '#00fff2' : 'transparent'}`,
                marginBottom: '-2px',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s ease'
              }}
            >
              유저 상품 조회
            </button>
          </>
        )}
      </div>

      {message && <div style={styles.message(messageType)}>{message}</div>}

      {/* 유저 상품 조회 화면 */}
      {activeView === 'userProducts' && isAdmin && isAdmin() && (
        <div style={{
          backgroundColor: 'rgba(20, 20, 35, 0.6)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#fff' }}>
            유저별 가입 상품 조회 및 관리
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '20px' }}>
            클래스 내 모든 유저의 가입 상품을 조회하고 필요시 강제 삭제할 수 있습니다.
          </p>

          {allUserProducts.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              가입된 상품이 없습니다.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>사용자</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>상품명</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>종류</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>잔액/금액</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>금리(일)</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>기간(일)</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>만기일</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {allUserProducts.map((product, index) => {
                    const typeLabel = product.type === 'deposit' ? '예금' :
                      product.type === 'savings' ? '적금' :
                        product.type === 'loan' ? '대출' : '기타';
                    return (
                      <tr key={`${product.userId}-${product.id}-${index}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>{product.userName}</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>{product.name}</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>{typeLabel}</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#00fff2' }}>{formatKoreanCurrency(product.balance || 0)}원</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>{product.rate}%</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>{product.termInDays}일</td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#e2e8f0' }}>
                          {product.maturityDate
                            ? new Date(product.maturityDate).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => onDeleteUserProduct && onDeleteUserProduct(product)}
                            style={{
                              ...styles.button(false, 'danger'),
                              fontSize: '12px',
                              padding: '6px 12px'
                            }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                총 {allUserProducts.length}개의 상품
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기존 금융 현황 화면 */}
      {activeView === 'parking' && (
        <div style={styles.grid}>
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
