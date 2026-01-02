import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import "./StockExchange.css";
import { formatKoreanCurrency } from '../../numberFormatter';
import { useAuth } from "../../contexts/AuthContext";
import { db, functions } from "../../firebase";
import { applyStockTax } from "../../utils/taxUtils";
// 🔥 자동 상장/폐지: Firebase Functions에서 처리 (10분마다)
import { httpsCallable } from "firebase/functions";
import { usePolling, POLLING_INTERVALS } from "../../hooks/usePolling";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
  runTransaction,
  where,
  collectionGroup,
} from "firebase/firestore";

import { globalCache, cacheStats } from "../../services/globalCacheService";
import { logActivity, ACTIVITY_TYPES } from "../../utils/firestoreHelpers";

// === 배치 데이터 로딩 시스템 ===
const batchDataLoader = {
  pendingRequests: new Map(),

  // 배치로 여러 데이터를 한 번에 로드
  loadBatchData: async function (classCode, userId, forceRefresh = false) {
    const batchKey = globalCache.generateKey('BATCH', { classCode, userId });

    if (!forceRefresh) {
      const cached = globalCache.get(batchKey);
      if (cached) {
        console.log('[batchDataLoader] Cache HIT - 캐시된 데이터 사용');
        return cached;
      }
    } else {
      console.log('[batchDataLoader] forceRefresh=true - 캐시 무시하고 서버에서 로드');
      // 강제 새로고침 시 캐시 무효화
      globalCache.invalidate(batchKey);
    }

    // 이미 같은 배치 요청이 진행 중이면 대기
    if (this.pendingRequests.has(batchKey)) {
      return await this.pendingRequests.get(batchKey);
    }

    const batchPromise = this._executeBatchLoad(classCode, userId);
    this.pendingRequests.set(batchKey, batchPromise);

    try {
      const result = await batchPromise;
      globalCache.set(batchKey, result, 30 * 60 * 1000); // 🔥 [최적화] 30분 캐시 - 거래 시 강제 무효화되므로 안전
      return result;
    } finally {
      this.pendingRequests.delete(batchKey);
    }
  },

  _executeBatchLoad: async function (classCode, userId) {
    const [stocks, portfolio] = await Promise.all([
      this._loadStocks(classCode),
      this._loadPortfolio(userId, classCode),
    ]);

    return {
      stocks: stocks || [],
      portfolio: portfolio || [],
      errors: []
    };
  },

  _loadStocks: async function (classCode) {
    try {
      // 1) Cloud Function 우선: Firestore Rules 우회 + 단일 호출
      try {
        const getSnapshotFn = httpsCallable(functions, 'getStocksSnapshot');
        const result = await getSnapshotFn({});
        if (result.data && Array.isArray(result.data.stocks) && result.data.stocks.length > 0) {
          return result.data.stocks;
        }
      } catch (fnError) {
        console.warn('[batchDataLoader] 스냅샷 함수 호출 실패, 문서/쿼리 폴백 시도:', fnError);
      }

      // 2) 스냅샷 문서 직접 읽기 (권한 허용 시)
      try {
        const cacheRef = doc(db, "Settings", "centralStocksCache");
        const cacheDoc = await getDoc(cacheRef);
        const cacheData = cacheDoc.exists() ? cacheDoc.data() : null;

        if (cacheData && Array.isArray(cacheData.stocks) && cacheData.stocks.length > 0) {
          return cacheData.stocks;
        }
      } catch (snapshotError) {
        console.warn('[batchDataLoader] 스냅샷 문서 읽기 실패:', snapshotError);
      }

      // 3) 최종 폴백: 컬렉션 쿼리
      const stocksRef = collection(db, "CentralStocks");
      const q = query(stocksRef, where("isListed", "==", true));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('[batchDataLoader] Stocks load error:', error);
      return [];
    }
  },

  _loadPortfolio: async function (userId, classCode) {
    try {
      const portfolioRef = collection(db, "users", userId, "portfolio");
      const q = query(portfolioRef, where("classCode", "==", classCode));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // 🔥 Timestamp를 Date로 변환하여 캐시 호환성 확보
          lastBuyTime: data.lastBuyTime?.toDate ? data.lastBuyTime.toDate() : data.lastBuyTime,
          delistedAt: data.delistedAt?.toDate ? data.delistedAt.toDate() : data.delistedAt,
        };
      });
    } catch (error) {
      console.error('[batchDataLoader] Portfolio load error:', error);
      return [];
    }
  },


};

// 🔥 [최적화] 실시간 marketState 계산 함수 (서버 데이터 의존성 제거)
// 주식 심볼을 기반으로 현재 시간에서 장중/장마감 상태를 계산
const getRealtimeMarketState = (stock) => {
  // 실시간 주식이 아니면 null 반환
  if (!stock?.isRealStock) {
    return null;
  }

  // realStockData에 이미 서버에서 계산된 marketState가 있으면 그것을 사용
  if (stock.realStockData?.marketState) {
    return stock.realStockData.marketState;
  }

  // realStockData가 없으면 null 반환
  return null;
};

// marketState를 한글로 변환
const getMarketStateLabel = (stock) => {
  const state = getRealtimeMarketState(stock);
  if (!state) return null;

  switch (state) {
    case 'REGULAR': return '장중';
    case 'PRE': return '장전';
    case 'POST': return '장후';
    default: return '장마감';
  }
};

// === 아이콘 컴포넌트들 ===
const TrendingUp = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>
);
const TrendingDown = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="22,17 13.5,8.5 8.5,13.5 2,7" /><polyline points="16,17 22,17 22,11" /></svg>
);
const Settings = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17.5-3.5L19 10m-2 2l-2.5 2.5M6.5 6.5L9 9m-2 2l-2.5 2.5" /></svg>
);
const RefreshCw = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L20.49 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L3.51 14"></path></svg>
);
const BarChart3 = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
);
const ChevronDown = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
);
const ChevronUp = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
);
const Lock = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);

// === 상수 및 유틸리티 함수들 ===
const PRODUCT_TYPES = {
  STOCK: "stock",
  ETF: "etf",
  BOND: "bond"
};

const SECTORS = {
  TECH: { name: "기술" },
  FINANCE: { name: "금융" },
  CONSUMER: { name: "소비재" },
  HEALTHCARE: { name: "헬스케어" },
  ENERGY: { name: "에너지" },
  INDUSTRIAL: { name: "산업" },
  MATERIALS: { name: "소재" },
  REALESTATE: { name: "부동산" },
  UTILITIES: { name: "유틸리티" },
  COMMUNICATION: { name: "통신" },
  ENTERTAINMENT: { name: "엔터테인먼트" },
  INDEX: { name: "지수" },
  GOVERNMENT: { name: "국채" },
  CORPORATE: { name: "회사채" }
};

const HOLDING_LOCK_PERIOD = 60 * 60 * 1000; // 1시간 (60분)
const COMMISSION_RATE = 0.003;
const TAX_RATE = 0.22;
const BOND_TAX_RATE = 0.154;

const CACHE_TTL = {
  BATCH_DATA: 1000 * 60 * 30, // 🔥 [최적화] 30분 캐시 - 실시간 주가가 15분 주기이므로 2사이클 캐시
  STOCKS: 1000 * 60 * 30, // 30분 (가격 반영 주기 2배)
  PORTFOLIO: 1000 * 60 * 30, // 🔥 거래 시 forceRefresh로 즉시 무효화하므로 기본 주기는 30분
  MARKET_STATUS: 1000 * 60 * 120, // 120분 (시장 상태는 거의 변경되지 않음)
};

// === 유틸리티 함수들 ===
const formatCurrency = (amount) => {
  if (typeof amount !== "number" || isNaN(amount)) return "0원";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + "원";
};

const formatPercent = (percent) => {
  const num = parseFloat(percent);
  if (isNaN(num)) return "0.00%";
  return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
};

const calculateStockTax = (profit, productType = PRODUCT_TYPES.STOCK) => {
  if (profit <= 0) return 0;
  if (productType === PRODUCT_TYPES.BOND) {
    return Math.round(profit * BOND_TAX_RATE);
  }
  return Math.round(profit * TAX_RATE);
};

// 배치 처리를 위한 국고 업데이트 최적화
const treasuryUpdateQueue = new Map();
const updateNationalTreasury = async (amount, type, classCode) => {
  if (amount <= 0 || !classCode) return;

  const key = `${classCode}_${type}`;
  const existing = treasuryUpdateQueue.get(key) || { amount: 0, type, classCode };
  existing.amount += amount;
  treasuryUpdateQueue.set(key, existing);

  // 배치 처리를 위해 지연
  setTimeout(() => processTreasuryQueue(), 1000);
};

