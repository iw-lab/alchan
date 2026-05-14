/* eslint-disable */
/**
 * 실제 주식 데이터를 가져오는 서비스
 * Yahoo Finance 비공식 API 사용 (무료)
 * 15분마다 호출하여 실제 주식 가격 업데이트
 *
 * 환율: Frankfurter API (무료, 무제한)
 * ETF/채권 ETF: Yahoo Finance 지원
 */

const { db, admin, logger } = require("./utils");

// 실제 주식 심볼 매핑 (한국 주식은 .KS 또는 .KQ 접미사)
const REAL_STOCK_SYMBOLS = {
  // 한국 주식 (KOSPI: .KS, KOSDAQ: .KQ)
  '삼성전자': '005930.KS',
  '삼성전자우': '005935.KS',
  'SK하이닉스': '000660.KS',
  'LG에너지솔루션': '373220.KS',
  '삼성바이오로직스': '207940.KS',
  '현대차': '005380.KS',
  '기아': '000270.KS',
  'NAVER': '035420.KS',
  '네이버': '035420.KS',
  '카카오': '035720.KS',
  'LG화학': '051910.KS',
  'POSCO홀딩스': '005490.KS',
  '삼성SDI': '006400.KS',
  '셀트리온': '068270.KS',
  '현대모비스': '012330.KS',
  'KB금융': '105560.KS',
  '신한지주': '055550.KS',
  '하나금융지주': '086790.KS',
  'SK이노베이션': '096770.KS',
  'SK': '034730.KS',
  'LG전자': '066570.KS',
  '카카오뱅크': '323410.KS',
  '크래프톤': '259960.KS',
  '두산에너빌리티': '034020.KS',
  'HMM': '011200.KS',
  'KT': '030200.KS',
  '한화에어로스페이스': '012450.KS',

  // 미국 주식
  'Apple': 'AAPL',
  '애플': 'AAPL',
  'Microsoft': 'MSFT',
  '마이크로소프트': 'MSFT',
  'Google': 'GOOGL',
  '구글': 'GOOGL',
  'Amazon': 'AMZN',
  '아마존': 'AMZN',
  'Tesla': 'TSLA',
  '테슬라': 'TSLA',
  'NVIDIA': 'NVDA',
  '엔비디아': 'NVDA',
  'Meta': 'META',
  '메타': 'META',
  'Netflix': 'NFLX',
  '넷플릭스': 'NFLX',

  // ETF (한국)
  'KODEX 200': '069500.KS',
  'KODEX 코스닥150': '229200.KS',
  'KODEX 레버리지': '122630.KS',
  'KODEX 인버스': '114800.KS',
  'TIGER 200': '102110.KS',
  'TIGER 미국S&P500': '360750.KS',
  'TIGER 미국나스닥100': '133690.KS',
  'KOSEF 국고채10년': '148070.KS',
  'KODEX 미국채10년선물': '308620.KS',

  // ETF (미국)
  'SPY': 'SPY',           // S&P 500
  'QQQ': 'QQQ',           // 나스닥 100
  'DIA': 'DIA',           // 다우존스
  'IWM': 'IWM',           // 러셀 2000
  'VTI': 'VTI',           // 미국 전체 주식

  // 채권 ETF (미국)
  'TLT': 'TLT',           // 미국 장기 국채 (20년+)
  'IEF': 'IEF',           // 미국 중기 국채 (7-10년)
  'SHY': 'SHY',           // 미국 단기 국채 (1-3년)
  'LQD': 'LQD',           // 미국 투자등급 회사채
  'HYG': 'HYG',           // 미국 하이일드 채권
  'BND': 'BND',           // 미국 전체 채권

  // 원자재 ETF
  'GLD': 'GLD',           // 금
  'SLV': 'SLV',           // 은
  'USO': 'USO',           // 원유
};

