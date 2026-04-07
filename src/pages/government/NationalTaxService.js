// src/NationalTaxService.js
// ========================================
// 국세청 - 관리자(선생님) 현금 = 국고
// ========================================
// 국고는 별도의 문서가 아닌 학급 관리자(선생님)의 현금으로 통합됨
// 모든 세금은 관리자 계정으로 직접 입금됨
// ========================================
import React, { useState, useEffect, useCallback } from "react";
import { db, getCachedDocument, invalidateCache } from "../../firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { usePolling } from "../../hooks/usePolling";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { logger } from '../../utils/logger';

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "유효하지 않은 날짜";
  return date.toLocaleString("ko-KR");
};

// 세수 통계용 (국고 잔액은 관리자 현금에서 가져옴)
const DEFAULT_TREASURY_DATA = {
  totalAmount: 0, // 이 값은 사용하지 않음 - 관리자 현금으로 대체
  stockTaxRevenue: 0,
  stockCommissionRevenue: 0,
  realEstateTransactionTaxRevenue: 0,
  vatRevenue: 0,
  auctionTaxRevenue: 0,
  propertyHoldingTaxRevenue: 0,
  itemMarketTaxRevenue: 0,
  incomeTaxRevenue: 0,
  corporateTaxRevenue: 0,
  otherTaxRevenue: 0,
  lastUpdated: null,
};

const DEFAULT_TAX_SETTINGS = {
  stockTransactionTaxRate: 0.01,
  realEstateTransactionTaxRate: 0.03,
  itemStoreVATRate: 0.1,
  auctionTransactionTaxRate: 0.03,
  propertyHoldingTaxRate: 0.002,
  propertyHoldingTaxInterval: "weekly",
  itemMarketTransactionTaxRate: 0.03,
  lastUpdated: null,
};

