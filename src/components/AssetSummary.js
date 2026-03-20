import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { logger } from "../utils/logger";
import { formatKoreanCurrency } from "../utils/numberFormatter";
import { LevelInline } from "./LevelBadge";

export default function AssetSummary({
  user,
  couponValue = 1000,
  setShowTransferModal,
}) {
  const {
    id: userId,
    name: userName,
    classCode,
    cash: currentCash = 0,
    coupons = 0,
  } = user || {};

  const [parkingBalance, setParkingBalance] = useState(0);
  const [loans, setLoans] = useState([]);
  const [realEstateAssets, setRealEstateAssets] = useState([]);
  const [userPortfolio, setUserPortfolio] = useState({ holdings: [] });
  const [allStocks, setAllStocks] = useState([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [loading, setLoading] = useState(true);

  // Firestore에서 데이터 로딩 (5분 TTL 캐시로 DB 사용량 최소화)
  useEffect(() => {
    if (!userId) {
      setParkingBalance(0);
      setLoans([]);
      setRealEstateAssets([]);
      setUserPortfolio({ holdings: [] });
      setAllStocks([]);
      setLoading(false);
      return;
    }

    const CACHE_KEY = `assetCache_${userId}`;
    const CACHE_TTL = 5 * 60 * 1000; // 5분

    // 캐시 확인
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          // 캐시 유효 → Firestore 읽기 0회
          setParkingBalance(data.parking || 0);
          setLoans(data.loans || []);
          setRealEstateAssets(data.realEstate || []);
          setUserPortfolio(data.portfolio || { holdings: [] });
          setAllStocks(data.stocks || []);
          setLoading(false);
          return;
        }
      }
    } catch { /* 캐시 오류 무시 */ }

    const loadData = async () => {
      try {
        const promises = [];

        // 1. 파킹통장
        promises.push(
          getDoc(doc(db, "users", userId, "financials", "parkingAccount"))
            .then((snap) => snap.exists() ? snap.data().balance || 0 : 0)
            .catch(() => 0)
        );

        // 2. 대출 - financials 컬렉션에서 loans 문서
        promises.push(
          getDoc(doc(db, "users", userId, "financials", "loans"))
            .then((snap) => {
              if (snap.exists()) {
                const data = snap.data();
                return Array.isArray(data.activeLoans) ? data.activeLoans : [];
              }
              return [];
            })
            .catch(() => [])
        );

        // 3. 부동산 (classCode 필요)
        if (classCode) {
          promises.push(
            getDocs(query(
              collection(db, "classes", classCode, "realEstateProperties"),
              where("owner", "==", userName)
            ))
              .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
              .catch(() => [])
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        // 4. 주식 포트폴리오
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
            .catch(() => ({ holdings: [] }))
        );

        // 5. 전체 주식 목록 (현재가 확인용)
        if (classCode) {
          promises.push(
            getDoc(doc(db, "classes", classCode, "stocks", "stockList"))
              .then((snap) => {
                if (snap.exists()) {
                  const data = snap.data();
                  return Array.isArray(data.stocks) ? data.stocks : [];
                }
                return [];
              })
              .catch(() => [])
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        const [parking, loanData, realEstate, portfolio, stocks] = await Promise.all(promises);

        setParkingBalance(parking);
        setLoans(loanData);
        setRealEstateAssets(realEstate);
        setUserPortfolio(portfolio);
        setAllStocks(stocks);

        // 캐시 저장 (5분 TTL)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: { parking, loans: loanData, realEstate, portfolio, stocks },
            ts: Date.now(),
          }));
        } catch { /* 저장 실패 무시 */ }
      } catch (error) {
        logger.error("AssetSummary 데이터 로딩 오류:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId, userName, classCode]);

  // 보유 주식 총 가치 계산
  const calculateTotalStockValue = () => {
    if (!allStocks.length || !userPortfolio.holdings.length) return 0;
    return userPortfolio.holdings.reduce((sum, holding) => {
      const stockInfo = allStocks.find((stock) => stock.id === holding.stockId);
      if (stockInfo && stockInfo.isListed && holding.quantity > 0) {
        return sum + stockInfo.price * holding.quantity;
      }
      return sum;
    }, 0);
  };

  // 총 자산 계산
  useEffect(() => {
    const couponValueTotal = coupons * couponValue;
    const realEstateValue = realEstateAssets.reduce((sum, asset) => sum + (asset.price || 0), 0);
    const totalStockValueCalculated = calculateTotalStockValue();
    const totalLoanBalance = loans.reduce((sum, loan) => sum + (loan.remainingPrincipal || 0), 0);
    const calculatedTotalAssets =
      currentCash + couponValueTotal + parkingBalance + totalStockValueCalculated + realEstateValue - totalLoanBalance;
    setTotalAssets(calculatedTotalAssets);
  }, [currentCash, coupons, couponValue, parkingBalance, realEstateAssets, userPortfolio, allStocks, loans]);

  // 계산된 값들
  const totalLoanBalance = loans.reduce((sum, loan) => sum + (loan.remainingPrincipal || 0), 0);
  const totalRealEstateValue = realEstateAssets.reduce((sum, asset) => sum + (asset.price || 0), 0);
  const totalStockValue = calculateTotalStockValue();
  const grossAssets = currentCash + coupons * couponValue + parkingBalance + totalStockValue + totalRealEstateValue;

  const styles = {
    sectionContainer: { marginBottom: "12px" },
    sectionTitle: {
      fontSize: "17px", fontWeight: "600", color: "#374151",
      marginBottom: "8px", paddingBottom: "3px", borderBottom: "1px solid #e5e7eb",
    },
    totalAssetBox: {
      backgroundColor: "#eef2ff", borderRadius: "8px", padding: "12px",
      marginBottom: "15px", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", border: "1px solid #c7d2fe",
    },
    totalAssetTitle: { fontWeight: "bold", fontSize: "17px", color: "#4338ca" },
    totalAssetAmount: { fontWeight: "bold", fontSize: "24px", color: "#4f46e5" },
    totalAssetDesc: { marginTop: "3px", fontSize: "13px", color: "#64748b", textAlign: "right" },
    assetGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" },
    assetItemBox: (bgColor = "#f9fafb", borderColor = "#e5e7eb") => ({
      backgroundColor: bgColor, borderRadius: "6px", padding: "10px",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", border: `1px solid ${borderColor}`,
      display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "110px",
    }),
    assetItemTitle: (color = "#1f2937") => ({
      color, fontWeight: "600", fontSize: "15px", marginBottom: "4px",
      display: "flex", alignItems: "center", gap: "5px",
    }),
    assetItemAmount: (color = "#111827") => ({
      color, fontWeight: "bold", fontSize: "20px", textAlign: "right", wordBreak: "break-all",
    }),
    button: {
      backgroundColor: "#0ea5e9", color: "white", border: "none", borderRadius: "5px",
      padding: "4px 8px", fontSize: "13px", fontWeight: "500", cursor: "pointer",
      transition: "background-color 0.2s ease", marginLeft: "auto", marginTop: "auto", alignSelf: "flex-end",
    },
    progressBarContainer: {
      width: "100%", backgroundColor: "#e5e7eb", borderRadius: "3px", height: "4px", overflow: "hidden", marginTop: "4px",
    },
    progressBar: (widthPercentage, color = "#3b82f6") => ({
      width: `${widthPercentage}%`, height: "100%", backgroundColor: color, transition: "width 0.5s ease-in-out",
    }),
    detailList: { listStyle: "none", paddingLeft: 0, margin: "4px 0 0 0", fontSize: "13px", color: "#4b5563" },
    detailListItem: { marginBottom: "2px", lineHeight: "1.3" },
    amountSubText: { textAlign: "right", color: "#92400e", marginTop: "2px", fontSize: "13px", fontWeight: "500" },
    infoText: { fontSize: "13px", color: "#6b7280", marginTop: "5px" },
  };

  const parkingRatio = grossAssets > 0 ? Math.min(100, (parkingBalance / grossAssets) * 100) : 0;

  if (!user) {
    return <div className="p-5 text-center" style={{...styles.sectionContainer}}>자산 정보를 불러오는 중입니다...</div>;
  }

  if (loading) {
    return <div className="p-5 text-center" style={{...styles.sectionContainer}}>자산 데이터 로딩 중...</div>;
  }

  return (
    <div style={styles.sectionContainer}>
      <h3 style={{ ...styles.sectionTitle, fontSize: "18px", marginBottom: "10px" }}>종합 자산 현황</h3>
      {/* 총 자산 */}
      <div style={styles.totalAssetBox}>
        <div className="flex justify-between items-center mb-1">
          <span style={styles.totalAssetTitle}>📊 총 자산 (순자산)</span>
          <span style={styles.totalAssetAmount}>{formatKoreanCurrency(totalAssets)}</span>
        </div>
        <div className="flex items-center justify-between mt-2 mb-1">
          <LevelInline netAssets={totalAssets} />
          <p className="m-0" style={styles.totalAssetDesc}>(현금 + 쿠폰 + 파킹 + 주식 + 부동산 - 대출)</p>
        </div>
      </div>

      {/* 유동 자산 */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>유동 자산</h4>
        <div style={styles.assetGrid}>
          <div style={styles.assetItemBox("#f0f9ff", "#e0f2fe")}>
            <div>
              <div style={styles.assetItemTitle("#0c4a6e")}>💰 보유 현금</div>
              <div style={styles.assetItemAmount("#0369a1")}>{formatKoreanCurrency(currentCash)}</div>
            </div>
            <button onClick={() => setShowTransferModal(true)} style={styles.button}>송금</button>
          </div>
          <div style={styles.assetItemBox("#f0f9ff", "#e0f2fe")}>
            <div>
              <div style={styles.assetItemTitle("#0c4a6e")}>🅿️ 파킹통장</div>
              <div style={styles.assetItemAmount("#0369a1")}>{formatKoreanCurrency(parkingBalance)}</div>
              <div style={styles.progressBarContainer}><div style={styles.progressBar(parkingRatio, "#38bdf8")}></div></div>
            </div>
            <div className="mt-auto"></div>
          </div>
          <div style={styles.assetItemBox("#fffbeb", "#fef3c7")}>
            <div>
              <div style={styles.assetItemTitle("#b45309")}>🎟️ 보유 쿠폰</div>
              <div style={styles.assetItemAmount("#d97706")}>{coupons} 개</div>
              <p style={styles.amountSubText}>({formatKoreanCurrency(coupons * couponValue)})</p>
            </div>
            <div className="mt-auto"></div>
          </div>
          <div style={styles.assetItemBox("#ecfdf5", "#d1fae5")}>
            <div>
              <div style={styles.assetItemTitle("#065f46")}>📈 보유 주식</div>
              <div style={styles.assetItemAmount("#047857")}>{formatKoreanCurrency(totalStockValue)}</div>
              {userPortfolio.holdings.length > 0 ? (
                <ul style={{ ...styles.detailList, marginTop: "5px" }}>
                  {userPortfolio.holdings.slice(0, 2).map((holding) => {
                    const stockInfo = allStocks.find((stock) => stock.id === holding.stockId);
                    const stockName = stockInfo ? stockInfo.name : `ID: ${holding.stockId}`;
                    const holdingValue = stockInfo && stockInfo.isListed ? stockInfo.price * holding.quantity : 0;
                    if (holding.quantity > 0) {
                      return (
                        <li key={holding.stockId} style={styles.detailListItem}>
                          - {stockName}: {holding.quantity}주 ({formatKoreanCurrency(holdingValue)})
                        </li>
                      );
                    }
                    return null;
                  })}
                  {userPortfolio.holdings.filter((h) => h.quantity > 0).length > 2 && (
                    <li style={styles.detailListItem}>
                      ... 등 {userPortfolio.holdings.filter((h) => h.quantity > 0).length}개 종목
                    </li>
                  )}
                </ul>
              ) : (
                <p style={{ ...styles.infoText, marginTop: "5px" }}>보유 주식 없음</p>
              )}
            </div>
            <div className="mt-auto"></div>
          </div>
        </div>
      </div>

      {/* 투자 자산 */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>투자 자산</h4>
        <div className="grid grid-cols-1 gap-2.5">
          <div style={styles.assetItemBox("#f0fdf4", "#dcfce7")}>
            <div>
              <div style={styles.assetItemTitle("#166534")}>🏠 부동산 가치</div>
              <div style={styles.assetItemAmount("#15803d")}>{formatKoreanCurrency(totalRealEstateValue)}</div>
              {realEstateAssets.length > 0 ? (
                <ul style={styles.detailList}>
                  {realEstateAssets.map((asset) => (
                    <li key={asset.id} style={styles.detailListItem}>
                      - #{asset.id}: {formatKoreanCurrency(asset.price || 0)}
                      {asset.forSale && <span style={{ color: "#ca8a04", fontWeight: "500" }}>(판매중)</span>}
                      {asset.tenant && <span style={{ color: "#059669" }}>(세입자: {asset.tenant})</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={styles.infoText}>보유 부동산 없음</p>
              )}
            </div>
            <div className="mt-auto"></div>
          </div>
        </div>
      </div>

      {/* 부채 */}
      <div style={styles.sectionContainer}>
        <h4 style={styles.sectionTitle}>부채 (대출)</h4>
        <div className="grid grid-cols-1 gap-2.5">
          <div style={styles.assetItemBox("#fff1f2", "#ffe4e6")}>
            <div>
              <div style={styles.assetItemTitle("#9f1239")}>💸 총 대출 잔액</div>
              <div style={styles.assetItemAmount("#be123c")}>{formatKoreanCurrency(totalLoanBalance)}</div>
              {loans.length > 0 ? (
                <ul style={styles.detailList}>
                  {loans.map((loan) => (
                    <li key={loan.id} style={styles.detailListItem}>
                      - {loan.name}: {formatKoreanCurrency(loan.remainingPrincipal || 0)} ({loan.rate}%)
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={styles.infoText}>대출 없음</p>
              )}
            </div>
            <div className="mt-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