// 종목별 연간 배당률(%) 매핑 — 2026 기준 실측 근사값
// Yahoo Finance 무료 API는 dividendYield를 단일 호출로 안 줘서 하드코딩 사용
// 관리자가 CentralStocks 문서에서 dividendYieldAnnual 직접 수정 가능 (override)
const STOCK_DIVIDEND_YIELDS_BY_SYMBOL = {
  // 한국 대형주
  '005930.KS': 2.5, '005935.KS': 3.0, '000660.KS': 1.5, '373220.KS': 0.0,
  '207940.KS': 0.0, '005380.KS': 5.0, '000270.KS': 5.5, '035420.KS': 0.5,
  '035720.KS': 0.0, '051910.KS': 1.5, '005490.KS': 4.0, '006400.KS': 1.0,
  '068270.KS': 0.0, '012330.KS': 4.5, '105560.KS': 6.0, '055550.KS': 5.0,
  '086790.KS': 6.5, '096770.KS': 3.5, '034730.KS': 4.0, '066570.KS': 1.0,
  '323410.KS': 1.5, '259960.KS': 0.0, '034020.KS': 0.5, '011200.KS': 8.0,
  '030200.KS': 6.0, '012450.KS': 1.5,
  // 미국 대형주
  'AAPL': 0.5, 'MSFT': 0.7, 'GOOGL': 0.0, 'AMZN': 0.0, 'TSLA': 0.0,
  'NVDA': 0.05, 'META': 0.4, 'NFLX': 0.0,
  // 한국 ETF
  '069500.KS': 1.8, '229200.KS': 0.5, '122630.KS': 0.5, '114800.KS': 0.5,
  '102110.KS': 1.8, '360750.KS': 1.0, '133690.KS': 0.5,
  '148070.KS': 3.0, '308620.KS': 3.5,
  // 미국 ETF
  'SPY': 1.3, 'QQQ': 0.6, 'DIA': 1.7, 'IWM': 1.3, 'VTI': 1.4,
  // 채권 ETF (이자수익을 배당으로 처리)
  'TLT': 4.0, 'IEF': 3.5, 'SHY': 3.0, 'LQD': 4.5, 'HYG': 7.0, 'BND': 3.5,
  // 원자재 ETF (배당 없음)
  'GLD': 0.0, 'SLV': 0.0, 'USO': 0.0,
};

// 기본 환율 (실시간 환율로 업데이트됨, Firestore에서 로드 후 덮어씌워짐)
let USD_TO_KRW = 1477;

/**
 * 실시간 환율 가져오기 (Frankfurter API - 무료, 무제한)
 * @returns {Promise<number>} USD/KRW 환율
 */
async function fetchExchangeRate() {
  try {
    // Frankfurter API는 KRW를 직접 지원하지 않으므로,
    // ExchangeRate-API 무료 티어 사용 (월 1,500회)
    const url = 'https://api.exchangerate-api.com/v4/latest/USD';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      logger.warn(`[ExchangeRate] API 응답 실패: ${response.status}`);
      return USD_TO_KRW; // 기존 환율 반환
    }

    const data = await response.json();

    if (data.rates && data.rates.KRW) {
      const newRate = Math.round(data.rates.KRW);
      logger.info(`[ExchangeRate] USD/KRW 환율 업데이트: ${USD_TO_KRW} -> ${newRate}`);
      USD_TO_KRW = newRate;
      return newRate;
    }

    return USD_TO_KRW;
  } catch (error) {
    logger.error('[ExchangeRate] 환율 조회 오류:', error.message);
    return USD_TO_KRW; // 기존 환율 반환
  }
}

/**
 * Firestore에 환율 저장 및 업데이트
 * @returns {Promise<{rate: number, updated: boolean}>}
 */
async function updateExchangeRate() {
  try {
    const newRate = await fetchExchangeRate();

    // Firestore에 환율 저장
    const exchangeRateRef = db.collection("Settings").doc("exchangeRate");
    await exchangeRateRef.set({
      USD_KRW: newRate,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      source: 'ExchangeRate-API'
    }, { merge: true });

    logger.info(`[ExchangeRate] Firestore 환율 업데이트 완료: ${newRate}원`);

    return { rate: newRate, updated: true };
  } catch (error) {
    logger.error('[ExchangeRate] 환율 업데이트 오류:', error);
    return { rate: USD_TO_KRW, updated: false };
  }
}

/**
 * Firestore에서 저장된 환율 불러오기
 * @returns {Promise<number>}
 */
async function loadExchangeRate() {
  try {
    const exchangeRateRef = db.collection("Settings").doc("exchangeRate");
    const doc = await exchangeRateRef.get();

    if (doc.exists && doc.data().USD_KRW) {
      USD_TO_KRW = doc.data().USD_KRW;
      logger.info(`[ExchangeRate] Firestore에서 환율 로드: ${USD_TO_KRW}원`);
    }

    return USD_TO_KRW;
  } catch (error) {
    logger.warn('[ExchangeRate] 환율 로드 실패, 기본값 사용:', USD_TO_KRW);
    return USD_TO_KRW;
  }
}