const NationalTaxService = ({ classCode }) => {
  const [treasuryData, setTreasuryData] = useState(DEFAULT_TREASURY_DATA);
  const [taxSettings, setTaxSettings] = useState(DEFAULT_TAX_SETTINGS);
  const [adminCash, setAdminCash] = useState(0); // 관리자(선생님) 현금 = 국고
  const [loadingTreasury, setLoadingTreasury] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editableSettings, setEditableSettings] = useState(DEFAULT_TAX_SETTINGS);
  const [collectingTax, setCollectingTax] = useState(false);

  // 관리자(선생님) 현금 가져오기 - 이것이 곧 국고
  const fetchAdminCash = useCallback(async () => {
    if (!classCode) {
      setAdminCash(0);
      return;
    }
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("classCode", "==", classCode),
        where("isAdmin", "==", true)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const adminData = snapshot.docs[0].data();
        setAdminCash(adminData.cash || 0);
      } else {
        setAdminCash(0);
      }
    } catch (error) {
      logger.error(`[${classCode}] 관리자 현금(국고) 로드 실패:`, error);
      setAdminCash(0);
    }
  }, [classCode]);

  // 세수 통계 데이터 가져오기 (참고용 - 국고 잔액은 관리자 현금 사용)
  const fetchTreasuryData = useCallback(async () => {
    if (!classCode) {
      setLoadingTreasury(false);
      setTreasuryData(DEFAULT_TREASURY_DATA);
      return;
    }
    setLoadingTreasury(true);

    // 관리자 현금 먼저 가져오기
    await fetchAdminCash();

    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    try {
      const cached = await getCachedDocument("nationalTreasuries", classCode, 5 * 60 * 1000);
      if (cached) {
        setTreasuryData({ ...DEFAULT_TREASURY_DATA, ...cached });
        setLoadingTreasury(false);
        return;
      }

      const docSnap = await getDoc(treasuryRef);
      if (docSnap.exists()) {
        setTreasuryData({ ...DEFAULT_TREASURY_DATA, ...docSnap.data() });
        invalidateCache(`doc_nationalTreasuries_${classCode}`);
      } else {
        // 세수 통계 문서가 없으면 생성 (국고 잔액은 관리자 현금이므로 totalAmount는 0으로)
        await setDoc(treasuryRef, {
          ...DEFAULT_TREASURY_DATA,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        invalidateCache(`doc_nationalTreasuries_${classCode}`);
        setTreasuryData({
          ...DEFAULT_TREASURY_DATA,
          lastUpdated: new Date(),
        });
      }
      setLoadingTreasury(false);
    } catch (error) {
      logger.error(`[${classCode}] 세수 통계 데이터 로드 실패:`, error);
      setLoadingTreasury(false);
    }
  }, [classCode, fetchAdminCash]);

  // 🔥 [비용 최적화] 5분 → 15분 (국고 데이터는 자주 안 바뀜)
  const { refetch: refetchTreasury } = usePolling(fetchTreasuryData, { interval: 15 * 60 * 1000, enabled: !!classCode });

  const fetchTaxSettings = useCallback(async () => {
    if (!classCode) {
      setLoadingSettings(false);
      setTaxSettings(DEFAULT_TAX_SETTINGS);
      setEditableSettings(DEFAULT_TAX_SETTINGS);
      return;
    }
    setLoadingSettings(true);
    const settingsRef = doc(db, "governmentSettings", classCode);
    try {
      const cached = await getCachedDocument("governmentSettings", classCode, 5 * 60 * 1000);
      if (cached?.taxSettings) {
        const newSettings = { ...DEFAULT_TAX_SETTINGS, ...cached.taxSettings };
        setTaxSettings(newSettings);
        setEditableSettings(newSettings);
        setLoadingSettings(false);
        return;
      }

      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists() && docSnap.data().taxSettings) {
        const newSettings = { ...DEFAULT_TAX_SETTINGS, ...docSnap.data().taxSettings };
        setTaxSettings(newSettings);
        setEditableSettings(newSettings);
        invalidateCache(`doc_governmentSettings_${classCode}`);
      } else {
        await setDoc(settingsRef, {
          taxSettings: {
            ...DEFAULT_TAX_SETTINGS,
            lastUpdated: serverTimestamp(),
          },
        }, { merge: true });
        invalidateCache(`doc_governmentSettings_${classCode}`);
        setTaxSettings(DEFAULT_TAX_SETTINGS);
        setEditableSettings(DEFAULT_TAX_SETTINGS);
      }
      setLoadingSettings(false);
    } catch (error) {
      logger.error(`[${classCode}] 세금 정책 로드 실패:`, error);
      setLoadingSettings(false);
    }
  }, [classCode]);

  // 🔥 [비용 최적화] 5분 → 1시간 (세금 설정은 거의 안 바뀜)
  const { refetch: refetchSettings } = usePolling(fetchTaxSettings, { interval: 60 * 60 * 1000, enabled: !!classCode });

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    const numericValue = value === "" ? "" : parseFloat(value);
    setEditableSettings((prev) => ({
      ...prev,
      [name]: numericValue,
    }));
  };

  const handleIntervalChange = (e) => {
    const { name, value } = e.target;
    setEditableSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveTaxSettings = async () => {
    if (!classCode) return;
    for (const key in editableSettings) {
      if (
        key.endsWith("Rate") &&
        (editableSettings[key] < 0 || editableSettings[key] > 1)
      ) {
        if (
          editableSettings[key] !== "" &&
          !(key === "itemStoreVATRate" && editableSettings[key] > 1)
        ) {
          alert(
            `${key} 세율은 0과 1 사이의 값이어야 합니다 (예: 3%는 0.03). 현재값: ${editableSettings[key]}`
          );
          return;
        }
      }
    }

    const settingsRef = doc(db, "governmentSettings", classCode);
    try {
      await updateDoc(settingsRef, {
        taxSettings: {
          ...editableSettings,
          lastUpdated: serverTimestamp(),
        },
      });
      refetchSettings();
      alert("세금 정책이 성공적으로 업데이트되었습니다.");
    } catch (error) {
      logger.error("세금 정책 업데이트 실패:", error);
      alert("세금 정책 업데이트 중 오류가 발생했습니다.");
    }
  };

  const handleCollectPropertyTax = async () => {
    if (!classCode) return;
    if (!window.confirm("부동산 보유세를 징수하시겠습니까? 모든 부동산 소유자에게서 보유세가 차감됩니다.")) return;

    setCollectingTax(true);
    try {
      const { collectPropertyHoldingTaxes } = await import("../../firebase/db/transactions");
      const result = await collectPropertyHoldingTaxes(classCode);
      if (result.success) {
        alert(`보유세 징수 완료!\n징수 대상: ${result.userCount}명\n총 징수액: ${(result.totalCollected || 0).toLocaleString()}원`);
        // 국고 통계만 기록 (totalAmount 제외 - 국고=관리자cash)
        const treasuryRef = doc(db, "nationalTreasuries", classCode);
        await setDoc(treasuryRef, {
          propertyHoldingTaxRevenue: increment(result.totalCollected || 0),
          lastUpdated: serverTimestamp(),
        }, { merge: true });
        refetchTreasury();
      } else {
        alert("보유세 징수에 실패했습니다.");
      }
    } catch (error) {
      logger.error("보유세 징수 실패:", error);
      alert("보유세 징수 중 오류가 발생했습니다: " + error.message);
    } finally {
      setCollectingTax(false);
    }
  };

  if (!classCode) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">학급 코드가 필요합니다</h2>
        <p className="text-slate-500">
          정부 메뉴에서 국세청 기능을 사용하려면 학급에 먼저 참여해야 합니다.
        </p>
      </div>
    );
  }

  if (loadingTreasury || loadingSettings) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">국세청 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const totalTaxRevenue = Object.keys(treasuryData)
    .filter((key) => key.endsWith("Revenue") && key !== "totalAmount")
    .reduce((sum, key) => sum + (treasuryData[key] || 0), 0);

  const taxPolicyFields = [
    { name: "stockTransactionTaxRate", label: "주식 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "realEstateTransactionTaxRate", label: "부동산 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "itemStoreVATRate", label: "아이템 상점 부가세율", type: "number", step: "0.01", min: "0", max: "1" },
    { name: "auctionTransactionTaxRate", label: "경매장 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "propertyHoldingTaxRate", label: "부동산 보유세율", type: "number", step: "0.0001", min: "0", max: "1" },
    { name: "propertyHoldingTaxInterval", label: "부동산 보유세 징수 주기", type: "select", options: ["daily", "weekly", "monthly"] },
    { name: "itemMarketTransactionTaxRate", label: "아이템 시장 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
  ];

  const tabs = [
    { id: "overview", label: "개요", icon: "📊" },
    { id: "revenue", label: "세수 현황", icon: "💰" },
    { id: "policy", label: "세금 정책", icon: "📋" },
    { id: "analytics", label: "분석", icon: "📈" },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="relative overflow-hidden rounded-2xl p-8 text-slate-800 shadow-xl" style={{ background: 'linear-gradient(135deg, rgba(240, 245, 255, 0.95), rgba(230, 240, 255, 0.9))', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
        <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(0, 136, 255, 0.4), transparent 60%)' }} />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 12px rgba(99, 102, 241, 0.3)' }}>
            {classCode} 학급 국세청
          </h1>
          <p className="text-sm" style={{ color: 'rgba(71, 85, 105, 0.9)' }}>세금 정책 관리 및 국고 운영</p>
        </div>
      </div>

      {/* 탭 네비게이션 - 세련된 네온 스타일 */}
      <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(240, 245, 255, 0.6)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-300"
            style={activeTab === tab.id
              ? {
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(59, 130, 246, 0.1))',
                  color: 'rgb(30, 41, 59)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  boxShadow: '0 0 15px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                  textShadow: '0 0 8px rgba(99, 102, 241, 0.2)',
                  fontFamily: 'Rajdhani, sans-serif',
                  letterSpacing: '0.5px',
                }
              : {
                  background: 'transparent',
                  color: 'rgba(71, 85, 105, 0.7)',
                  border: '1px solid transparent',
                  fontFamily: 'Rajdhani, sans-serif',
                  letterSpacing: '0.5px',
                }
            }
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 개요 탭 */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { icon: "💰", label: "총 국고", value: adminCash, sub: "= 학급 관리자 현금", accent: "var(--accent)", bg: "rgba(99, 102, 241, 0.08)", border: "rgba(99, 102, 241, 0.25)" },
              { icon: "📈", label: "주식 거래세 수입", value: treasuryData.stockTaxRevenue, accent: "#60a5fa", bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.25)" },
              { icon: "📊", label: "주식 수수료 수입", value: treasuryData.stockCommissionRevenue, accent: "#818cf8", bg: "rgba(129, 140, 248, 0.08)", border: "rgba(129, 140, 248, 0.25)" },
              { icon: "🏠", label: "부동산 거래세", value: treasuryData.realEstateTransactionTaxRevenue, accent: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)", border: "rgba(251, 191, 36, 0.25)" },
              { icon: "🛒", label: "부가세 수입", value: treasuryData.vatRevenue, accent: "#f472b6", bg: "rgba(244, 114, 182, 0.08)", border: "rgba(244, 114, 182, 0.25)" },
              { icon: "🔨", label: "경매장 거래세", value: treasuryData.auctionTaxRevenue, accent: "#22d3ee", bg: "rgba(34, 211, 238, 0.08)", border: "rgba(34, 211, 238, 0.25)" },
              { icon: "🏘️", label: "부동산 보유세", value: treasuryData.propertyHoldingTaxRevenue, accent: "#a3e635", bg: "rgba(163, 230, 53, 0.08)", border: "rgba(163, 230, 53, 0.25)" },
              { icon: "🏪", label: "아이템 시장세", value: treasuryData.itemMarketTaxRevenue, accent: "#fb923c", bg: "rgba(251, 146, 60, 0.08)", border: "rgba(251, 146, 60, 0.25)" },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl p-5 transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(135deg, ${card.bg}, rgba(255, 255, 255, 0.9))`,
                  border: `1px solid ${card.border}`,
                  boxShadow: `0 0 12px ${card.bg}`,
                }}
              >
                <p className="text-xs font-semibold mb-2 tracking-wide" style={{ color: card.accent, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
                  {card.icon} {card.label}
                </p>
                <p className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: `0 0 8px ${card.bg}` }}>
                  {formatKoreanCurrency(card.value)}
                </p>
                {card.sub && <p className="text-xs mt-1" style={{ color: 'rgba(71, 85, 105, 0.6)' }}>{card.sub}</p>}
              </div>
            ))}
          </div>

          {/* 부동산 보유세 징수 버튼 */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(240, 253, 244, 0.8)', border: '1px solid rgba(163, 230, 53, 0.2)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: '#a3e635', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
                  🏘️ 부동산 보유세 징수
                </h3>
                <p className="text-xs" style={{ color: 'rgba(71, 85, 105, 0.7)' }}>
                  모든 부동산 소유자에게서 보유세({((taxSettings.propertyHoldingTaxRate || 0.002) * 100).toFixed(1)}%)를 징수합니다.
                </p>
              </div>
              <button
                onClick={handleCollectPropertyTax}
                disabled={collectingTax}
                className="px-5 py-2.5 rounded-lg font-bold text-sm text-slate-800 transition-all duration-300"
                style={{
                  background: collectingTax ? 'rgba(75, 85, 99, 0.3)' : 'linear-gradient(135deg, rgba(163, 230, 53, 0.3), rgba(163, 230, 53, 0.1))',
                  border: `1px solid ${collectingTax ? 'rgba(75, 85, 99, 0.5)' : 'rgba(163, 230, 53, 0.4)'}`,
                  color: collectingTax ? '#64748b' : '#a3e635',
                  cursor: collectingTax ? 'not-allowed' : 'pointer',
                  fontFamily: 'Rajdhani, sans-serif',
                  letterSpacing: '1px',
                }}
              >
                {collectingTax ? "징수 중..." : "보유세 징수"}
              </button>
            </div>
          </div>

          {/* 최근 업데이트 */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(240, 249, 255, 0.8)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: '#6366f1', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
              📅 최근 업데이트
            </h3>
            <div className="space-y-1.5 text-sm" style={{ color: 'rgba(71, 85, 105, 0.8)' }}>
              <p>국고 마지막 업데이트: <span className="font-medium text-slate-800">{formatDate(treasuryData.lastUpdated)}</span></p>
              <p>세금 정책 마지막 업데이트: <span className="font-medium text-slate-800">{formatDate(taxSettings.lastUpdated)}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* 세수 현황 탭 */}
      {activeTab === "revenue" && (
        <div className="rounded-xl p-6" style={{ background: 'rgba(240, 249, 255, 0.8)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold" style={{ color: '#6366f1', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
              💰 세수 현황 분석
            </h3>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'rgba(71, 85, 105, 0.6)' }}>세수 총합</p>
              <p className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{formatKoreanCurrency(totalTaxRevenue)}</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: "주식 거래세", amount: treasuryData.stockTaxRevenue, color: "#60a5fa" },
              { label: "주식 수수료", amount: treasuryData.stockCommissionRevenue, color: "#818cf8" },
              { label: "부동산 거래세", amount: treasuryData.realEstateTransactionTaxRevenue, color: "#fbbf24" },
              { label: "부가세", amount: treasuryData.vatRevenue, color: "#f472b6" },
              { label: "경매장 거래세", amount: treasuryData.auctionTaxRevenue, color: "#22d3ee" },
              { label: "부동산 보유세", amount: treasuryData.propertyHoldingTaxRevenue, color: "#a3e635" },
              { label: "아이템 시장세", amount: treasuryData.itemMarketTaxRevenue, color: "#fb923c" },
            ].map((item) => {
              const percentage = totalTaxRevenue > 0 ? ((item.amount / totalTaxRevenue) * 100).toFixed(1) : "0.0";
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-semibold" style={{ color: item.color, fontFamily: 'Rajdhani, sans-serif' }}>{item.label}</div>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'rgba(240, 249, 255, 0.8)', border: '1px solid rgba(203, 213, 225, 0.4)' }}>
                    <div
                      className="h-full rounded-md transition-all duration-700"
                      style={{
                        width: `${Math.max(parseFloat(percentage), 0.5)}%`,
                        background: `linear-gradient(90deg, ${item.color}40, ${item.color}90)`,
                        boxShadow: `0 0 8px ${item.color}30`,
                      }}
                    />
                  </div>
                  <div className="w-36 text-right text-xs">
                    <span className="font-bold text-slate-800">{formatKoreanCurrency(item.amount)}</span>
                    <span className="ml-1.5" style={{ color: 'rgba(71, 85, 105, 0.5)' }}>({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 세금 정책 탭 */}
      {activeTab === "policy" && (
        <div className="space-y-5">
          <div className="rounded-xl p-6" style={{ background: 'rgba(240, 249, 255, 0.8)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <h3 className="text-lg font-bold mb-5" style={{ color: '#6366f1', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
              📋 현행 세금 정책 ({classCode})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {taxPolicyFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-bold mb-2" style={{ color: 'rgba(71, 85, 105, 0.9)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.5px' }}>
                    {field.label}
                    <span className="ml-2" style={{ color: '#6366f1', fontWeight: 400 }}>
                      (현재: {field.type === "select"
                        ? taxSettings[field.name]
                        : `${((taxSettings[field.name] || 0) * 100).toFixed(field.name.includes("propertyHoldingTaxRate") ? 2 : 1)}%`})
                    </span>
                  </label>
                  {field.type === "select" ? (
                    <select
                      name={field.name}
                      value={editableSettings[field.name] || DEFAULT_TAX_SETTINGS[field.name]}
                      onChange={handleIntervalChange}
                      className="w-full px-4 py-2.5 rounded-lg text-slate-800 text-sm transition-all duration-200"
                      style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(203, 213, 225, 0.5)', outline: 'none' }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(100, 116, 139, 0.3)'}
                    >
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "daily" ? "매일" : opt === "weekly" ? "매주" : "매월"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      name={field.name}
                      value={editableSettings[field.name] === "" ? "" : editableSettings[field.name]}
                      onChange={handleSettingChange}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      placeholder={`예: ${field.label.includes("부가") ? "0.1 (10%)" : "0.03 (3%)"}`}
                      className="w-full px-4 py-2.5 rounded-lg text-slate-800 text-sm transition-all duration-200"
                      style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(203, 213, 225, 0.5)', outline: 'none' }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(100, 116, 139, 0.3)'}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={saveTaxSettings}
              className="mt-5 px-7 py-2.5 rounded-lg font-bold text-sm text-slate-800 transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 136, 255, 0.3), rgba(0, 255, 242, 0.2))',
                border: '1px solid rgba(0, 255, 242, 0.35)',
                fontFamily: 'Rajdhani, sans-serif',
                letterSpacing: '1px',
                boxShadow: '0 0 12px rgba(0, 136, 255, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(0, 136, 255, 0.5), rgba(0, 255, 242, 0.35))';
                e.target.style.boxShadow = '0 0 20px rgba(0, 255, 242, 0.25)';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(0, 136, 255, 0.3), rgba(0, 255, 242, 0.2))';
                e.target.style.boxShadow = '0 0 12px rgba(0, 136, 255, 0.15)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              세금 정책 저장
            </button>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'rgba(240, 249, 255, 0.6)', border: '1px solid rgba(96, 165, 250, 0.15)' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#60a5fa', fontFamily: 'Rajdhani, sans-serif' }}>💡 세금 정책 목표</h3>
            <ul className="space-y-1 text-xs" style={{ color: 'rgba(71, 85, 105, 0.7)' }}>
              <li>• 공정한 시장 경제 질서 확립</li>
              <li>• 안정적인 학급 재정 및 공공 서비스 투자</li>
              <li>• 경제 활동 참여와 세금의 형평성 제고</li>
            </ul>
          </div>
        </div>
      )}

      {/* 분석 탭 */}
      {activeTab === "analytics" && (
        <div className="rounded-xl p-6" style={{ background: 'rgba(240, 249, 255, 0.8)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <h3 className="text-lg font-bold mb-5" style={{ color: '#6366f1', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
            📈 세수 분석 ({classCode})
          </h3>

          {/* 세수 비율 시각화 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: "주식 관련", amount: (treasuryData.stockTaxRevenue || 0) + (treasuryData.stockCommissionRevenue || 0), color: "#60a5fa" },
              { label: "부동산 관련", amount: (treasuryData.realEstateTransactionTaxRevenue || 0) + (treasuryData.propertyHoldingTaxRevenue || 0), color: "#fbbf24" },
              { label: "아이템/상점", amount: (treasuryData.vatRevenue || 0) + (treasuryData.itemMarketTaxRevenue || 0), color: "#f472b6" },
              { label: "경매/기타", amount: (treasuryData.auctionTaxRevenue || 0) + (treasuryData.otherTaxRevenue || 0), color: "#22d3ee" },
            ].map((cat) => {
              const pct = totalTaxRevenue > 0 ? ((cat.amount / totalTaxRevenue) * 100).toFixed(1) : "0.0";
              return (
                <div key={cat.label} className="rounded-lg p-4 text-center" style={{ background: `${cat.color}08`, border: `1px solid ${cat.color}25` }}>
                  <p className="text-2xl font-bold" style={{ color: cat.color, fontFamily: 'Rajdhani, sans-serif' }}>{pct}%</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(71, 85, 105, 0.7)' }}>{cat.label}</p>
                  <p className="text-xs font-semibold mt-0.5 text-slate-800">{formatKoreanCurrency(cat.amount)}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg p-6 text-center" style={{ background: 'rgba(240, 249, 255, 0.6)', border: '1px solid rgba(203, 213, 225, 0.3)' }}>
            <p className="text-xs" style={{ color: 'rgba(71, 85, 105, 0.5)' }}>
              추후 시간별 세수 변화 추이, 카테고리별 상세 분석이 추가될 예정입니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalTaxService;