const processTreasuryQueue = async () => {
  if (treasuryUpdateQueue.size === 0) return;

  const batch = writeBatch(db);
  const updates = Array.from(treasuryUpdateQueue.values());
  treasuryUpdateQueue.clear();

  for (const { amount, type, classCode } of updates) {
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    const updateData = {
      totalAmount: increment(amount),
      lastUpdated: serverTimestamp(),
    };

    if (type === 'tax') {
      updateData.stockTaxRevenue = increment(amount);
    } else if (type === 'commission') {
      updateData.stockCommissionRevenue = increment(amount);
    }

    batch.update(treasuryRef, updateData, { merge: true });
  }

  try {
    await batch.commit();
  } catch (error) {
    // 실패한 업데이트들을 다시 큐에 추가
    updates.forEach(update => {
      const key = `${update.classCode}_${update.type}`;
      treasuryUpdateQueue.set(key, update);
    });
  }
};

const calculateMarketIndex = (stocks) => {
  if (!stocks || stocks.length === 0) return 1000;
  const listedStocks = stocks.filter(s => s && s.isListed && s.productType === PRODUCT_TYPES.STOCK);
  if (listedStocks.length === 0) return 1000;

  const totalMarketCap = listedStocks.reduce((sum, stock) => {
    const shares = 1000;
    return sum + (stock.price * shares);
  }, 0);

  const baseMarketCap = listedStocks.reduce((sum, stock) => {
    const shares = 1000;
    const basePrice = stock.initialPrice || stock.minListingPrice || stock.price;
    return sum + (basePrice * shares);
  }, 0);

  if (baseMarketCap === 0) return 1000;

  return Math.round((totalMarketCap / baseMarketCap) * 1000);
};

const canSellHolding = (holding) => {
  if (!holding.lastBuyTime) return true;

  // 🔥 Date 객체, Timestamp, 문자열 모두 처리
  let lastBuyTimeMs;
  if (holding.lastBuyTime instanceof Date) {
    lastBuyTimeMs = holding.lastBuyTime.getTime();
  } else if (holding.lastBuyTime?.toDate) {
    lastBuyTimeMs = holding.lastBuyTime.toDate().getTime();
  } else if (typeof holding.lastBuyTime === 'number') {
    lastBuyTimeMs = holding.lastBuyTime;
  } else if (typeof holding.lastBuyTime === 'string') {
    lastBuyTimeMs = new Date(holding.lastBuyTime).getTime();
  } else {
    return true; // 알 수 없는 형식이면 매도 가능
  }

  const timeSinceBuy = Date.now() - lastBuyTimeMs;
  return timeSinceBuy >= HOLDING_LOCK_PERIOD;
};

const getRemainingLockTime = (holding) => {
  if (!holding.lastBuyTime) return 0;

  // 🔥 Date 객체, Timestamp, 문자열 모두 처리
  let lastBuyTimeMs;
  if (holding.lastBuyTime instanceof Date) {
    lastBuyTimeMs = holding.lastBuyTime.getTime();
  } else if (holding.lastBuyTime?.toDate) {
    lastBuyTimeMs = holding.lastBuyTime.toDate().getTime();
  } else if (typeof holding.lastBuyTime === 'number') {
    lastBuyTimeMs = holding.lastBuyTime;
  } else if (typeof holding.lastBuyTime === 'string') {
    lastBuyTimeMs = new Date(holding.lastBuyTime).getTime();
  } else {
    return 0; // 알 수 없는 형식이면 0 반환
  }

  const now = Date.now();
  const timeSinceBuy = now - lastBuyTimeMs;
  const remaining = HOLDING_LOCK_PERIOD - timeSinceBuy;

  return Math.max(0, remaining);
};