/**
 * 현재 환율 반환
 * @returns {number}
 */
function getCurrentExchangeRate() {
  return USD_TO_KRW;
}

/**
 * Yahoo Finance에서 주식 가격 가져오기
 * @param {string} symbol - 주식 심볼 (예: '005930.KS', 'AAPL')
 * @returns {Promise<{price: number, change: number, changePercent: number} | null>}
 */
/**
 * currentTradingPeriod를 사용하여 marketState 계산
 * @param {object} meta - Yahoo Finance API의 meta 객체
 * @returns {string} 'REGULAR', 'PRE', 'POST', 'CLOSED'
 */
function calculateMarketState(meta) {
  // Yahoo Finance가 marketState를 직접 제공하면 그대로 사용
  if (meta.marketState) {
    return meta.marketState;
  }

  // currentTradingPeriod를 사용해 직접 계산
  const tradingPeriod = meta.currentTradingPeriod;
  if (!tradingPeriod) {
    return 'CLOSED';
  }

  const now = Math.floor(Date.now() / 1000); // 현재 시간 (Unix timestamp)

  const preStart = tradingPeriod.pre?.start || 0;
  const preEnd = tradingPeriod.pre?.end || 0;
  const regularStart = tradingPeriod.regular?.start || 0;
  const regularEnd = tradingPeriod.regular?.end || 0;
  const postStart = tradingPeriod.post?.start || 0;
  const postEnd = tradingPeriod.post?.end || 0;

  // 장중 (Regular Market Hours)
  if (now >= regularStart && now < regularEnd) {
    return 'REGULAR';
  }

  // 장전 (Pre-Market)
  if (now >= preStart && now < preEnd) {
    return 'PRE';
  }

  // 장후 (Post-Market/After Hours)
  if (now >= postStart && now < postEnd) {
    return 'POST';
  }

  // 그 외는 장마감
  return 'CLOSED';
}

