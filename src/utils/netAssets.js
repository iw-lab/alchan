// 순자산(총자산 - 대출) 계산 유틸
// AssetSummary의 assetCache_${userId} 캐시(5분 TTL)를 공유한다.
// 캐시가 없거나 만료된 경우 Firestore에서 직접 로드한다.
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { logger } from "./logger";

const CACHE_TTL = 5 * 60 * 1000;

function readAssetCache(userId) {
  try {
    const cached = localStorage.getItem(`assetCache_${userId}`);
    if (!cached) return null;
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts >= CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 파킹통장 등 자산 변동 직후, 순자산을 5분 TTL 캐시로 표시하는 화면들이 옛 값을 계속
 * 보여주지 않도록 관련 localStorage 캐시를 모두 무효화한다. 다음 진입/폴링 시 fresh 로드.
 * - assetCache_{uid}: netAssets/FinancialRestrictionBanner 공유 캐시
 * - firestore_cache_myAssets_{uid}: MyAssets "총 순자산" 캐시(+ 레거시 더블 suffix)
 * 입금은 cash↔parking 상쇄라 실제 순자산은 불변인데, cash만 실시간이고 parking이 캐시라
 * 입금 직후 순자산이 입금액만큼 잠깐 낮게 보이던 버그를 차단한다.
 */
export function invalidateAssetCaches(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(`assetCache_${userId}`);
    localStorage.removeItem(`firestore_cache_myAssets_${userId}`);
    localStorage.removeItem(`firestore_cache_myAssets_${userId}_${userId}`);
  } catch {
    /* localStorage 접근 실패 무시 */
  }
}

async function loadAssetDataFromDb(userId, userName, classCode) {
  const promises = [];

  promises.push(
    getDoc(doc(db, "users", userId, "financials", "parkingAccount"))
      .then((snap) => (snap.exists() ? snap.data().balance || 0 : 0))
      .catch(() => 0),
  );

  // 예금/적금/대출은 모두 users/{uid}/products 컬렉션(type=deposit|savings|loan)이 정식
  // 소스다(ParkingAccount가 생성/상환, 자동상환 훅도 이 경로 사용). 과거 financials/loans
  // 문서는 write가 사라진 죽은 경로라 항상 비어, 대출이 0으로 잡혀 순자산이 과대(부채 미차감)
  // 표시되던 버그를 차단한다. 한 번의 읽기로 세 종류를 함께 분류한다.
  promises.push(
    getDocs(collection(db, "users", userId, "products"))
      .then((snap) => {
        const deposits = [];
        const savings = [];
        const loans = [];
        snap.docs.forEach((d) => {
          const p = d.data();
          if (p.type === "deposit") deposits.push(p);
          else if (p.type === "savings") savings.push(p);
          else if (p.type === "loan") loans.push(p);
        });
        return { deposits, savings, loans };
      })
      .catch(() => ({ deposits: [], savings: [], loans: [] })),
  );

  // 부동산: realEstateProperties.owner 필드는 소유자 UID(=userId)로 저장된다(서버 거래/등록
  // 로직 기준). 과거 owner==userName(이름) 쿼리는 항상 빈 결과라 부동산이 순자산에서 누락됐다.
  if (classCode && userId) {
    promises.push(
      getDocs(
        query(
          collection(db, "classes", classCode, "realEstateProperties"),
          where("owner", "==", userId),
        ),
      )
        .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        .catch(() => []),
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  promises.push(
    getDocs(collection(db, "users", userId, "portfolio"))
      .then((snap) => {
        const holdings = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.quantity > 0) {
            holdings.push({ stockId: parseInt(d.id) || d.id, ...data });
          }
        });
        return { holdings };
      })
      .catch(() => ({ holdings: [] })),
  );

  // 주식 시세: 전역 미러 문서 1개만 읽음(읽기 비용 최소).
  // 정식 소스는 CentralStocks 컬렉션이고 Settings/centralStocksCache는 realStockService가
  // 갱신하는 살아있는 스냅샷이다. 과거 classes/{classCode}/stocks/stockList 경로는 write가
  // 사라진 죽은 경로라 항상 비어, 주식이 순자산에서 통째로 누락되던 버그를 차단한다.
  promises.push(
    getDoc(doc(db, "Settings", "centralStocksCache"))
      .then((snap) => {
        if (!snap.exists()) return [];
        const d = snap.data();
        return Array.isArray(d.stocks) ? d.stocks : [];
      })
      .catch(() => []),
  );

  const [parking, products, realEstate, portfolio, stocks] =
    await Promise.all(promises);

  const data = {
    parking,
    deposits: products.deposits,
    savings: products.savings,
    loans: products.loans,
    realEstate,
    portfolio,
    stocks,
  };

  // 🔥 [비용 최적화] AssetSummary와 공유하는 5분 캐시에 직접 기록.
  // 기존엔 readAssetCache로 "읽기만" 하고 쓰지 않아, 자산 페이지(AssetSummary)가 아닌
  // 화면에서는 캐시가 영원히 비어 매 호출(특히 FinancialRestrictionBanner 60초 폴링)마다
  // 풀로드(5문서)가 발생했다. 이제 어디서 호출하든 5분간 캐시 재사용 → 읽기 급감.
  try {
    localStorage.setItem(
      `assetCache_${userId}`,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    /* 저장 실패 무시 */
  }

  return data;
}

function computeNetAssets({
  cash = 0,
  coupons = 0,
  couponValue = 1000,
  data,
}) {
  const parking = data?.parking || 0;
  const deposits = Array.isArray(data?.deposits) ? data.deposits : [];
  const savings = Array.isArray(data?.savings) ? data.savings : [];
  const loans = Array.isArray(data?.loans) ? data.loans : [];
  const realEstate = Array.isArray(data?.realEstate) ? data.realEstate : [];
  const portfolio = data?.portfolio || { holdings: [] };
  const stocks = Array.isArray(data?.stocks) ? data.stocks : [];

  const couponValueTotal = coupons * couponValue;
  const depositSavingsTotal = [...deposits, ...savings].reduce(
    (sum, p) => sum + (Number(p.balance) || 0),
    0,
  );
  const realEstateValue = realEstate.reduce(
    (sum, a) => sum + (Number(a.price) || Number(a.value) || 0),
    0,
  );
  const stockValue = (portfolio.holdings || []).reduce((sum, h) => {
    // 주식 매칭은 문자열 기준으로 통일(portfolio docId가 숫자형이어도 타입 미스매치 방지).
    const info = stocks.find((s) => String(s.id) === String(h.stockId));
    if (info && info.isListed && h.quantity > 0) {
      return sum + (Number(info.price) || 0) * h.quantity;
    }
    return sum;
  }, 0);
  const loanBalance = loans.reduce(
    (sum, l) =>
      sum + (Number(l.remainingPrincipal) || Number(l.balance) || 0),
    0,
  );
  return (
    (Number(cash) || 0) +
    couponValueTotal +
    parking +
    depositSavingsTotal +
    stockValue +
    realEstateValue -
    loanBalance
  );
}

function sumLoanBalance(loans) {
  return (Array.isArray(loans) ? loans : []).reduce(
    (sum, l) => sum + (Number(l.remainingPrincipal) || Number(l.balance) || 0),
    0,
  );
}

/**
 * 순자산 + 대출 합계를 한 번의 (캐시 우선) 로드로 함께 반환한다.
 * FinancialRestrictionBanner가 net과 loan을 둘 다 필요로 하므로, loans 문서를
 * 별도로 또 읽지 않도록 동일 데이터에서 함께 계산한다.
 * @returns {Promise<{net:number, loanTotal:number}>}
 */
export async function getNetAssetsDetail(user, couponValue = 1000) {
  if (!user || !user.id) return { net: 0, loanTotal: 0 };
  const cash = Number(user.cash) || 0;
  const coupons = Number(user.coupons) || 0;

  let data = readAssetCache(user.id);
  if (!data) {
    try {
      data = await loadAssetDataFromDb(user.id, user.name, user.classCode);
    } catch (e) {
      logger.error("[netAssets] 로드 실패:", e);
      data = null;
    }
  }
  const net = computeNetAssets({ cash, coupons, couponValue, data });
  const loanTotal = sumLoanBalance(data?.loans);
  return { net, loanTotal };
}

/**
 * 사용자의 순자산을 계산한다. 캐시 우선, 없으면 Firestore 로드.
 * @returns {Promise<number>} 순자산 (음수 가능)
 */
export async function getNetAssets(user, couponValue = 1000) {
  return (await getNetAssetsDetail(user, couponValue)).net;
}

/**
 * 순자산이 마이너스인지 확인 (실패 시 false 반환 — 과도한 차단 방지)
 */
export async function isNetAssetsNegative(user, couponValue = 1000) {
  try {
    const net = await getNetAssets(user, couponValue);
    return net < 0;
  } catch (e) {
    logger.error("[netAssets] 판정 실패:", e);
    return false;
  }
}

export const NEGATIVE_ASSETS_MESSAGE =
  "순자산이 마이너스입니다. 대출 상환·자산 매도·과제 보상 등으로 자산을 회복한 후 이용해주세요.";