const formatTime = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}분 ${remainingSeconds}초`;
};

const getProductIcon = (productType) => {
  switch (productType) {
    case PRODUCT_TYPES.ETF: return "📊";
    case PRODUCT_TYPES.BOND: return "📜";
    default: return "📈";
  }
};

const getProductBadgeClass = (productType) => {
  switch (productType) {
    case PRODUCT_TYPES.ETF: return "etf";
    case PRODUCT_TYPES.BOND: return "bond";
    default: return "stock";
  }
};

// === 캐시 무효화 함수 ===
const invalidateCache = (pattern) => {
  // globalCache.invalidatePattern 메서드 사용 (더 안전함)
  if (globalCache && typeof globalCache.invalidatePattern === 'function') {
    globalCache.invalidatePattern(pattern);
  }
};

// 🔥 [최적화] localStorage BATCH 캐시 일괄 삭제 헬퍼
const clearLocalStorageBatchCache = () => {
  try {
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('BATCH')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => {
      localStorage.removeItem(key);
    });
    if (keysToDelete.length > 0) {
      console.log('[캐시] localStorage BATCH 캐시 삭제:', keysToDelete.length, '개');
    }
  } catch (error) {
    console.warn('[캐시] localStorage 정리 오류:', error);
  }
};

// === 개별 실제 주식 추가 컴포넌트 ===
const RealStockAdder = React.memo(({ onAddStock }) => {
  const [showForm, setShowForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', symbol: '', sector: 'TECH', productType: 'stock' });

  const commonStocks = [
    { name: '삼성전자', symbol: '005930.KS', type: '한국 주식' },
    { name: 'SK하이닉스', symbol: '000660.KS', type: '한국 주식' },
    { name: 'LG에너지솔루션', symbol: '373220.KS', type: '한국 주식' },
    { name: 'NAVER', symbol: '035420.KS', type: '한국 주식' },
    { name: '카카오', symbol: '035720.KS', type: '한국 주식' },
    { name: '현대차', symbol: '005380.KS', type: '한국 주식' },
    { name: 'Apple', symbol: 'AAPL', type: '미국 주식' },
    { name: 'Microsoft', symbol: 'MSFT', type: '미국 주식' },
    { name: 'Google', symbol: 'GOOGL', type: '미국 주식' },
    { name: 'Tesla', symbol: 'TSLA', type: '미국 주식' },
    { name: 'NVIDIA', symbol: 'NVDA', type: '미국 주식' },
    { name: 'Amazon', symbol: 'AMZN', type: '미국 주식' },
    { name: 'KODEX 200', symbol: '069500.KS', type: '한국 ETF' },
    { name: 'KODEX 레버리지', symbol: '122630.KS', type: '한국 ETF' },
    { name: 'TIGER 미국S&P500', symbol: '360750.KS', type: '한국 ETF' },
    { name: 'SPY', symbol: 'SPY', type: '미국 ETF (S&P500)' },
    { name: 'QQQ', symbol: 'QQQ', type: '미국 ETF (나스닥100)' },
    { name: 'TLT', symbol: 'TLT', type: '채권 ETF (미국 장기국채)' },
    { name: 'GLD', symbol: 'GLD', type: '원자재 ETF (금)' },
  ];

  const handleQuickAdd = async (stock) => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAddStock({ name: stock.name, symbol: stock.symbol });
      alert(`${stock.name} 추가 완료!`);
    } catch (error) {
      alert('추가 실패: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCustomAdd = async () => {
    if (!formData.name || !formData.symbol) {
      alert('이름과 심볼을 모두 입력해주세요.');
      return;
    }
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAddStock(formData);
      alert(`${formData.name} 추가 완료!`);
      setFormData({ name: '', symbol: '', sector: 'TECH', productType: 'stock' });
      setShowForm(false);
    } catch (error) {
      alert('추가 실패: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div style={{ marginTop: '10px' }}>
      <button onClick={() => setShowForm(!showForm)} className="btn btn-secondary" style={{ width: '100%', marginBottom: '10px' }}>
        {showForm ? '접기' : '➕ 개별 주식/ETF 추가'}
      </button>
      {showForm && (
        <div style={{ background: 'rgba(20, 20, 35, 0.8)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '10px' }}>
            📌 빠른 추가 (클릭하면 바로 추가됩니다)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '15px' }}>
            {commonStocks.map(stock => (
              <button
                key={stock.symbol}
                onClick={() => handleQuickAdd(stock)}
                disabled={isAdding}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  background: stock.type.includes('ETF') ? 'rgba(59, 130, 246, 0.2)' : stock.type.includes('채권') ? 'rgba(245, 158, 11, 0.2)' : stock.type.includes('원자재') ? 'rgba(236, 72, 153, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  border: stock.type.includes('ETF') ? '1px solid rgba(59, 130, 246, 0.3)' : stock.type.includes('채권') ? '1px solid rgba(245, 158, 11, 0.3)' : stock.type.includes('원자재') ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title={`${stock.type} - ${stock.symbol}`}
              >
                {stock.name}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
            ✏️ 직접 입력 (Yahoo Finance 심볼 사용)
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="이름 (예: 삼성전자)"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              style={{ flex: 1, minWidth: '120px', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
            />
            <input
              type="text"
              placeholder="심볼 (예: 005930.KS)"
              value={formData.symbol}
              onChange={e => setFormData(p => ({ ...p, symbol: e.target.value }))}
              style={{ flex: 1, minWidth: '120px', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
            />
            <button onClick={handleCustomAdd} disabled={isAdding} className="btn btn-success" style={{ padding: '8px 16px' }}>
              {isAdding ? '추가 중...' : '추가'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '8px' }}>
            💡 한국 주식: 종목코드.KS (예: 005930.KS) | 미국 주식: 티커 (예: AAPL, TSLA)
          </p>
        </div>
      )}
    </div>
  );
});

// === 관리자 패널 컴포넌트 ===
const AdminPanel = React.memo(({ stocks, classCode, onClose, onAddStock, onDeleteStock, onEditStock, onToggleManualStock, cacheStats, onManualUpdate, onCreateRealStocks, onUpdateRealStocks, onAddSingleRealStock, onDeleteSimulationStocks }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCreatingRealStocks, setIsCreatingRealStocks] = useState(false);
  const [isUpdatingRealStocks, setIsUpdatingRealStocks] = useState(false);
  const [isDeletingSimulation, setIsDeletingSimulation] = useState(false);
  const [newStock, setNewStock] = useState({
    name: "",
    price: "",
    minListingPrice: "",
    isManual: false,
    sector: "TECH",
    productType: PRODUCT_TYPES.STOCK,
    maturityYears: "",
    couponRate: ""
  });

  const handleManualUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onManualUpdate();
      alert("주식 가격 업데이트 완료!");
    } catch (error) {
      alert("업데이트 실패: " + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateRealStocks = async () => {
    if (!window.confirm("실제 주식 데이터(삼성전자, 애플 등)를 생성하시겠습니까?\n(Yahoo Finance에서 실시간 가격을 가져옵니다)")) {
      return;
    }
    if (isCreatingRealStocks) return;
    setIsCreatingRealStocks(true);
    try {
      await onCreateRealStocks();
      alert("실제 주식이 생성되었습니다! 15분마다 자동으로 가격이 업데이트됩니다.");
    } catch (error) {
      alert("실제 주식 생성 실패: " + error.message);
    } finally {
      setIsCreatingRealStocks(false);
    }
  };

  const handleUpdateRealStocks = async () => {
    if (isUpdatingRealStocks) return;
    setIsUpdatingRealStocks(true);
    try {
      await onUpdateRealStocks();
      alert("실제 주식 가격이 업데이트되었습니다!");
    } catch (error) {
      alert("실제 주식 업데이트 실패: " + error.message);
    } finally {
      setIsUpdatingRealStocks(false);
    }
  };

  const handleDeleteSimulationStocks = async () => {
    if (!window.confirm("⚠️ 모든 시뮬레이션 주식을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.\n(실제 주식은 유지됩니다)")) {
      return;
    }
    if (isDeletingSimulation) return;
    setIsDeletingSimulation(true);
    try {
      await onDeleteSimulationStocks();
      alert("시뮬레이션 주식이 삭제되었습니다!");
    } catch (error) {
      alert("삭제 실패: " + error.message);
    } finally {
      setIsDeletingSimulation(false);
    }
  };

  const handleAddStock = async () => {
    if (!newStock.name || !newStock.price || !newStock.minListingPrice) return alert("모든 필드를 입력해주세요.");
    const price = parseFloat(newStock.price);
    const minPrice = parseFloat(newStock.minListingPrice);
    if (price <= 0 || minPrice <= 0) return alert("가격은 0보다 커야 합니다.");

    const stockData = {
      name: newStock.name,
      price,
      minListingPrice: minPrice,
      isListed: true,
      isManual: newStock.isManual,
      sector: newStock.sector,
      productType: newStock.productType,
      buyVolume: 0,
      sellVolume: 0,
      recentBuyVolume: 0,
      recentSellVolume: 0,
      volatility: newStock.productType === PRODUCT_TYPES.BOND ? 0.005 : 0.02
    };

    if (newStock.productType === PRODUCT_TYPES.BOND) {
      stockData.maturityYears = parseFloat(newStock.maturityYears) || 10;
      stockData.couponRate = parseFloat(newStock.couponRate) || 3.5;
      stockData.sector = "GOVERNMENT";
    }

    if (newStock.productType === PRODUCT_TYPES.ETF) {
      stockData.sector = "INDEX";
    }

    await onAddStock(stockData);
    setNewStock({ name: "", price: "", minListingPrice: "", isManual: false, sector: "TECH", productType: PRODUCT_TYPES.STOCK, maturityYears: "", couponRate: "" });
    setShowAddForm(false);
  };

  return (
    <div className="admin-panel-fullscreen">
      <div className="admin-header">
        <h2><Settings size={24} /> 관리자 패널 ({classCode})</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            캐시 통계: 적중 {cacheStats.hits}, 누락 {cacheStats.misses}, 절약 {cacheStats.savings}회
          </div>
          <button onClick={onClose} className="btn btn-danger">닫기</button>
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-section">
          <h3>📊 실제 주식 관리 (Yahoo Finance)</h3>
          <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <p style={{ marginBottom: '10px', color: '#34d399', fontSize: '0.9rem' }}>
              🌐 실제 주식 데이터를 Yahoo Finance에서 가져옵니다.<br />
              📈 삼성전자, SK하이닉스, 애플, 테슬라, ETF, 채권 ETF 등 지원<br />
              ⏰ 15분마다 자동으로 가격이 업데이트됩니다. | 💱 환율: 하루 1회 자동 업데이트
            </p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <button
                onClick={handleCreateRealStocks}
                disabled={isCreatingRealStocks}
                className="btn btn-success"
                style={{ flex: 1, padding: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}
              >
                {isCreatingRealStocks ? '⏳ 생성 중...' : '🏢 기본 주식 생성'}
              </button>
              <button
                onClick={handleUpdateRealStocks}
                disabled={isUpdatingRealStocks}
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}
              >
                {isUpdatingRealStocks ? '⏳ 업데이트 중...' : '🔄 가격 즉시 업데이트'}
              </button>
            </div>
            <RealStockAdder onAddStock={onAddSingleRealStock} />
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={handleDeleteSimulationStocks}
                disabled={isDeletingSimulation}
                className="btn btn-danger"
                style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
              >
                {isDeletingSimulation ? '⏳ 삭제 중...' : '🗑️ 시뮬레이션 주식 전체 삭제'}
              </button>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '5px', textAlign: 'center' }}>
                ⚠️ 실제 주식(실시간)만 남기고 가상 주식을 모두 삭제합니다
              </p>
            </div>
          </div>
        </div>
        <div className="admin-section">
          <h3><BarChart3 size={20} /> 상품 목록 관리</h3>
          <div className="admin-stock-list">
            {stocks.map(stock => (
              <div key={stock.id} className="admin-stock-item">
                <div className="admin-stock-info">
                  <span className="stock-name">
                    {getProductIcon(stock.productType)} {stock.name}
                    {stock.isRealStock && <span style={{ marginLeft: '6px', background: '#10b981', color: 'white', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>실시간</span>}
                  </span>
                  <span className="stock-details">
                    {formatCurrency(stock.price)} | {SECTORS[stock.sector]?.name || '기타'} | {stock.isListed ? '상장' : '상장폐지'} | {stock.isManual ? '수동' : stock.isRealStock ? '실시간' : '자동'}
                    {stock.productType === PRODUCT_TYPES.BOND && ` | 만기: ${stock.maturityYears}년 | 이자율: ${stock.couponRate}%`}
                  </span>
                </div>
                <div className="form-actions">
                  <button onClick={() => onEditStock(stock.id)} className="btn btn-primary">가격 수정</button>
                  <button onClick={() => onToggleManualStock(stock.id, stock.isListed)} className={`btn ${stock.isListed ? 'btn-secondary' : 'btn-success'}`}>{stock.isListed ? '상장폐지' : '재상장'}</button>
                  <button onClick={() => onDeleteStock(stock.id, stock.name)} className="btn btn-danger">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-section">
          <h3>새 상품 추가</h3>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary">{showAddForm ? '취소' : '새 상품 추가 양식 열기'}</button>
          {showAddForm && (
            <div className="add-stock-form">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">상품 유형</label>
                  <select value={newStock.productType} onChange={e => setNewStock(p => ({ ...p, productType: e.target.value }))} className="form-input">
                    <option value={PRODUCT_TYPES.STOCK}>주식</option>
                    <option value={PRODUCT_TYPES.ETF}>ETF/지수</option>
                    <option value={PRODUCT_TYPES.BOND}>채권</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">상품명</label>
                  <input type="text" value={newStock.name} onChange={e => setNewStock(p => ({ ...p, name: e.target.value }))} className="form-input"
                    placeholder={newStock.productType === PRODUCT_TYPES.BOND ? "예: 국고채 10년" : newStock.productType === PRODUCT_TYPES.ETF ? "예: KOSPI 200" : "예: 삼성전자"} />
                </div>
                <div className="form-group">
                  <label className="form-label">초기 가격</label>
                  <input type="number" value={newStock.price} onChange={e => setNewStock(p => ({ ...p, price: e.target.value }))} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">최소 상장가</label>
                  <input type="number" value={newStock.minListingPrice} onChange={e => setNewStock(p => ({ ...p, minListingPrice: e.target.value }))} className="form-input" />
                </div>
                {newStock.productType === PRODUCT_TYPES.STOCK && (
                  <div className="form-group">
                    <label className="form-label">섹터</label>
                    <select value={newStock.sector} onChange={e => setNewStock(p => ({ ...p, sector: e.target.value }))} className="form-input">
                      {Object.entries(SECTORS).filter(([key]) => !['INDEX', 'GOVERNMENT', 'CORPORATE'].includes(key)).map(([key, value]) => (
                        <option key={key} value={key}>{value.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {newStock.productType === PRODUCT_TYPES.BOND && (
                  <>
                    <div className="form-group">
                      <label className="form-label">만기 (년)</label>
                      <input type="number" value={newStock.maturityYears} onChange={e => setNewStock(p => ({ ...p, maturityYears: e.target.value }))} className="form-input" placeholder="예: 10" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">표면이자율 (%)</label>
                      <input type="number" step="0.1" value={newStock.couponRate} onChange={e => setNewStock(p => ({ ...p, couponRate: e.target.value }))} className="form-input" placeholder="예: 3.5" />
                    </div>
                  </>
                )}
                <div className="form-group checkbox-group">
                  <input type="checkbox" checked={newStock.isManual} onChange={e => setNewStock(p => ({ ...p, isManual: e.target.checked }))} id="isManualCheckbox" className="checkbox-input" />
                  <label htmlFor="isManualCheckbox">수동 관리 (자동 가격 변동 제외)</label>
                </div>
              </div>
              <div className="form-actions">
                <button onClick={handleAddStock} className="btn btn-success">상품 추가</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// === 메인 컴포넌트 ===
const StockExchange = () => {
  const { user, userDoc, isAdmin, loading: authLoading, firebaseReady, functions, optimisticUpdate, refreshUserDocument } = useAuth();

  const [classCode, setClassCode] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [buyQuantities, setBuyQuantities] = useState({});
  const [sellQuantities, setSellQuantities] = useState({});
  const [isTrading, setIsTrading] = useState(false);
  const [lockTimers, setLockTimers] = useState({});
  const [activeTab, setActiveTab] = useState("stocks");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);

  // 🔥 방학 모드 상태 (슈퍼관리자 전용)
  const [vacationMode, setVacationMode] = useState(false);
  const [vacationLoading, setVacationLoading] = useState(false);

  // 성능 최적화를 위한 상태 추가
  const [cacheStatus, setCacheStatus] = useState({ hits: 0, misses: 0, savings: 0 });
  const [lastBatchLoad, setLastBatchLoad] = useState(null);

  const lastFetchTimeRef = useRef({
    stocks: 0,
    portfolio: 0,
    marketStatus: 0,
    batchLoad: 0
  });

  // 🔥 fetching 상태를 ref로 관리 (무한 루프 방지)
  const isFetchingRef = useRef(false);

  // 시장 개장 상태를 1분마다 확인하여 marketOpen 상태를 안정적으로 업데이트 (자동 폴링 시작 버그 수정)
  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();

      // 한국 시장 시간 체크 (09:00 ~ 15:30 KST)
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const kstDay = koreaTime.getDay();
      const kstHour = koreaTime.getHours();
      const kstMinute = koreaTime.getMinutes();
      const kstTotalMinutes = kstHour * 60 + kstMinute;
      const isKoreaWeekday = kstDay >= 1 && kstDay <= 5;
      const isKoreaMarketOpen = isKoreaWeekday && kstTotalMinutes >= 9 * 60 && kstTotalMinutes < 15 * 60 + 30;

      // 미국 시장 시간 체크 (09:30 ~ 16:00 EST/EDT)
      const usTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const usDay = usTime.getDay();
      const usHour = usTime.getHours();
      const usMinute = usTime.getMinutes();
      const usTotalMinutes = usHour * 60 + usMinute;
      const isUsWeekday = usDay >= 1 && usDay <= 5;
      const isUsMarketOpen = isUsWeekday && usTotalMinutes >= 9 * 60 + 30 && usTotalMinutes < 16 * 60;

      // 한국 또는 미국 시장 중 하나라도 열려있으면 true
      setMarketOpen(isKoreaMarketOpen || isUsMarketOpen);
    };

    checkMarketStatus(); // 초기 로드 시 즉시 확인
    const interval = setInterval(checkMarketStatus, 60000); // 1분마다 확인

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userDoc?.classCode) {
      setClassCode(userDoc.classCode);
    }
  }, [userDoc]);

  // 🔥 매도 제한 타이머: 1초마다 업데이트 (portfolio를 ref로 참조)
  const portfolioRef = useRef(portfolio);

  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLockTimers(prevTimers => {
        const newTimers = {};
        portfolioRef.current.forEach(holding => {
          const remaining = getRemainingLockTime(holding);
          if (remaining > 0) {
            newTimers[holding.id] = remaining;
          }
        });
        return newTimers;
      });

      // 캐시 통계 업데이트
      setCacheStatus({
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        savings: cacheStats.savings
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []); // 빈 의존성 배열 - portfolioRef를 통해 최신 portfolio 참조

  // 🔥 portfolio가 변경되면 즉시 타이머 재계산
  useEffect(() => {
    const newTimers = {};
    portfolio.forEach(holding => {
      const remaining = getRemainingLockTime(holding);
      if (remaining > 0) {
        newTimers[holding.id] = remaining;
      }
    });
    setLockTimers(newTimers);
  }, [portfolio]);

  // === 최적화된 데이터 가져오기 함수 (배치 처리 사용) ===
  const fetchAllData = useCallback(async (forceRefresh = false) => { // forceRefresh 기본값을 false로 되돌려 캐시 활성화
    if (!user) return;
    if (!classCode) return; // classCode가 없으면 데이터 로드하지 않음

    if (isFetchingRef.current && !forceRefresh) {
      console.log('[StockExchange] 이미 fetching 중이므로 대기');
      return;
    }

    const now = Date.now();

    // usePolling이 간격을 제어하므로, 시간 기반 캐시 체크 로직은 제거하거나 수정할 수 있지만,
    // 수동 새로고침 시에도 동작해야 하므로 유지.
    const timeSinceLastBatch = now - lastFetchTimeRef.current.batchLoad;
    if (!forceRefresh && timeSinceLastBatch <= CACHE_TTL.BATCH_DATA) {
      return;
    }

    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      // usePolling에서 호출 시 항상 최신 데이터를 가져오도록 forceRefresh를 true로 전달
      const batchResult = await batchDataLoader.loadBatchData(classCode, user.uid, forceRefresh);

      if (batchResult.errors && batchResult.errors.length > 0) {
        console.warn('[StockExchange] 배치 로드 중 일부 오류 발생:', batchResult.errors);
      }

      setStocks(batchResult.stocks || []);
      setPortfolio(batchResult.portfolio || []);

      lastFetchTimeRef.current.batchLoad = now;
      lastFetchTimeRef.current.stocks = now;
      lastFetchTimeRef.current.portfolio = now;
      lastFetchTimeRef.current.marketStatus = now;

      setLastBatchLoad(new Date());
      setLastUpdated(new Date());

    } catch (error) {
      console.error('[StockExchange] 배치 로드 실패:', error);
      // Polling 중에는 alert을 띄우지 않는 것이 사용자 경험에 좋음
      // alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, [classCode, user, isAdmin]);

  // === 데이터 자동 갱신 (Polling) ===
  // 🔥 [최적화] 폴링 간격을 60분으로 완화 - 거래 시 forceRefresh로 즉시 갱신되므로 자동 갱신은 최소화
  usePolling(fetchAllData, {
    interval: 60 * 60 * 1000, // 🔥 [최적화] 60분마다 포트폴리오 갱신 (Firestore 읽기 최소화)
    enabled: firebaseReady && !!user && !!classCode,
    deps: [user, classCode, isAdmin]
  });

  // 🔥 [최적화] onSnapshot 리스너 제거 - 읽기 비용 절감
  // 대신 10분마다 fetchAllData가 최신 데이터를 가져옴
  // 사용자가 필요시 수동 새로고침 가능

  // 🔥 FCM 푸시 알림 제거됨 (이유: 알림 스팸, 읽기 증가, 사용자 경험 악화)
  // 대신 30분 캐시 + 시간당 1회 자동 폴링으로 부드러운 업데이트 제공

  // === 자동 상장/폐지 관리는 Firebase Functions에서 처리 ===
  // 10분마다 서버에서 자동으로 실행됨 (autoManageStocks 함수)
  // 클라이언트에서는 별도 스케줄러 불필요

  // === 시장 지수 계산 ===
  // 시장 상태 시뮬레이션 비활성화

  // 🔥 방학 모드 상태 조회 (슈퍼관리자 전용)
  const fetchVacationMode = useCallback(async () => {
    if (!userDoc?.isSuperAdmin) return;
    try {
      const getVacationModeStatusFn = httpsCallable(functions, 'getVacationModeStatus');
      const result = await getVacationModeStatusFn({});
      setVacationMode(result.data.vacationMode);
    } catch (error) {
      console.error('[fetchVacationMode] 조회 실패:', error);
    }
  }, [functions, userDoc?.isSuperAdmin]);

  // 🔥 방학 모드 초기 로드
  useEffect(() => {
    if (userDoc?.isSuperAdmin && functions) {
      fetchVacationMode();
    }
  }, [userDoc?.isSuperAdmin, functions, fetchVacationMode]);

  // 🔥 방학 모드 토글 (슈퍼관리자 전용)
  const toggleVacationMode = useCallback(async () => {
    if (!userDoc?.isSuperAdmin) return;
    setVacationLoading(true);
    try {
      const toggleVacationModeFn = httpsCallable(functions, 'toggleVacationMode');
      const result = await toggleVacationModeFn({ enabled: !vacationMode });
      setVacationMode(result.data.vacationMode);
      alert(result.data.message);
    } catch (error) {
      console.error('[toggleVacationMode] 토글 실패:', error);
      alert('방학 모드 설정 실패: ' + error.message);
    } finally {
      setVacationLoading(false);
    }
  }, [functions, userDoc?.isSuperAdmin, vacationMode]);

  // 중앙 주식 스냅샷 문서 강제 갱신 (관리자 작업 후 읽기 최적화 유지)
  const refreshStocksSnapshot = useCallback(async () => {
    try {
      const updateSnapshotFn = httpsCallable(functions, 'updateStocksSnapshot');
      await updateSnapshotFn({});
      console.log('[updateStocksSnapshot] 스냅샷 갱신 완료');
    } catch (error) {
      console.error('[updateStocksSnapshot] 스냅샷 갱신 실패:', error);
    }
  }, [functions]);

  // === 거래 함수들 (최적화된 캐시 무효화) ===
  const addStock = useCallback(async (stockData) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    try {
      // 관리자 권한으로 Cloud Function 먼저 시도 (Rules 우회)
      const addStockFn = httpsCallable(functions, 'addStockDoc');
      await addStockFn({ stock: stockData });

      await refreshStocksSnapshot();

      // 캐시 무효화
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      alert(`${stockData.name} 상품이 추가되었습니다.`);
    } catch (error) {
      console.error('[addStock] 함수 추가 실패, Firestore 직접 시도:', error);
      try {
        const stockRef = doc(collection(db, "CentralStocks"));
        await setDoc(stockRef, {
          ...stockData,
          initialPrice: stockData.price,
          priceHistory: [stockData.price],
          createdAt: serverTimestamp(),
          holderCount: 0,
          tradingVolume: 1000,
          buyVolume: 0,
          sellVolume: 0,
          recentBuyVolume: 0,
          recentSellVolume: 0,
          volatility: stockData.volatility || 0.02
        });

        await refreshStocksSnapshot();

        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`STOCKS_${classCode}`);
        await fetchAllData(true);

        alert(`${stockData.name} 상품이 추가되었습니다.`);
      } catch (innerError) {
        console.error('[addStock] Firestore 직접 추가 실패:', innerError);
        alert("상품 추가 중 오류가 발생했습니다. 관리자 권한/Rules를 확인해주세요.");
      }
    }
  }, [classCode, user, fetchAllData, refreshStocksSnapshot, functions]);

  const deleteStock = useCallback(async (stockId, stockName) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    if (window.confirm(`'${stockName}' 상품을 정말로 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "CentralStocks", stockId));

        await refreshStocksSnapshot();

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`STOCKS_${classCode}`);
        await fetchAllData(true);

        alert(`${stockName} 상품이 삭제되었습니다.`);
      } catch (error) {
        alert("상품 삭제 중 오류가 발생했습니다.");
      }
    }
  }, [classCode, user, fetchAllData, refreshStocksSnapshot]);

  const editStock = useCallback(async (stockId) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return;
    const newPriceStr = prompt(`'${stock.name}'의 새로운 가격:`, stock.price.toString());
    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice <= 0) return alert("유효한 가격을 입력해주세요.");
    try {
      await updateDoc(doc(db, "CentralStocks", stockId), {
        price: newPrice,
        priceHistory: [...(stock.priceHistory || []).slice(-19), newPrice]
      });

      await refreshStocksSnapshot();

      // 캐시 무효화
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      alert('가격이 수정되었습니다.');
    } catch (error) {
      alert("가격 수정 중 오류가 발생했습니다.");
    }
  }, [stocks, classCode, user, fetchAllData, refreshStocksSnapshot]);

  const toggleManualStock = useCallback(async (stockId, currentIsListed) => {
    if (!classCode || !user) return alert("클래스 정보가 없습니다.");
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return;
    const action = currentIsListed ? '상장폐지' : '재상장';

    if (window.confirm(`'${stock.name}' 상품을 ${action}하시겠습니까?`)) {
      try {
        const updateData = currentIsListed
          ? { isListed: false, price: 0, delistedAt: serverTimestamp() }
          : { isListed: true, price: stock.minListingPrice, priceHistory: [stock.minListingPrice], delistedAt: null };

        await updateDoc(doc(db, "CentralStocks", stockId), updateData);

        if (currentIsListed) {
          const batch = writeBatch(db);

          const portfoliosToDelistQuery = query(
            collectionGroup(db, 'portfolio'),
            where('classCode', '==', classCode),
            where('stockId', '==', stockId)
          );

          const snapshot = await getDocs(portfoliosToDelistQuery);

          snapshot.forEach(doc => {
            batch.update(doc.ref, { delistedAt: serverTimestamp() });
          });

          await batch.commit();
        }

        await refreshStocksSnapshot();

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`STOCKS_${classCode}`);
        invalidateCache(`PORTFOLIO`);
        await fetchAllData(true);

        alert(`${action} 처리되었습니다.`);
      } catch (error) {
        alert(`${action} 처리 중 오류가 발생했습니다.`);
      }
    }
  }, [stocks, classCode, user, fetchAllData, refreshStocksSnapshot]);

  const buyStock = useCallback(async (stockId, quantityString) => {
    if (!marketOpen) return alert("주식시장이 마감되었습니다. 운영 시간: 월-금 오전 8시-오후 3시");
    if (isTrading || !classCode) return;
    const quantity = parseInt(quantityString, 10);
    if (isNaN(quantity) || quantity <= 0) return alert("유효한 수량을 입력해주세요.");
    const stock = stocks.find(s => s.id === stockId);
    if (!user || !stock || !stock.isListed) return alert("매수할 수 없는 상태입니다.");

    const cost = stock.price * quantity;
    const commission = Math.round(cost * COMMISSION_RATE);
    const taxRate = 0.01; // 기본 거래세율 1%
    const taxAmount = Math.floor(cost * taxRate);
    const totalCost = cost + commission + taxAmount;

    console.log('[buyStock] 매수 시작:', { stockId, stockName: stock.name, quantity, totalCost });

    // 🔥 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -totalCost });
    }

    setIsTrading(true);
    try {
      // Cloud Function 호출
      const buyStockFunction = httpsCallable(functions, 'buyStock');
      const result = await buyStockFunction({ stockId, quantity });

      console.log('[buyStock] 매수 성공:', result.data);

      // 🔥 [수정] 서버에서 받은 정확한 잔액으로 낙관적 업데이트 보정
      if (result.data.newBalance !== undefined && optimisticUpdate) {
        const currentCash = userDoc?.cash || 0;
        const cashDiff = result.data.newBalance - currentCash;
        optimisticUpdate({ cash: cashDiff });
        console.log('[buyStock] 현금 정확한 값으로 업데이트:', result.data.newBalance);
      }

      // 🔥 [최적화] 캐시 무효화 (통합)
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      clearLocalStorageBatchCache();

      // 🔥 [최적화] 포트폴리오만 로컬에서 업데이트 - 전체 fetchAllData 호출 제거
      // 서버에서 반환된 데이터로 포트폴리오 상태 직접 업데이트
      setPortfolio(prev => {
        const existingIndex = prev.findIndex(h => h.stockId === stockId);
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const newQuantity = existing.quantity + quantity;
          const newAvgPrice = ((existing.averagePrice * existing.quantity) + (stock.price * quantity)) / newQuantity;
          return [
            ...prev.slice(0, existingIndex),
            { ...existing, quantity: newQuantity, averagePrice: newAvgPrice, lastBuyTime: new Date() },
            ...prev.slice(existingIndex + 1)
          ];
        } else {
          return [...prev, {
            id: `temp_${Date.now()}`,
            stockId,
            stockName: stock.name,
            quantity,
            averagePrice: stock.price,
            classCode,
            lastBuyTime: new Date()
          }];
        }
      });

      setBuyQuantities(prev => ({ ...prev, [stockId]: "" }));

      // 🔥 활동 로그 기록 (주식 매수)
      logActivity(db, {
        classCode,
        userId: user.uid,
        userName: userDoc?.name || user.displayName || '사용자',
        type: ACTIVITY_TYPES.STOCK_BUY,
        description: `${stock.name} ${quantity}주 매수 (${formatCurrency(totalCost)})`,
        amount: -totalCost,
        metadata: {
          stockId,
          stockName: stock.name,
          quantity,
          pricePerShare: stock.price,
          commission,
          taxAmount,
          totalCost
        }
      });

      alert(`${stock.name} ${quantity}주 매수 완료!\n수수료: ${formatCurrency(commission)}`);
    } catch (error) {
      console.error('[buyStock] 매수 실패:', error);

      // 실패 시 롤백 (낙관적 업데이트 취소)
      if (optimisticUpdate) {
        optimisticUpdate({ cash: totalCost });
      }

      alert(error.message || '매수 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTrading(false);
    }
  }, [stocks, user, isTrading, classCode, marketOpen, functions, fetchAllData, invalidateCache, optimisticUpdate, refreshUserDocument]);

  const sellStock = useCallback(async (holdingId, quantityString) => {
    if (!marketOpen) return alert("주식시장이 마감되었습니다. 운영 시간: 월-금 오전 8시-오후 3시");
    if (isTrading) return;
    const quantity = parseInt(quantityString, 10);
    if (isNaN(quantity) || quantity <= 0) return alert("유효한 수량을 입력해주세요.");
    const holding = portfolio.find(h => h.id === holdingId);
    if (!user || !userDoc || !holding || quantity > holding.quantity) return alert("매도할 수 없는 상태입니다.");
    if (holding.delistedAt) return alert("상장폐지된 상품은 매도할 수 없습니다.");

    if (!canSellHolding(holding)) {
      const remaining = getRemainingLockTime(holding);
      return alert(`매수 후 1시간 동안은 매도할 수 없습니다.\n남은 시간: ${formatTime(remaining)}`);
    }

    const stock = stocks.find(s => s.id === holding.stockId);
    if (!stock || !stock.isListed) return alert("현재 거래할 수 없는 상품입니다.");

    // 예상 수익 계산 (낙관적 업데이트용)
    const sellPrice = stock.price * quantity;
    const commission = Math.round(sellPrice * COMMISSION_RATE);
    const profit = (stock.price - holding.averagePrice) * quantity;
    const profitTax = profit > 0 ? Math.floor(profit * 0.22) : 0;
    const transactionTax = Math.floor(sellPrice * 0.01);
    const totalTax = profitTax + transactionTax;
    const estimatedNetRevenue = sellPrice - commission - totalTax;

    console.log('[sellStock] 매도 시작:', { holdingId, stockName: stock.name, quantity, estimatedNetRevenue });

    // 🔥 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ cash: estimatedNetRevenue });
    }

    setIsTrading(true);

    try {
      const sellStockFunction = httpsCallable(functions, 'sellStock');
      const result = await sellStockFunction({ holdingId, quantity });

      console.log('[sellStock] 매도 성공:', result.data);

      // 🔥 [수정] 서버에서 받은 정확한 잔액으로 낙관적 업데이트 보정
      if (result.data.newBalance !== undefined && optimisticUpdate) {
        const currentCash = userDoc?.cash || 0;
        const cashDiff = result.data.newBalance - currentCash;
        optimisticUpdate({ cash: cashDiff });
        console.log('[sellStock] 현금 정확한 값으로 업데이트:', result.data.newBalance);
      }

      // 🔥 [최적화] 캐시 무효화 (통합)
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`PORTFOLIO_user_${user.uid}`);
      clearLocalStorageBatchCache();

      // 🔥 [최적화] 포트폴리오 로컬 업데이트 - fetchAllData 호출 제거
      setPortfolio(prev => {
        const existingIndex = prev.findIndex(h => h.id === holdingId);
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const newQuantity = existing.quantity - quantity;
          if (newQuantity <= 0) {
            // 전량 매도 시 포트폴리오에서 제거
            return [...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)];
          } else {
            return [
              ...prev.slice(0, existingIndex),
              { ...existing, quantity: newQuantity },
              ...prev.slice(existingIndex + 1)
            ];
          }
        }
        return prev;
      });

      setSellQuantities(prev => ({ ...prev, [holdingId]: "" }));

      const { stockName, sellPrice: actualSellPrice, commission: actualCommission, totalTax: actualTax, profit: actualProfit, netRevenue } = result.data;

      // 🔥 활동 로그 기록 (주식 매도)
      logActivity(db, {
        classCode,
        userId: user.uid,
        userName: userDoc?.name || user.displayName || '사용자',
        type: ACTIVITY_TYPES.STOCK_SELL,
        description: `${stockName} ${quantity}주 매도 (순수익: ${formatCurrency(netRevenue)})`,
        amount: netRevenue,
        metadata: {
          holdingId,
          stockName,
          quantity,
          sellPrice: actualSellPrice,
          commission: actualCommission,
          tax: actualTax,
          profit: actualProfit,
          netRevenue
        }
      });

      const taxInfo = actualTax > 0 ? `\n세금: ${formatCurrency(actualTax)}` : '';
      alert(`${stockName} ${quantity}주 매도 완료!\n수익: ${formatCurrency(actualProfit)}${taxInfo}\n수수료: ${formatCurrency(actualCommission)}\n순수익: ${formatCurrency(netRevenue)}`);
    } catch (error) {
      console.error('[sellStock] 매도 실패:', error);

      // 실패 시 롤백 (낙관적 업데이트 취소)
      if (optimisticUpdate) {
        optimisticUpdate({ cash: -estimatedNetRevenue });
      }

      alert(error.message || '매도 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTrading(false);
    }
  }, [stocks, portfolio, user, userDoc, isTrading, classCode, marketOpen, fetchAllData, functions, optimisticUpdate, refreshUserDocument]);

  const deleteHolding = useCallback(async (holdingId) => {
    if (!user || !classCode) return;
    if (window.confirm("이 상품(휴지조각)을 포트폴리오에서 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "portfolio", holdingId));

        // 캐시 무효화
        const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
        globalCache.invalidate(batchKey);
        invalidateCache(`PORTFOLIO_user_${user.uid}`);
        await fetchAllData(true);

        alert("삭제되었습니다.");
      } catch (error) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  }, [user, classCode, fetchAllData]);

  // 🔥 수동으로 주식 시장 업데이트 (관리자 전용)
  const manualUpdateStockMarket = useCallback(async () => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[manualUpdateStockMarket] 수동 업데이트 시작');
      const manualUpdateFunction = httpsCallable(functions, 'manualUpdateStockMarket');
      const result = await manualUpdateFunction({});

      console.log('[manualUpdateStockMarket] 업데이트 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[manualUpdateStockMarket] 업데이트 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // 🔥 실제 주식 생성 (관리자 전용)
  const createRealStocks = useCallback(async () => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[createRealStocks] 실제 주식 생성 시작');
      const createRealStocksFunction = httpsCallable(functions, 'createRealStocks');
      const result = await createRealStocksFunction({});

      console.log('[createRealStocks] 생성 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[createRealStocks] 생성 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // 🔥 실제 주식 가격 수동 업데이트 (관리자 전용)
  const updateRealStocks = useCallback(async () => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[updateRealStocks] 실제 주식 업데이트 시작');
      const updateRealStocksFunction = httpsCallable(functions, 'updateRealStocks');
      const result = await updateRealStocksFunction({});

      console.log('[updateRealStocks] 업데이트 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[updateRealStocks] 업데이트 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // 🔥 개별 실제 주식 추가 (관리자 전용)
  const addSingleRealStock = useCallback(async ({ name, symbol, sector, productType }) => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[addSingleRealStock] 개별 실제 주식 추가 시작:', name);
      const addSingleRealStockFunction = httpsCallable(functions, 'addSingleRealStock');
      const result = await addSingleRealStockFunction({ name, symbol, sector, productType });

      console.log('[addSingleRealStock] 추가 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[addSingleRealStock] 추가 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // 🔥 시뮬레이션 주식 전체 삭제 (관리자 전용)
  const deleteSimulationStocks = useCallback(async () => {
    if (!functions || !classCode || !user) {
      throw new Error("Firebase Functions가 초기화되지 않았습니다.");
    }

    try {
      console.log('[deleteSimulationStocks] 시뮬레이션 주식 삭제 시작');
      const deleteSimulationStocksFunction = httpsCallable(functions, 'deleteSimulationStocks');
      const result = await deleteSimulationStocksFunction({});

      console.log('[deleteSimulationStocks] 삭제 성공:', result.data);

      // 캐시 무효화 및 데이터 새로고침
      const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
      globalCache.invalidate(batchKey);
      invalidateCache(`STOCKS_${classCode}`);
      await fetchAllData(true);

      return result.data;
    } catch (error) {
      console.error('[deleteSimulationStocks] 삭제 실패:', error);
      throw error;
    }
  }, [functions, classCode, user, fetchAllData]);

  // === stocks 데이터를 Map으로 변환하여 조회 성능 향상 ===
  const stocksMap = useMemo(() => {
    const map = new Map();
    stocks.forEach(stock => map.set(stock.id, stock));
    return map;
  }, [stocks]);

  // === 계산된 값들 ===
  const portfolioStats = useMemo(() => {
    let totalValue = 0, totalInvested = 0;
    portfolio.forEach(holding => {
      const investedValue = holding.averagePrice * holding.quantity;
      totalInvested += investedValue;
      if (!holding.delistedAt) {
        const stock = stocksMap.get(holding.stockId);
        if (stock && stock.isListed) totalValue += stock.price * holding.quantity;
      }
    });
    const totalProfit = totalValue - totalInvested;
    const profitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    return { totalValue, totalInvested, totalProfit, profitPercent };
  }, [portfolio, stocksMap]);

  const categoryCounts = useMemo(() => {
    const counts = { stocks: 0, etfs: 0, bonds: 0 };
    stocks.forEach(s => {
      if (!s.isListed) return;
      if (s.productType === PRODUCT_TYPES.ETF) {
        counts.etfs++;
      } else if (s.productType === PRODUCT_TYPES.BOND) {
        counts.bonds++;
      } else {
        counts.stocks++;
      }
    });
    return counts;
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    return stocks.filter(s => {
      if (!s.isListed) return false;
      if (activeTab === "stocks") return s.productType === PRODUCT_TYPES.STOCK || !s.productType;
      if (activeTab === "etfs") return s.productType === PRODUCT_TYPES.ETF;
      if (activeTab === "bonds") return s.productType === PRODUCT_TYPES.BOND;
      return false;
    });
  }, [stocks, activeTab]);

  const [showAllStocks, setShowAllStocks] = useState(false);

  const displayedStocks = useMemo(() => {
    return showAllStocks ? filteredStocks : filteredStocks.slice(0, 20);
  }, [filteredStocks, showAllStocks]);

  // === 수동 새로고침 함수 ===
  const handleManualRefresh = useCallback(() => {
    if (!classCode || !user) return;
    // 캐시 강제 삭제
    const batchKey = globalCache.generateKey('BATCH', { classCode, userId: user.uid });
    globalCache.invalidate(batchKey);
    fetchAllData(true);
  }, [fetchAllData, classCode, user]);

  if (authLoading || !firebaseReady) return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  if (!user || !userDoc) return <div className="loading-message">로그인이 필요합니다.</div>;

  // 학생 사용자가 학급에 배정되지 않은 경우 안내 메시지 표시
  if (!isAdmin() && (!classCode || classCode === '미지정')) {
    return (
      <div className="stock-exchange-container">
        <header className="stock-header">
          <div className="stock-header-content">
            <div className="logo-title">
              <BarChart3 size={32} color="white" /><h1>투자 거래소</h1>
            </div>
          </div>
        </header>
        <main className="market-section" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
          <div style={{ textAlign: 'center', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2>학급 미배정 안내</h2>
            <p style={{ marginTop: '10px', fontSize: '1rem', color: '#333' }}>
              소속된 학급이 없어 주식 시장을 이용할 수 없습니다.
            </p>
            <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
              담당 선생님께 문의하여 학급에 등록해주세요.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!classCode && !authLoading) return <div className="loading-message">참여 중인 클래스 정보를 불러오는 중...</div>;
  if (showAdminPanel && isAdmin()) return <AdminPanel stocks={stocks} classCode={classCode} onClose={() => setShowAdminPanel(false)} onAddStock={addStock} onDeleteStock={deleteStock} onEditStock={editStock} onToggleManualStock={toggleManualStock} cacheStats={cacheStatus} onManualUpdate={manualUpdateStockMarket} onCreateRealStocks={createRealStocks} onUpdateRealStocks={updateRealStocks} onAddSingleRealStock={addSingleRealStock} onDeleteSimulationStocks={deleteSimulationStocks} />;

  return (
    <div className="stock-exchange-container">
      <header className="stock-header">
        <div className="stock-header-content">
          <div className="logo-title">
            <BarChart3 size={32} color="white" /><h1>투자 거래소 ({classCode})</h1>
          </div>
          <div className={`market-status ${marketOpen ? 'open' : 'closed'}`}>
            {marketOpen ? '● 개장' : '○ 마감'}
          </div>
          <div className="stock-header-actions">
            <div className="user-info-display">{formatCurrency(userDoc.cash)}</div>
            {isAdmin() && <button onClick={() => setShowAdminPanel(true)} className="btn btn-primary"><Settings size={16} /> 관리</button>}
            {/* 🔥 방학 모드 토글 버튼 (슈퍼관리자 전용) */}
            {userDoc?.isSuperAdmin && (
              <button
                onClick={toggleVacationMode}
                disabled={vacationLoading}
                className={`btn ${vacationMode ? "btn-warning" : "btn-secondary"}`}
                style={{ marginLeft: '8px' }}
                title={vacationMode ? '방학 모드 ON - 스케줄러 중지됨' : '방학 모드 OFF - 스케줄러 작동 중'}
              >
                {vacationLoading ? '...' : vacationMode ? '🏖️ 방학모드 ON' : '📅 방학모드 OFF'}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="market-section">
        <section className="asset-summary">
          <div className="asset-cards">
            <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>투자 평가액</h3><p className="value">{formatCurrency(portfolioStats.totalValue)}</p></div><div className="asset-card-icon blue">📊</div></div></div>
            <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>총 자산</h3><p className="value">{formatCurrency(userDoc.cash + portfolioStats.totalValue)}</p></div><div className="asset-card-icon purple">💎</div></div></div>
            <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>평가손익</h3><p className={`value ${portfolioStats.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatCurrency(portfolioStats.totalProfit)}</p></div><div className={`asset-card-icon ${portfolioStats.totalProfit >= 0 ? 'red' : 'blue'}`}>{portfolioStats.totalProfit >= 0 ? <TrendingUp size={24} color="white" /> : <TrendingDown size={24} color="white" />}</div></div></div>
            <div className="asset-card"><div className="asset-card-content"><div className="asset-card-info"><h3>수익률</h3><p className={`value ${portfolioStats.profitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPercent(portfolioStats.profitPercent)}</p></div><div className={`asset-card-icon ${portfolioStats.profitPercent >= 0 ? 'red' : 'blue'}`}>{portfolioStats.profitPercent >= 0 ? <TrendingUp size={24} color="white" /> : <TrendingDown size={24} color="white" />}</div></div></div>
          </div>

          {/* 성능 통계 표시 (관리자 전용) */}
          {isAdmin() && (
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              background: '#f0f9ff',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#0369a1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                🚀 성능 최적화 상태: 캐시 적중 {cacheStatus.hits}회, 누락 {cacheStatus.misses}회
                (절약률: {cacheStatus.hits + cacheStatus.misses > 0 ? Math.round((cacheStatus.hits / (cacheStatus.hits + cacheStatus.misses)) * 100) : 0}%)
              </div>
              {lastBatchLoad && (
                <div>마지막 배치로드: {lastBatchLoad.toLocaleTimeString()}</div>
              )}
            </div>
          )}
        </section>

        <section className="market-list-section">
          <div className="section-header">
            <h2 className="section-title">📈 투자 시장</h2>
            <div className="update-indicator">
              <button onClick={handleManualRefresh} disabled={isFetching} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                <RefreshCw size={12} />
                {isFetching ? '갱신중...' : '새로고침'}
              </button>
              {lastUpdated && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>마지막 갱신: {lastUpdated.toLocaleTimeString()}</span>}
            </div>
          </div>

          <div className="market-tabs">
            <button onClick={() => setActiveTab("stocks")} className={`tab-button ${activeTab === "stocks" ? "active" : ""}`}>주식 ({categoryCounts.stocks})</button>
            <button onClick={() => setActiveTab("etfs")} className={`tab-button ${activeTab === "etfs" ? "active" : ""}`}>ETF/지수 ({categoryCounts.etfs})</button>
            <button onClick={() => setActiveTab("bonds")} className={`tab-button ${activeTab === "bonds" ? "active" : ""}`}>채권 ({categoryCounts.bonds})</button>
          </div>

          <div className="market-grid">
            {displayedStocks.map(stock => {
              const priceHistory = stock.priceHistory || [stock.price];
              const priceChange = priceHistory.length >= 2 ? ((priceHistory.slice(-1)[0] - priceHistory.slice(-2)[0]) / priceHistory.slice(-2)[0]) * 100 : 0;
              const isRealStock = stock.isRealStock === true;
              return (
                <div key={stock.id} className={`stock-card ${priceChange > 0 ? 'price-up' : priceChange < 0 ? 'price-down' : ''} ${isRealStock ? 'real-stock' : ''}`}>
                  <div className="stock-card-header">
                    <div className="stock-info">
                      <h3>{getProductIcon(stock.productType)} {stock.name}</h3>
                      <div className="stock-badges">
                        {isRealStock && (
                          <span className="stock-badge real" style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginRight: '4px'
                          }}>
                            실시간
                          </span>
                        )}
                        <span className={`stock-badge ${getProductBadgeClass(stock.productType)}`}>
                          {stock.productType === PRODUCT_TYPES.BOND ? `${stock.maturityYears}년 ${stock.couponRate}%` : SECTORS[stock.sector]?.name || '기타'}
                        </span>
                      </div>
                    </div>
                    <div className="stock-price-section">
                      <div className="stock-price">{formatCurrency(stock.price)}</div>
                      <div className={`stock-change ${priceChange > 0 ? 'up' : 'down'}`}>
                        <span>{formatPercent(priceChange)}</span>
                      </div>
                      {isRealStock && (
                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>
                          {getMarketStateLabel(stock) || '장마감'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="stock-actions">
                    <input type="number" min="1" value={buyQuantities[stock.id] || ''} onChange={e => setBuyQuantities(p => ({ ...p, [stock.id]: e.target.value }))} placeholder="수량" className="quantity-input" />
                    <button onClick={() => buyStock(stock.id, buyQuantities[stock.id])} disabled={!buyQuantities[stock.id] || isTrading || !marketOpen} className="trade-button buy">매수</button>
                  </div>
                  <div className="cost-display">
                    {buyQuantities[stock.id] && `예상 비용: ${formatCurrency(stock.price * parseInt(buyQuantities[stock.id]) * (1 + COMMISSION_RATE))}`}
                  </div>
                </div>
              );
            })}
          </div>
          {filteredStocks.length > 20 && (
            <div className="load-more-container">
              <button onClick={() => setShowAllStocks(!showAllStocks)} className="load-more-button">
                {showAllStocks ? "접기" : "더 보기"}
              </button>
            </div>
          )}
        </section>
        <section className="portfolio-section">
          <div className="section-header">
            <h2 className="section-title">💼 내 포트폴리오</h2>
          </div>
          <div className="portfolio-cards">
            {portfolio.length === 0 ? <p className="no-transactions">보유한 상품이 없습니다.</p> : portfolio.map(holding => {
              const stock = stocksMap.get(holding.stockId);

              // 휴지조각 주식 처리 (상장폐지로 가치 0이 된 주식)
              if (holding.isWorthless) {
                return (
                  <div key={holding.id} className="portfolio-card delisted">
                    <div className="portfolio-card-header">
                      <div className="stock-title-section">
                        <h3 className="stock-name">{holding.stockName}</h3>
                        <span className="stock-status delisted">🗑️ 휴지조각</span>
                      </div>
                      <div className="stock-quantity">{holding.quantity}<span className="unit">주</span></div>
                    </div>
                    <div className="portfolio-metrics-compact">
                      <div className="metrics-row">
                        <div className="metric-item"><span className="metric-label">현재 가치</span><span className="metric-value" style={{ color: '#ef4444', fontWeight: 'bold' }}>0원</span></div>
                        <div className="metric-item"><span className="metric-label">손실</span><span className="metric-value" style={{ color: '#ef4444' }}>-100%</span></div>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px' }}>상장폐지된 상품입니다. 10분 후 자동 삭제됩니다.</p>
                    <div className="portfolio-card-actions">
                      <button onClick={() => deleteHolding(holding.id)} className="action-btn delete-btn">지금 삭제</button>
                    </div>
                  </div>
                );
              }

              if (!stock) return null;
              const currentValue = stock.price * holding.quantity;
              const investedValue = holding.averagePrice * holding.quantity;
              const profit = currentValue - investedValue;
              const profitPercent = investedValue > 0 ? (profit / investedValue) * 100 : 0;
              const isLocked = !!lockTimers[holding.id];
              const canSell = !isLocked;

              return (
                <div key={holding.id} className={`portfolio-card ${profit >= 0 ? 'profit' : 'loss'}`}>
                  <div className="portfolio-card-header">
                    <div className="stock-title-section">
                      <h3 className="stock-name">{getProductIcon(stock.productType)} {holding.stockName}</h3>
                      {isLocked && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Lock size={12} />
                          매도 불가
                        </span>
                      )}
                    </div>
                    <div className="stock-quantity">{holding.quantity}<span className="unit">주</span></div>
                  </div>
                  <div className="portfolio-metrics-compact">
                    <div className="metrics-row">
                      <div className="metric-item"><span className="metric-label">평균 매수가</span><span className="metric-value">{formatCurrency(holding.averagePrice)}</span></div>
                      <div className="metric-item"><span className="metric-label">현재가</span><span className="metric-value current">{formatCurrency(stock.price)}</span></div>
                    </div>
                  </div>
                  <div className={`profit-summary ${profit >= 0 ? 'profit' : 'loss'}`}>
                    <div className="profit-amount">{formatCurrency(profit)}</div>
                    <div className="profit-percent">{formatPercent(profitPercent)}</div>
                  </div>
                  {isLocked && (
                    <div style={{
                      padding: '10px 12px',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      marginTop: '8px',
                      border: '1px solid #fbbf24'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.9rem',
                        color: '#92400e',
                        fontWeight: 'bold'
                      }}>
                        <Lock size={16} />
                        <span>매도 제한 시간</span>
                      </div>
                      <div style={{
                        fontSize: '1.1rem',
                        color: '#78350f',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        marginTop: '4px',
                        fontFamily: 'monospace'
                      }}>
                        ⏱️ {formatTime(lockTimers[holding.id])} 남음
                      </div>
                    </div>
                  )}
                  <div className="portfolio-card-actions">
                    <div className="trade-section">
                      <div className="trade-input-group">
                        <input type="number" min="1" max={holding.quantity} value={sellQuantities[holding.id] || ''} onChange={e => setSellQuantities(p => ({ ...p, [holding.id]: e.target.value }))} placeholder="매도 수량" className="trade-input" disabled={!!lockTimers[holding.id] || !marketOpen} />
                        <button onClick={() => sellStock(holding.id, sellQuantities[holding.id])} disabled={!sellQuantities[holding.id] || isTrading || !!lockTimers[holding.id] || !marketOpen} className="action-btn sell-btn">매도</button>
                      </div>
                      {sellQuantities[holding.id] && !lockTimers[holding.id] && (
                        <div className="expected-amount">
                          예상 수익: {formatCurrency((stock.price * parseInt(sellQuantities[holding.id])) * (1 - COMMISSION_RATE) - calculateStockTax(Math.max(0, (stock.price - holding.averagePrice) * parseInt(sellQuantities[holding.id])), stock.productType))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default StockExchange;
