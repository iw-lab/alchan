// src/pages/banking/stockExchangeService.js
// StockExchange 유틸리티, 캐시, 배치 데이터 로딩, 국고 업데이트

import { db, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { globalCache } from "../../services/globalCacheService";

import { logger } from "../../utils/logger";
// === 상수 ===
export const PRODUCT_TYPES = {
  STOCK: "stock",
  ETF: "etf",
  BOND: "bond"
};

export const SECTORS = {
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

export const HOLDING_LOCK_PERIOD = 60 * 60 * 1000; // 1시간
export const COMMISSION_RATE = 0.003;
export const TAX_RATE = 0.22;
export const BOND_TAX_RATE = 0.154;

export const CACHE_TTL = {
  BATCH_DATA: 1000 * 60 * 30,
  STOCKS: 1000 * 60 * 30,
  PORTFOLIO: 1000 * 60 * 30,
  MARKET_STATUS: 1000 * 60 * 120,
};

// === 배치 데이터 로딩 시스템 ===
export const batchDataLoader = {
  pendingRequests: new Map(),

  loadBatchData: async function (classCode, userId, forceRefresh = false) {
    const batchKey = globalCache.generateKey('BATCH', { classCode, userId });

    if (!forceRefresh) {
      const cached = globalCache.get(batchKey);
      if (cached) {
        logger.log('[batchDataLoader] Cache HIT - 캐시된 데이터 사용');
        return cached;
      }
    } else {
      logger.log('[batchDataLoader] forceRefresh=true - 캐시 무시하고 서버에서 로드');
      globalCache.invalidate(batchKey);
    }

    if (this.pendingRequests.has(batchKey)) {
      return await this.pendingRequests.get(batchKey);
    }

    const batchPromise = this._executeBatchLoad(classCode, userId);
    this.pendingRequests.set(batchKey, batchPromise);

    try {
      const result = await batchPromise;
      globalCache.set(batchKey, result, 30 * 60 * 1000);
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
      try {
        const getSnapshotFn = httpsCallable(functions, 'getStocksSnapshot');
        const result = await getSnapshotFn({});
        if (result.data && Array.isArray(result.data.stocks) && result.data.stocks.length > 0) {
          return result.data.stocks;
        }
      } catch (fnError) {
        logger.warn('[batchDataLoader] 스냅샷 함수 호출 실패, 문서/쿼리 폴백 시도:', fnError);
      }

      try {
        const cacheRef = doc(db, "Settings", "centralStocksCache");
        const cacheDoc = await getDoc(cacheRef);
        const cacheData = cacheDoc.exists() ? cacheDoc.data() : null;

        if (cacheData && Array.isArray(cacheData.stocks) && cacheData.stocks.length > 0) {
          return cacheData.stocks;
        }
      } catch (snapshotError) {
        logger.warn('[batchDataLoader] 스냅샷 문서 읽기 실패:', snapshotError);
      }

      const stocksRef = collection(db, "CentralStocks");
      const q = query(stocksRef, where("isListed", "==", true));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('[batchDataLoader] Stocks load error:', error);
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
          lastBuyTime: data.lastBuyTime?.toDate ? data.lastBuyTime.toDate() : data.lastBuyTime,
          delistedAt: data.delistedAt?.toDate ? data.delistedAt.toDate() : data.delistedAt,
        };
      });
    } catch (error) {
      logger.error('[batchDataLoader] Portfolio load error:', error);
      return [];
    }
  },
};

// === 시장 상태 함수 ===
export const getRealtimeMarketState = (stock) => {
  if (!stock?.isRealStock) return null;
  if (stock.realStockData?.marketState) return stock.realStockData.marketState;
  return null;
};

export const getMarketStateLabel = (stock) => {
  const state = getRealtimeMarketState(stock);
  if (!state) return null;
  switch (state) {
    case 'REGULAR': return '장중';
    case 'PRE': return '장전';
    case 'POST': return '장후';
    default: return '장마감';
  }
};

// === 포맷팅 함수 ===
export const formatCurrency = (amount) => {
  if (typeof amount !== "number" || isNaN(amount)) return "0원";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + "원";
};

export const formatPercent = (percent) => {
  const num = parseFloat(percent);
  if (isNaN(num)) return "0.00%";
  return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
};

export const formatTime = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}분 ${remainingSeconds}초`;
};

// === 세금/수수료 계산 ===
export const calculateStockTax = (profit, productType = PRODUCT_TYPES.STOCK) => {
  if (profit <= 0) return 0;
  if (productType === PRODUCT_TYPES.BOND) {
    return Math.round(profit * BOND_TAX_RATE);
  }
  return Math.round(profit * TAX_RATE);
};

// === 국고 업데이트 배치 처리 ===
const treasuryUpdateQueue = new Map();

export const updateNationalTreasury = async (amount, type, classCode) => {
  if (amount <= 0 || !classCode) return;
  const key = `${classCode}_${type}`;
  const existing = treasuryUpdateQueue.get(key) || { amount: 0, type, classCode };
  existing.amount += amount;
  treasuryUpdateQueue.set(key, existing);
  setTimeout(() => processTreasuryQueue(), 1000);
};

export const processTreasuryQueue = async () => {
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
    updates.forEach(update => {
      const key = `${update.classCode}_${update.type}`;
      treasuryUpdateQueue.set(key, update);
    });
  }
};

// === 시장 지수 계산 ===
export const calculateMarketIndex = (stocks) => {
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

// === 보유 잠금 관련 ===
export const canSellHolding = (holding) => {
  if (!holding.lastBuyTime) return true;
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
    return true;
  }
  const timeSinceBuy = Date.now() - lastBuyTimeMs;
  return timeSinceBuy >= HOLDING_LOCK_PERIOD;
};

export const getRemainingLockTime = (holding) => {
  if (!holding.lastBuyTime) return 0;
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
    return 0;
  }
  const now = Date.now();
  const timeSinceBuy = now - lastBuyTimeMs;
  const remaining = HOLDING_LOCK_PERIOD - timeSinceBuy;
  return Math.max(0, remaining);
};

// === UI 유틸리티 ===
export const getProductIcon = (productType) => {
  switch (productType) {
    case PRODUCT_TYPES.ETF: return "\u{1F4CA}";
    case PRODUCT_TYPES.BOND: return "\u{1F4DC}";
    default: return "\u{1F4C8}";
  }
};

export const getProductBadgeClass = (productType) => {
  switch (productType) {
    case PRODUCT_TYPES.ETF: return "etf";
    case PRODUCT_TYPES.BOND: return "bond";
    default: return "stock";
  }
};

// === 캐시 관련 ===
export const invalidateStockCache = (pattern) => {
  if (globalCache && typeof globalCache.invalidatePattern === 'function') {
    globalCache.invalidatePattern(pattern);
  }
};

export const clearLocalStorageBatchCache = () => {
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
      logger.log('[캐시] localStorage BATCH 캐시 삭제:', keysToDelete.length, '개');
    }
  } catch (error) {
    logger.warn('[캐시] localStorage 정리 오류:', error);
  }
};
