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

  promises.push(
    getDoc(doc(db, "users", userId, "financials", "loans"))
      .then((snap) => {
        if (!snap.exists()) return [];
        const d = snap.data();
        return Array.isArray(d.activeLoans) ? d.activeLoans : [];
      })
      .catch(() => []),
  );

  if (classCode && userName) {
    promises.push(
      getDocs(
        query(
          collection(db, "classes", classCode, "realEstateProperties"),
          where("owner", "==", userName),
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

  if (classCode) {
    promises.push(
      getDoc(doc(db, "classes", classCode, "stocks", "stockList"))
        .then((snap) => {
          if (!snap.exists()) return [];
          const d = snap.data();
          return Array.isArray(d.stocks) ? d.stocks : [];
        })
        .catch(() => []),
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  const [parking, loans, realEstate, portfolio, stocks] =
    await Promise.all(promises);

  const data = { parking, loans, realEstate, portfolio, stocks };

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
  const loans = Array.isArray(data?.loans) ? data.loans : [];
  const realEstate = Array.isArray(data?.realEstate) ? data.realEstate : [];
  const portfolio = data?.portfolio || { holdings: [] };
  const stocks = Array.isArray(data?.stocks) ? data.stocks : [];

  const couponValueTotal = coupons * couponValue;
  const realEstateValue = realEstate.reduce(
    (sum, a) => sum + (a.price || 0),
    0,
  );
  const stockValue = (portfolio.holdings || []).reduce((sum, h) => {
    const info = stocks.find((s) => s.id === h.stockId);
    if (info && info.isListed && h.quantity > 0) {
      return sum + info.price * h.quantity;
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