async function fetchYahooFinancePrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      logger.warn(`[RealStock] Yahoo Finance API 응답 실패: ${symbol} - ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      logger.warn(`[RealStock] Yahoo Finance 데이터 없음: ${symbol}`);
      return null;
    }

    const result = data.chart.result[0];
    const meta = result.meta;

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    // marketState 계산: Yahoo Finance의 marketState 또는 currentTradingPeriod 기반 계산
    const marketState = calculateMarketState(meta);

    logger.info(`[RealStock] ${symbol} - marketState: ${marketState}, price: ${currentPrice}`);

    return {
      price: currentPrice,
      previousClose: previousClose,
      change: change,
      changePercent: changePercent,
      currency: meta.currency,
      marketState: marketState
    };
  } catch (error) {
    logger.error(`[RealStock] Yahoo Finance 호출 오류 (${symbol}):`, error.message);
    return null;
  }
}

/**
 * 여러 주식의 가격을 한 번에 가져오기
 * @param {string[]} symbols - 주식 심볼 배열
 * @returns {Promise<Map<string, object>>}
 */
async function fetchMultipleStockPrices(symbols) {
  const results = new Map();

  // 🔥 Rate limiting 강화: 순차 요청 + 긴 딜레이
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const data = await fetchYahooFinancePrice(symbol);
      if (data) {
        results.set(symbol, data);
      }
    } catch (error) {
      logger.warn(`[RealStock] ${symbol} 가져오기 실패:`, error.message);
    }

    // Rate limiting 방지를 위한 딜레이 (1.5초)
    if (i < symbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return results;
}

/**
 * 실제 주식 가격으로 CentralStocks 업데이트
 * @returns {Promise<{updated: number, failed: number, skipped: number}>}
 */
async function updateRealStockPrices() {
  logger.info("[RealStock] 실제 주식 가격 업데이트 시작");

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // 먼저 저장된 환율 로드
    await loadExchangeRate();

    // isRealStock: true인 주식만 가져오기
    const stocksSnapshot = await db.collection("CentralStocks")
      .where("isRealStock", "==", true)
      .where("isListed", "==", true)
      .get();

    if (stocksSnapshot.empty) {
      logger.info("[RealStock] 실제 주식 데이터가 없습니다.");
      return { updated: 0, failed: 0, skipped: 0 };
    }

    // 현재 KST 시간 계산 (미국주식 fetch 시간 판단용)
    const now = new Date();
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const kstHour = kstTime.getUTCHours();
    // 미국주식은 아침 6~8시 KST에만 fetch (미국 장 마감 후 최종 종가)
    const isUSStockFetchTime = kstHour >= 6 && kstHour < 8;

    // 심볼 수집
    const stocksToUpdate = [];
    let usSkipped = 0;
    let etfBondSkipped = 0;
    stocksSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const symbol = data.realStockSymbol || REAL_STOCK_SYMBOLS[data.name];
      if (symbol) {
        const isUSD = !symbol.includes('.KS') && !symbol.includes('.KQ');
        // 미국주식은 아침 시간대에만 fetch
        if (isUSD && !isUSStockFetchTime) {
          usSkipped++;
          return;
        }
        // ETF/채권은 장중 1시간에 1번만 업데이트
        const pType = data.productType || 'stock';
        if (pType === 'etf' || pType === 'bond') {
          const lastUpd = data.lastUpdated?.toDate?.() || data.lastUpdated;
          if (lastUpd) {
            const msSinceUpdate = now.getTime() - new Date(lastUpd).getTime();
            if (msSinceUpdate < 55 * 60 * 1000) { // 55분 이내면 건너뜀
              etfBondSkipped++;
              return;
            }
          }
        }
        stocksToUpdate.push({
          docRef: doc.ref,
          docId: doc.id,
          name: data.name,
          symbol: symbol,
          currentPrice: data.price,
          priceHistory: data.priceHistory || [],
          isUSD: isUSD,
          dividendYieldAnnual: data.dividendYieldAnnual,
        });
      } else {
        logger.warn(`[RealStock] ${data.name} - 심볼을 찾을 수 없음`);
        skipped++;
      }
    });

    if (usSkipped > 0) {
      logger.info(`[RealStock] 미국주식 ${usSkipped}개 건너뜀 (KST ${kstHour}시 - 아침 6~8시에만 fetch)`);
    }
    if (etfBondSkipped > 0) {
      logger.info(`[RealStock] ETF/채권 ${etfBondSkipped}개 건너뜀 (1시간 이내 업데이트됨)`);
    }

    if (stocksToUpdate.length === 0) {
      logger.info("[RealStock] 업데이트할 실제 주식이 없습니다.");
      return { updated: 0, failed: 0, skipped: skipped + usSkipped };
    }

    // Yahoo Finance에서 가격 가져오기
    const symbols = stocksToUpdate.map(s => s.symbol);
    const priceData = await fetchMultipleStockPrices(symbols);

    // Firestore 배치 업데이트
    const batch = db.batch();

    for (const stock of stocksToUpdate) {
      const data = priceData.get(stock.symbol);

      if (!data) {
        logger.warn(`[RealStock] ${stock.name} (${stock.symbol}) - 가격 데이터 없음`);
        failed++;
        continue;
      }

      // 실물 가격 (KRW 환산) — 학생 화면 비교 표시 및 mean reversion 기준점
      const realPriceKRW = stock.isUSD
        ? Math.round(data.price * USD_TO_KRW)
        : Math.round(data.price);

      // 직전 실물 가격 (KRW) — 변동률 계산용
      const prevRealStored = stock.realStockData?.lastPriceKRW
        || (stock.realStockData?.lastPrice
              ? (stock.isUSD
                   ? Math.round(stock.realStockData.lastPrice * USD_TO_KRW)
                   : Math.round(stock.realStockData.lastPrice))
              : null)
        || realPriceKRW;

      // ── 실물가 그대로 미러링 ──
      // ×10 변동성/Mean Reversion 폐기. 실물가(KRW 환산)를 가격으로 그대로 사용.
      // 사유: 변동성 증폭이 학생 학습에 부정적 효과 — 실제 시장과 다른 흐름 혼란.
      const newPrice = Math.max(100, realPriceKRW);

      // 전일 종가 KRW 환산 (변동률 계산용 — 클라이언트가 (price-prev)/prev*100 으로 직접 계산)
      const previousCloseKRW = data.previousClose
        ? (stock.isUSD
            ? Math.round(data.previousClose * USD_TO_KRW)
            : Math.round(data.previousClose))
        : 0;

      // 가격 이력 업데이트 (최대 20개)
      const newHistory = [...stock.priceHistory.slice(-19), newPrice];

      const updatePayload = {
        price: newPrice,
        priceHistory: newHistory,
        // 전일 종가: KRW 환산값 저장 (price와 같은 단위로 통일 — 변동률 정확 계산)
        previousClose: previousCloseKRW,
        // 변동률은 실물 변동률 그대로 사용 (전일 종가 대비)
        changePercent: data.changePercent || 0,
        marketState: data.marketState || 'CLOSED',
        volatilityMultiplier: 1,
        realStockData: {
          lastPrice: data.price || 0,
          lastPriceKRW: realPriceKRW, // 학생 화면 비교 표시용
          previousClose: data.previousClose || 0,
          change: data.change || 0,
          changePercent: data.changePercent || 0, // 실물 기준 변동률
          currency: data.currency || 'KRW',
          marketState: data.marketState || 'CLOSED',
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        },
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };

      // 배당률(dividendYieldAnnual)은 미설정 종목에만 매핑값 자동 부여 (admin 수동 변경 보존)
      if (stock.dividendYieldAnnual === undefined || stock.dividendYieldAnnual === null) {
        const yieldFromMap = STOCK_DIVIDEND_YIELDS_BY_SYMBOL[stock.symbol];
        if (yieldFromMap !== undefined) {
          updatePayload.dividendYieldAnnual = yieldFromMap;
        }
      }

      batch.update(stock.docRef, updatePayload);

      logger.info(`[RealStock] ${stock.name}: ${stock.currentPrice} -> ${newPrice} (실물가 ${realPriceKRW}원, 변동 ${(data.changePercent || 0).toFixed(2)}%)`);
      updated++;
    }

    await batch.commit();

    logger.info(`[RealStock] 업데이트 완료 - 성공: ${updated}, 실패: ${failed}, 건너뜀: ${skipped}`);

    return { updated, failed, skipped };
  } catch (error) {
    logger.error("[RealStock] 업데이트 중 오류:", error);
    throw error;
  }
}

/**
 * CentralStocks 전체를 캐싱 문서(Settings/centralStocksCache)로 스냅샷 저장
 * 클라이언트가 단일 문서만 읽도록 해 읽기 횟수 절감
 * @returns {Promise<{count: number}>}
 */
async function updateCentralStocksSnapshot() {
  logger.info("[RealStock] CentralStocks 스냅샷 생성 시작");

  const snapshot = await db.collection("CentralStocks")
    .where("isListed", "==", true)
    .get();

  const stocks = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      price: data.price,
      initialPrice: data.initialPrice,
      minListingPrice: data.minListingPrice,
      isListed: data.isListed,
      isManual: data.isManual,
      isRealStock: data.isRealStock,
      productType: data.productType,
      sector: data.sector,
      volatility: data.volatility,
      holderCount: data.holderCount,
      tradingVolume: data.tradingVolume,
      buyVolume: data.buyVolume,
      sellVolume: data.sellVolume,
      recentBuyVolume: data.recentBuyVolume,
      recentSellVolume: data.recentSellVolume,
      priceHistory: (data.priceHistory || []).slice(-20), // 최근 20개까지만
      realStockSymbol: data.realStockSymbol || null,
      realStockData: data.realStockData || null,
      previousClose: data.previousClose || null,
      changePercent: data.changePercent ?? null,
      marketState: data.marketState || null,
      lastUpdated: data.lastUpdated || null,
    };
  });

  const cacheRef = db.collection("Settings").doc("centralStocksCache");
  await cacheRef.set({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    count: stocks.length,
    stocks,
  }, { merge: true });

  logger.info(`[RealStock] 스냅샷 저장 완료 - ${stocks.length}개`);
  return { count: stocks.length };
}

/**
 * 스냅샷 문서를 읽어서 반환. 없으면 생성 후 반환.
 * @returns {Promise<{stocks: Array, count: number}>}
 */
async function getCentralStocksSnapshot() {
  const cacheRef = db.collection("Settings").doc("centralStocksCache");
  const docSnap = await cacheRef.get();

  if (docSnap.exists) {
    const data = docSnap.data() || {};
    return { stocks: data.stocks || [], count: data.count || 0 };
  }

  // 스냅샷이 없으면 새로 생성
  const result = await updateCentralStocksSnapshot();
  const newDoc = await cacheRef.get();
  const data = newDoc.exists ? newDoc.data() : {};
  return { stocks: data.stocks || [], count: result.count || 0 };
}

/**
 * 초기 실제 주식 데이터 생성 (관리자용)
 * @param {Array} stockConfigs - 추가할 실제 주식 설정 배열
 * @returns {Promise<{created: number}>}
 */
async function createRealStocks(stockConfigs) {
  logger.info("[RealStock] 실제 주식 생성 시작");

  // 기존 주식 심볼 조회 (중복 방지)
  const existingSnap = await db.collection("CentralStocks")
    .where("isRealStock", "==", true)
    .get();
  const existingSymbols = new Set();
  existingSnap.forEach(doc => {
    const sym = doc.data().realStockSymbol;
    if (sym) existingSymbols.add(sym);
  });
  logger.info(`[RealStock] 기존 실제 주식 ${existingSymbols.size}개 확인됨`);

  const batch = db.batch();
  let created = 0;
  let skipped = 0;

  for (const config of stockConfigs) {
    const symbol = config.symbol || REAL_STOCK_SYMBOLS[config.name];
    if (!symbol) {
      logger.warn(`[RealStock] ${config.name} - 심볼을 찾을 수 없음`);
      continue;
    }

    // 중복 체크
    if (existingSymbols.has(symbol)) {
      logger.info(`[RealStock] ${config.name} (${symbol}) - 이미 존재, 스킵`);
      skipped++;
      continue;
    }

    // 현재 가격 가져오기
    const priceData = await fetchYahooFinancePrice(symbol);
    if (!priceData) {
      logger.warn(`[RealStock] ${config.name} - 가격을 가져올 수 없음`);
      continue;
    }

    // USD -> KRW 변환
    const isUSD = !symbol.includes('.KS') && !symbol.includes('.KQ');
    let price = priceData.price;
    if (isUSD) {
      price = Math.round(priceData.price * USD_TO_KRW);
    } else {
      price = Math.round(priceData.price);
    }

    const docRef = db.collection("CentralStocks").doc();

    const previousCloseKRW = priceData.previousClose
      ? (isUSD
          ? Math.round(priceData.previousClose * USD_TO_KRW)
          : Math.round(priceData.previousClose))
      : 0;

    batch.set(docRef, {
      name: config.name,
      price: price,
      initialPrice: price,
      minListingPrice: Math.round(price * 0.3), // 초기가의 30%
      priceHistory: [price],
      isListed: true,
      isManual: false,
      isRealStock: true, // 실제 주식 플래그
      realStockSymbol: symbol,
      sector: config.sector || 'TECH',
      productType: config.productType || 'stock',
      volatility: 0.02,
      holderCount: 0,
      tradingVolume: 1000,
      buyVolume: 0,
      sellVolume: 0,
      recentBuyVolume: 0,
      recentSellVolume: 0,
      previousClose: previousCloseKRW, // KRW 환산 (price와 같은 단위)
      changePercent: priceData.changePercent || 0,
      marketState: priceData.marketState || 'CLOSED',
      realStockData: {
        lastPrice: priceData.price || 0,
        previousClose: priceData.previousClose || 0,
        change: priceData.change || 0,
        changePercent: priceData.changePercent || 0,
        currency: priceData.currency || 'KRW',
        marketState: priceData.marketState || 'CLOSED',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`[RealStock] ${config.name} (${symbol}) - ${price}원 생성됨`);
    created++;
  }

  await batch.commit();

  logger.info(`[RealStock] 실제 주식 ${created}개 생성, ${skipped}개 스킵 (중복)`);

  return { created, skipped };
}

// 기본 실제 주식 설정 (주식 14개 + ETF 2개 + 채권 2개)
const DEFAULT_REAL_STOCKS = [
  // 한국 주식 (8개)
  { name: '삼성전자', sector: 'TECH', productType: 'stock' },
  { name: 'SK하이닉스', sector: 'TECH', productType: 'stock' },
  { name: 'NAVER', sector: 'TECH', productType: 'stock' },
  { name: '카카오', sector: 'TECH', productType: 'stock' },
  { name: '현대차', sector: 'INDUSTRIAL', productType: 'stock' },
  { name: 'KB금융', sector: 'FINANCE', productType: 'stock' },
  { name: 'KT', sector: 'TECH', productType: 'stock' },
  { name: '한화에어로스페이스', sector: 'INDUSTRIAL', productType: 'stock' },
  // 미국 주식 (6개)
  { name: 'Apple', sector: 'TECH', productType: 'stock' },
  { name: 'Tesla', sector: 'INDUSTRIAL', productType: 'stock' },
  { name: 'NVIDIA', sector: 'TECH', productType: 'stock' },
  { name: 'Microsoft', sector: 'TECH', productType: 'stock' },
  { name: 'Amazon', sector: 'TECH', productType: 'stock' },
  { name: 'Google', sector: 'TECH', productType: 'stock' },
  // ETF
  { name: 'KODEX 200', sector: 'INDEX', productType: 'etf' },
  { name: 'SPY', sector: 'INDEX', productType: 'etf' },
  // 채권 ETF
  { name: 'TLT', sector: 'BOND', productType: 'bond' },
  { name: 'KOSEF 국고채10년', sector: 'BOND', productType: 'bond' },
];

/**
 * 개별 실제 주식/ETF 추가 (관리자용)
 * @param {object} config - { name, symbol?, sector?, productType? }
 * @returns {Promise<{success: boolean, stock?: object, error?: string}>}
 */
async function addSingleRealStock(config) {
  logger.info(`[RealStock] 개별 실제 주식 추가: ${config.name}`);

  try {
    // 심볼 확인 (직접 입력 또는 매핑에서 찾기)
    const symbol = config.symbol || REAL_STOCK_SYMBOLS[config.name];
    if (!symbol) {
      return {
        success: false,
        error: `심볼을 찾을 수 없습니다. 심볼을 직접 입력해주세요. (예: AAPL, 005930.KS)`
      };
    }

    // 중복 확인
    const existingStock = await db.collection("CentralStocks")
      .where("realStockSymbol", "==", symbol)
      .limit(1)
      .get();

    if (!existingStock.empty) {
      return {
        success: false,
        error: `이미 등록된 주식입니다: ${config.name} (${symbol})`
      };
    }

    // 환율 로드
    await loadExchangeRate();

    // 현재 가격 가져오기
    const priceData = await fetchYahooFinancePrice(symbol);
    if (!priceData) {
      return {
        success: false,
        error: `가격을 가져올 수 없습니다. 심볼을 확인해주세요: ${symbol}`
      };
    }

    // USD -> KRW 변환
    const isUSD = !symbol.includes('.KS') && !symbol.includes('.KQ');
    let price = priceData.price;
    if (isUSD) {
      price = Math.round(priceData.price * USD_TO_KRW);
    } else {
      price = Math.round(priceData.price);
    }

    // productType 자동 감지
    let productType = config.productType || 'stock';
    const symbolUpper = symbol.toUpperCase();
    if (['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'BND', 'GLD', 'SLV', 'USO'].includes(symbolUpper) ||
        config.name.includes('KODEX') || config.name.includes('TIGER') || config.name.includes('KOSEF')) {
      productType = 'etf';
    }

    // 채권 ETF 감지
    if (['TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'BND'].includes(symbolUpper) ||
        config.name.includes('국고채') || config.name.includes('채권')) {
      productType = 'etf'; // 채권 ETF도 ETF 타입으로
    }

    const previousCloseKRW = priceData.previousClose
      ? (isUSD
          ? Math.round(priceData.previousClose * USD_TO_KRW)
          : Math.round(priceData.previousClose))
      : 0;

    const docRef = db.collection("CentralStocks").doc();
    const stockData = {
      name: config.name,
      price: price,
      initialPrice: price,
      minListingPrice: Math.round(price * 0.3),
      priceHistory: [price],
      isListed: true,
      isManual: false,
      isRealStock: true,
      realStockSymbol: symbol,
      sector: config.sector || 'TECH',
      productType: productType,
      volatility: 0.02,
      holderCount: 0,
      tradingVolume: 1000,
      buyVolume: 0,
      sellVolume: 0,
      recentBuyVolume: 0,
      recentSellVolume: 0,
      previousClose: previousCloseKRW, // KRW 환산 (price와 같은 단위)
      changePercent: priceData.changePercent || 0,
      marketState: priceData.marketState || 'CLOSED',
      realStockData: {
        lastPrice: priceData.price || 0,
        previousClose: priceData.previousClose || 0,
        change: priceData.change || 0,
        changePercent: priceData.changePercent || 0,
        currency: priceData.currency || 'KRW',
        marketState: priceData.marketState || 'CLOSED',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(stockData);

    logger.info(`[RealStock] ${config.name} (${symbol}) - ${price}원 추가 완료`);

    return {
      success: true,
      stock: {
        id: docRef.id,
        name: config.name,
        symbol: symbol,
        price: price,
        productType: productType,
        currency: isUSD ? 'USD' : 'KRW'
      }
    };
  } catch (error) {
    logger.error(`[RealStock] 개별 주식 추가 오류:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 사용 가능한 실제 주식 심볼 목록 반환
 * @returns {object}
 */
function getAvailableSymbols() {
  return {
    korean_stocks: Object.entries(REAL_STOCK_SYMBOLS)
      .filter(([name, symbol]) => symbol.includes('.KS') || symbol.includes('.KQ'))
      .filter(([name, symbol]) => !name.includes('KODEX') && !name.includes('TIGER') && !name.includes('KOSEF'))
      .map(([name, symbol]) => ({ name, symbol })),
    us_stocks: Object.entries(REAL_STOCK_SYMBOLS)
      .filter(([name, symbol]) => !symbol.includes('.') && !['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'BND', 'GLD', 'SLV', 'USO'].includes(symbol))
      .map(([name, symbol]) => ({ name, symbol })),
    korean_etf: Object.entries(REAL_STOCK_SYMBOLS)
      .filter(([name, symbol]) => name.includes('KODEX') || name.includes('TIGER') || name.includes('KOSEF'))
      .map(([name, symbol]) => ({ name, symbol })),
    us_etf: ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'].map(s => ({ name: s, symbol: s })),
    bond_etf: ['TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'BND'].map(s => ({ name: s, symbol: s })),
    commodity_etf: ['GLD', 'SLV', 'USO'].map(s => ({ name: s, symbol: s }))
  };
}

/**
 * 중복 주식 정리 - 같은 심볼의 주식이 여러 개 있으면 하나만 남기고 삭제
 * 보유자가 있는 문서를 우선 보존, 없으면 최신 문서 보존
 * @returns {Promise<{deleted: number, kept: number}>}
 */
async function deduplicateStocks() {
  logger.info("[RealStock] 중복 주식 정리 시작");

  const allStocksSnap = await db.collection("CentralStocks").get();
  const symbolMap = {}; // symbol -> [docs]

  allStocksSnap.forEach(docSnap => {
    const data = docSnap.data();
    const key = data.realStockSymbol || data.name; // 심볼 또는 이름 기준
    if (!symbolMap[key]) symbolMap[key] = [];
    symbolMap[key].push({ id: docSnap.id, data });
  });

  const batch = db.batch();
  let deleted = 0;
  let kept = 0;

  for (const [key, docs] of Object.entries(symbolMap)) {
    if (docs.length <= 1) {
      kept++;
      continue;
    }

    // 보유자 있는 문서 우선, 없으면 holderCount 높은 것, 그것도 같으면 첫 번째 보존
    docs.sort((a, b) => (b.data.holderCount || 0) - (a.data.holderCount || 0));
    const keepDoc = docs[0];
    kept++;

    for (let i = 1; i < docs.length; i++) {
      batch.delete(db.collection("CentralStocks").doc(docs[i].id));
      deleted++;
      logger.info(`[RealStock] 중복 삭제: ${key} (docId: ${docs[i].id})`);
    }
  }

  if (deleted > 0) {
    await batch.commit();
  }

  logger.info(`[RealStock] 중복 정리 완료: ${deleted}개 삭제, ${kept}개 유지`);
  return { deleted, kept };
}

module.exports = {
  fetchYahooFinancePrice,
  fetchMultipleStockPrices,
  updateRealStockPrices,
  updateCentralStocksSnapshot,
  getCentralStocksSnapshot,
  createRealStocks,
  addSingleRealStock,
  getAvailableSymbols,
  deduplicateStocks,
  // 환율 관련
  fetchExchangeRate,
  updateExchangeRate,
  loadExchangeRate,
  getCurrentExchangeRate,
  // 상수
  REAL_STOCK_SYMBOLS,
  DEFAULT_REAL_STOCKS,
  get USD_TO_KRW() { return USD_TO_KRW; }
};
