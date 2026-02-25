// src/pages/admin/AdminEconomicEvents.js
// 경제 이벤트 관리 페이지 - 선생님/관리자 전용
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { logger } from "../../utils/logger";
import {
  Zap,
  Play,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

// 이벤트 타입 정의
const EVENT_TYPES = [
  { value: "REAL_ESTATE_PRICE_CHANGE", label: "부동산 가격 변동", emoji: "🏠" },
  { value: "TAX_REFUND", label: "세금 환급", emoji: "💰" },
  { value: "TAX_EXTRA", label: "추가 세금 부과", emoji: "💸" },
  { value: "CASH_BONUS", label: "현금 지원금 지급", emoji: "🎁" },
  { value: "CASH_PENALTY", label: "현금 긴급 차감", emoji: "📉" },
  { value: "STORE_PRICE_CHANGE", label: "상점 물가 변동", emoji: "🛒" },
  { value: "STOCK_TAX_CHANGE", label: "주식 세금 변경(24h)", emoji: "📊" },
  {
    value: "MARKET_FEE_CHANGE",
    label: "개인상점 거래세 변경(24h)",
    emoji: "🏪",
  },
];

// 기본 이벤트 템플릿
const DEFAULT_EVENTS = [
  {
    id: "real_estate_up_20",
    type: "REAL_ESTATE_PRICE_CHANGE",
    title: "부동산 호황!",
    description: "경기 회복으로 부동산 전체 가격이 20% 상승했습니다!",
    params: { changePercent: 20 },
    emoji: "🏠📈",
    enabled: true,
  },
  {
    id: "real_estate_down_15",
    type: "REAL_ESTATE_PRICE_CHANGE",
    title: "부동산 불황!",
    description: "경기 침체로 부동산 전체 가격이 15% 하락했습니다!",
    params: { changePercent: -15 },
    emoji: "🏠📉",
    enabled: true,
  },
  {
    id: "tax_refund",
    type: "TAX_REFUND",
    title: "세금 환급의 날!",
    description: "정부가 국고 재원으로 모든 시민에게 세금을 환급합니다!",
    params: { refundRate: 0.3 },
    emoji: "💰✨",
    enabled: true,
  },
  {
    id: "tax_extra",
    type: "TAX_EXTRA",
    title: "긴급 세금 추징!",
    description: "정부가 국가 재정을 위해 추가 세금을 부과합니다! (현금의 3%)",
    params: { taxRate: 0.03 },
    emoji: "💸😱",
    enabled: true,
  },
  {
    id: "cash_bonus",
    type: "CASH_BONUS",
    title: "정부 지원금 지급!",
    description: "정부가 경제 활성화를 위해 모든 시민에게 지원금을 지급합니다!",
    params: { amount: 50000 },
    emoji: "🎁💵",
    enabled: true,
  },
  {
    id: "cash_penalty",
    type: "CASH_PENALTY",
    title: "경제 위기 긴급 부담금!",
    description: "경제 위기로 인해 모든 시민의 현금이 5% 삭감됩니다!",
    params: { penaltyRate: 0.05 },
    emoji: "📉💔",
    enabled: true,
  },
  {
    id: "store_price_up",
    type: "STORE_PRICE_CHANGE",
    title: "물가 폭등!",
    description:
      "인플레이션으로 관리자 상점의 모든 상품 가격이 2배로 올랐습니다!",
    params: { multiplier: 2 },
    emoji: "🛒📈",
    enabled: true,
  },
  {
    id: "store_price_down",
    type: "STORE_PRICE_CHANGE",
    title: "물가 대폭 안정!",
    description:
      "정부 물가 안정 정책으로 관리자 상점의 모든 상품 가격이 절반으로 내렸습니다!",
    params: { multiplier: 0.5 },
    emoji: "🛒📉",
    enabled: true,
  },
  {
    id: "stock_tax_exempt",
    type: "STOCK_TAX_CHANGE",
    title: "주식 거래세 24시간 면제!",
    description: "오늘 하루 주식 거래세·양도세가 모두 면제됩니다! 지금이 기회!",
    params: { multiplier: 0 },
    emoji: "📊🎉",
    enabled: true,
  },
  {
    id: "stock_tax_double",
    type: "STOCK_TAX_CHANGE",
    title: "주식 거래세 2배 부과!",
    description: "24시간 동안 주식 거래세·양도세가 2배로 인상됩니다!",
    params: { multiplier: 2 },
    emoji: "📊💸",
    enabled: true,
  },
  {
    id: "market_fee_exempt",
    type: "MARKET_FEE_CHANGE",
    title: "개인상점 거래세 면제!",
    description:
      "오늘 하루 개인상점 거래 수수료가 0%입니다! 활발하게 거래하세요!",
    params: { multiplier: 0 },
    emoji: "🏪✨",
    enabled: true,
  },
  {
    id: "market_fee_double",
    type: "MARKET_FEE_CHANGE",
    title: "개인상점 사치세 부과!",
    description: "24시간 동안 개인상점 거래 수수료가 2배로 인상됩니다!",
    params: { multiplier: 2 },
    emoji: "🏪💸",
    enabled: true,
  },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label:
    i === 0
      ? "자정(0시)"
      : i < 12
        ? `오전 ${i}시`
        : i === 12
          ? "정오(12시)"
          : `오후 ${i - 12}시`,
}));

// 이벤트 파라미터 기본값
const getDefaultParams = (type) => {
  switch (type) {
    case "REAL_ESTATE_PRICE_CHANGE":
      return { changePercent: 20 };
    case "TAX_REFUND":
      return { refundRate: 0.3 };
    case "TAX_EXTRA":
      return { taxRate: 0.03 };
    case "CASH_BONUS":
      return { amount: 50000 };
    case "CASH_PENALTY":
      return { penaltyRate: 0.05 };
    case "STORE_PRICE_CHANGE":
      return { multiplier: 2 };
    case "STOCK_TAX_CHANGE":
      return { multiplier: 0 };
    case "MARKET_FEE_CHANGE":
      return { multiplier: 0 };
    default:
      return {};
  }
};

export default function AdminEconomicEvents() {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  // 설정 상태
  const [settings, setSettings] = useState({
    enabled: true,
    triggerHour: 13,
    events: DEFAULT_EVENTS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }

  // 이벤트 히스토리
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 새 이벤트 추가 폼
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    type: "CASH_BONUS",
    title: "",
    description: "",
    emoji: "⚡",
    params: { amount: 50000 },
  });

  const functions = getFunctions(undefined, "asia-northeast3");

  // 설정 로드
  const loadSettings = useCallback(async () => {
    if (!classCode) return;
    setLoading(true);
    try {
      const ref = doc(db, "economicEventSettings", classCode);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setSettings({
          enabled: data.enabled || false,
          triggerHour: data.triggerHour ?? 13,
          events:
            data.events && data.events.length > 0
              ? data.events
              : DEFAULT_EVENTS,
        });
      } else {
        // 첫 방문: 기본값 ON으로 설정하고 자동 저장
        const defaultSettings = {
          enabled: true,
          triggerHour: 13,
          events: DEFAULT_EVENTS,
        };
        setSettings(defaultSettings);
        // 서버에 기본 설정 자동 저장
        try {
          const saveSettings = httpsCallable(
            functions,
            "saveEconomicEventSettings",
          );
          await saveSettings(defaultSettings);
          logger.info("[AdminEconomicEvents] 기본 설정 자동 저장 완료");
        } catch (saveErr) {
          logger.warn(
            "[AdminEconomicEvents] 기본 설정 자동 저장 실패:",
            saveErr,
          );
        }
      }
    } catch (err) {
      logger.error("[AdminEconomicEvents] 설정 로드 오류:", err);
      setMessage({ type: "error", text: "설정을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, [classCode]);

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    if (!classCode) return;
    setHistoryLoading(true);
    try {
      const ref = collection(db, "economicEventLogs", classCode, "entries");
      const q = query(ref, orderBy("triggeredAt", "desc"), limit(20));
      const snap = await getDocs(q);
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      logger.error("[AdminEconomicEvents] 히스토리 로드 오류:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [classCode]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  // 설정 저장
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saveSettings = httpsCallable(
        functions,
        "saveEconomicEventSettings",
      );
      await saveSettings({
        enabled: settings.enabled,
        triggerHour: settings.triggerHour,
        events: settings.events,
      });
      setMessage({ type: "success", text: "설정이 저장되었습니다!" });
    } catch (err) {
      logger.error("[AdminEconomicEvents] 설정 저장 오류:", err);
      setMessage({ type: "error", text: `저장 실패: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  // 즉시 이벤트 실행
  const handleTriggerNow = async (eventId = null) => {
    if (
      !window.confirm(
        "지금 바로 경제 이벤트를 실행하시겠습니까?\n오늘의 이벤트가 이미 발생했어도 강제로 실행됩니다.",
      )
    )
      return;
    setTriggering(true);
    setMessage(null);
    try {
      const trigger = httpsCallable(functions, "triggerEconomicEventManual");
      const result = await trigger({ forceEventId: eventId });
      const data = result.data;
      const title = data.event?.title || "이벤트";
      setMessage({
        type: "success",
        text: `"${title}" 이벤트가 실행되었습니다!`,
      });
      if (showHistory) loadHistory();
    } catch (err) {
      logger.error("[AdminEconomicEvents] 이벤트 실행 오류:", err);
      setMessage({ type: "error", text: `실행 실패: ${err.message}` });
    } finally {
      setTriggering(false);
    }
  };

  // 이벤트 활성화/비활성화 토글
  const toggleEvent = (eventId) => {
    setSettings((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === eventId ? { ...e, enabled: !e.enabled } : e,
      ),
    }));
  };

  // 이벤트 삭제
  const deleteEvent = (eventId) => {
    if (!window.confirm("이 이벤트를 삭제하시겠습니까?")) return;
    setSettings((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== eventId),
    }));
  };

  // 새 이벤트 타입 변경 시 파라미터 자동 설정
  const handleNewEventTypeChange = (type) => {
    setNewEvent((prev) => ({
      ...prev,
      type,
      params: getDefaultParams(type),
    }));
  };

  // 새 이벤트 추가
  const handleAddEvent = () => {
    if (!newEvent.title.trim()) {
      setMessage({ type: "error", text: "이벤트 제목을 입력해주세요." });
      return;
    }
    const id = `custom_${Date.now()}`;
    const event = {
      id,
      type: newEvent.type,
      title: newEvent.title.trim(),
      description: newEvent.description.trim(),
      emoji: newEvent.emoji || "⚡",
      params: newEvent.params,
      enabled: true,
    };
    setSettings((prev) => ({
      ...prev,
      events: [...prev.events, event],
    }));
    setNewEvent({
      type: "CASH_BONUS",
      title: "",
      description: "",
      emoji: "⚡",
      params: { amount: 50000 },
    });
    setShowAddForm(false);
    setMessage({
      type: "success",
      text: "이벤트가 추가되었습니다. 저장 버튼을 눌러 적용하세요.",
    });
  };

  // 파라미터 업데이트
  const updateEventParam = (eventId, paramKey, value) => {
    setSettings((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === eventId
          ? {
              ...e,
              params: { ...e.params, [paramKey]: parseFloat(value) || 0 },
            }
          : e,
      ),
    }));
  };

  const formatTriggeredAt = (ts) => {
    if (!ts) return "";
    const d = ts.toDate?.() || new Date(ts);
    return d.toLocaleString("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getResultText = (entry) => {
    const type = entry.event?.type;
    const result = entry.result || {};
    if (type === "REAL_ESTATE_PRICE_CHANGE") {
      const pct = entry.event?.params?.changePercent || 0;
      return `${result.affectedCount || 0}개 부동산 ${pct > 0 ? "+" : ""}${pct}% 변동`;
    }
    if (type === "TAX_REFUND")
      return `${result.refundedAmount?.toLocaleString() || 0}원 환급`;
    if (type === "TAX_EXTRA")
      return `${result.collectedAmount?.toLocaleString() || 0}원 징수`;
    if (type === "CASH_BONUS")
      return `${result.affectedCount || 0}명에게 ${result.perStudent?.toLocaleString() || 0}원`;
    if (type === "CASH_PENALTY")
      return `${result.affectedCount || 0}명 ${result.collectedAmount?.toLocaleString() || 0}원 차감`;
    if (type === "STORE_PRICE_CHANGE")
      return `상점 ${result.affectedCount || 0}개 아이템 ${result.multiplier}배 변경`;
    if (type === "STOCK_TAX_CHANGE") {
      const m = entry.event?.params?.multiplier;
      return m === 0 ? "주식세금 24h 면제" : `주식세금 ${m}배 24h 적용`;
    }
    if (type === "MARKET_FEE_CHANGE") {
      const m = entry.event?.params?.multiplier;
      return m === 0
        ? "개인상점 수수료 24h 면제"
        : `개인상점 수수료 ${m}배 24h 적용`;
    }
    return "";
  };

  const getParamInputs = (event) => {
    switch (event.type) {
      case "REAL_ESTATE_PRICE_CHANGE":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">변동률</span>
            <input
              type="number"
              value={event.params?.changePercent ?? 20}
              onChange={(e) =>
                updateEventParam(event.id, "changePercent", e.target.value)
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              step="5"
            />
            <span className="text-xs text-slate-400">% (음수 = 하락)</span>
          </div>
        );
      case "TAX_REFUND":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">국고 환급 비율</span>
            <input
              type="number"
              value={Math.round((event.params?.refundRate ?? 0.3) * 100)}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "refundRate",
                  (parseFloat(e.target.value) || 0) / 100,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="1"
              max="100"
              step="5"
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        );
      case "TAX_EXTRA":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">추징율</span>
            <input
              type="number"
              value={Math.round((event.params?.taxRate ?? 0.03) * 100)}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "taxRate",
                  (parseFloat(e.target.value) || 0) / 100,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="1"
              max="30"
              step="1"
            />
            <span className="text-xs text-slate-400">% (현금 기준)</span>
          </div>
        );
      case "CASH_BONUS":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">1인당 지급액</span>
            <input
              type="number"
              value={event.params?.amount ?? 50000}
              onChange={(e) =>
                updateEventParam(event.id, "amount", e.target.value)
              }
              className="w-28 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              step="10000"
              min="1000"
            />
            <span className="text-xs text-slate-400">원</span>
          </div>
        );
      case "CASH_PENALTY":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">차감율</span>
            <input
              type="number"
              value={Math.round((event.params?.penaltyRate ?? 0.05) * 100)}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "penaltyRate",
                  (parseFloat(e.target.value) || 0) / 100,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="1"
              max="50"
              step="1"
            />
            <span className="text-xs text-slate-400">% (현금 기준)</span>
          </div>
        );
      case "STORE_PRICE_CHANGE":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">가격 배율</span>
            <input
              type="number"
              value={event.params?.multiplier ?? 2}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "multiplier",
                  parseFloat(e.target.value) || 1,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="0.1"
              max="10"
              step="0.5"
            />
            <span className="text-xs text-slate-400">배 (0.5 = 절반)</span>
          </div>
        );
      case "STOCK_TAX_CHANGE":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">세금 배율</span>
            <input
              type="number"
              value={event.params?.multiplier ?? 0}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "multiplier",
                  parseFloat(e.target.value) ?? 0,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="0"
              max="5"
              step="1"
            />
            <span className="text-xs text-slate-400">
              배 (0 = 면제, 24시간)
            </span>
          </div>
        );
      case "MARKET_FEE_CHANGE":
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">수수료 배율</span>
            <input
              type="number"
              value={event.params?.multiplier ?? 0}
              onChange={(e) =>
                updateEventParam(
                  event.id,
                  "multiplier",
                  parseFloat(e.target.value) ?? 0,
                )
              }
              className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
              min="0"
              max="5"
              step="1"
            />
            <span className="text-xs text-slate-400">
              배 (0 = 면제, 24시간)
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">설정 불러오는 중...</div>
      </div>
    );
  }

  const enabledEventCount = settings.events.filter(
    (e) => e.enabled !== false,
  ).length;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">경제 이벤트 관리</h1>
          <p className="text-sm text-slate-400">
            평일 정해진 시간에 랜덤 경제 이벤트가 자동 발생합니다
          </p>
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-emerald-900/50 border border-emerald-500/30 text-emerald-300"
              : "bg-red-900/50 border border-red-500/30 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* 기본 설정 카드 */}
      <div className="bg-slate-100 border border-slate-300 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-bold text-white">기본 설정</h2>

        {/* 활성화 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">경제 이벤트 시스템</p>
            <p className="text-xs text-slate-400">
              평일 설정된 시간에 자동으로 이벤트가 발생합니다
            </p>
          </div>
          <button
            onClick={async () => {
              const newEnabled = !settings.enabled;
              setSettings((prev) => ({ ...prev, enabled: newEnabled }));
              // 즉시 서버에 저장
              try {
                const saveSettings = httpsCallable(
                  functions,
                  "saveEconomicEventSettings",
                );
                await saveSettings({
                  enabled: newEnabled,
                  triggerHour: settings.triggerHour,
                  events: settings.events,
                });
              } catch (err) {
                logger.error("[AdminEconomicEvents] 토글 저장 실패:", err);
              }
            }}
            className="flex items-center gap-2"
          >
            {settings.enabled ? (
              <ToggleRight className="w-8 h-8 text-emerald-400" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-slate-500" />
            )}
            <span
              className={`text-sm font-medium ${settings.enabled ? "text-emerald-400" : "text-slate-500"}`}
            >
              {settings.enabled ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        {/* 트리거 시간 */}
        <div className="flex items-center gap-4">
          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">이벤트 발생 시간</p>
            <p className="text-xs text-slate-400">
              평일 매일 이 시간에 이벤트가 랜덤으로 발생합니다 (KST)
            </p>
          </div>
          <select
            value={settings.triggerHour}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                triggerHour: parseInt(e.target.value),
              }))
            }
            className="bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            {HOUR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 즉시 실행 버튼 */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-300">
          <button
            onClick={() => handleTriggerNow()}
            disabled={
              triggering ||
              settings.events.filter((e) => e.enabled !== false).length === 0
            }
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {triggering ? "실행 중..." : "지금 바로 랜덤 실행"}
          </button>
          <p className="text-xs text-slate-400">
            활성 이벤트 {enabledEventCount}개 중 랜덤 선택
          </p>
        </div>
      </div>

      {/* 이벤트 목록 */}
      <div className="bg-slate-100 border border-slate-300 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">이벤트 목록</h2>
            <p className="text-xs text-slate-400">
              랜덤 추첨에 포함될 이벤트를 관리합니다
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-200/80 text-slate-400 text-sm rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            이벤트 추가
          </button>
        </div>

        {/* 이벤트 추가 폼 */}
        {showAddForm && (
          <div className="bg-slate-200/50 border border-slate-300 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">새 이벤트 추가</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  이벤트 타입
                </label>
                <select
                  value={newEvent.type}
                  onChange={(e) => handleNewEventTypeChange(e.target.value)}
                  className="w-full bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  아이콘 이모지
                </label>
                <input
                  type="text"
                  value={newEvent.emoji}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, emoji: e.target.value }))
                  }
                  className="w-full bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  placeholder="⚡"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                이벤트 제목 *
              </label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="예: 부동산 특별 호황!"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">설명</label>
              <input
                type="text"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="w-full bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                placeholder="학생들에게 보여질 설명"
              />
            </div>

            {/* 타입별 파라미터 입력 */}
            <div className="bg-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-2">이벤트 수치 설정</p>
              {newEvent.type === "REAL_ESTATE_PRICE_CHANGE" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">변동률</span>
                  <input
                    type="number"
                    step="5"
                    value={newEvent.params?.changePercent ?? 20}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          changePercent: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">
                    % (음수 = 하락)
                  </span>
                </div>
              )}
              {newEvent.type === "TAX_REFUND" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">국고 환급 비율</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="5"
                    value={Math.round(
                      (newEvent.params?.refundRate ?? 0.3) * 100,
                    )}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          refundRate: (parseFloat(e.target.value) || 0) / 100,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              )}
              {newEvent.type === "TAX_EXTRA" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">추징율</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    value={Math.round((newEvent.params?.taxRate ?? 0.03) * 100)}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          taxRate: (parseFloat(e.target.value) || 0) / 100,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">% (현금 기준)</span>
                </div>
              )}
              {newEvent.type === "CASH_BONUS" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">1인당 지급액</span>
                  <input
                    type="number"
                    step="10000"
                    min="1000"
                    value={newEvent.params?.amount ?? 50000}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          amount: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                    className="w-28 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">원</span>
                </div>
              )}
              {newEvent.type === "CASH_PENALTY" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">차감율</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={Math.round(
                      (newEvent.params?.penaltyRate ?? 0.05) * 100,
                    )}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          penaltyRate: (parseFloat(e.target.value) || 0) / 100,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">% (현금 기준)</span>
                </div>
              )}
              {newEvent.type === "STORE_PRICE_CHANGE" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">가격 배율</span>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.5"
                    value={newEvent.params?.multiplier ?? 2}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          multiplier: parseFloat(e.target.value) || 1,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">
                    배 (0.5 = 절반)
                  </span>
                </div>
              )}
              {(newEvent.type === "STOCK_TAX_CHANGE" ||
                newEvent.type === "MARKET_FEE_CHANGE") && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">배율</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="1"
                    value={newEvent.params?.multiplier ?? 0}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          multiplier: parseFloat(e.target.value) ?? 0,
                        },
                      }))
                    }
                    className="w-20 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">
                    배 (0 = 면제, 24시간)
                  </span>
                </div>
              )}
              {newEvent.type === "FAKE_LOTTERY_PLACEHOLDER" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">상금</span>
                  <input
                    type="number"
                    step="50000"
                    min="10000"
                    value={newEvent.params?.amount ?? 300000}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          amount: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                    className="w-28 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">원, 당첨자</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newEvent.params?.winnerCount ?? 1}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        params: {
                          ...prev.params,
                          winnerCount: parseInt(e.target.value) || 1,
                        },
                      }))
                    }
                    className="w-16 text-xs bg-slate-200 border border-slate-300 rounded px-2 py-1 text-white"
                  />
                  <span className="text-xs text-slate-400">명</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddEvent}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                추가하기
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-200/80 text-slate-400 text-sm rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 이벤트 목록 */}
        <div className="space-y-2">
          {settings.events.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              이벤트가 없습니다. 추가 버튼을 눌러 이벤트를 만들어보세요.
            </div>
          )}
          {settings.events.map((event) => (
            <div
              key={event.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                event.enabled !== false
                  ? "bg-slate-200/60 border-slate-300"
                  : "bg-slate-50/40 border-slate-300/50 opacity-50"
              }`}
            >
              {/* 아이콘 */}
              <div className="text-xl flex-shrink-0 w-8 text-center mt-0.5">
                {event.emoji || "⚡"}
              </div>

              {/* 내용 */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">
                    {event.title}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-400">
                    {EVENT_TYPES.find((t) => t.value === event.type)?.label ||
                      event.type}
                  </span>
                </div>
                {event.description && (
                  <p className="text-xs text-slate-400">{event.description}</p>
                )}
                {/* 파라미터 수정 */}
                <div className="pt-1">{getParamInputs(event)}</div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleTriggerNow(event.id)}
                  disabled={triggering || event.enabled === false}
                  title="이 이벤트 지금 실행"
                  className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleEvent(event.id)}
                  title={event.enabled !== false ? "비활성화" : "활성화"}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {event.enabled !== false ? (
                    <ToggleRight className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-slate-500" />
                  )}
                </button>
                <button
                  onClick={() => deleteEvent(event.id)}
                  title="삭제"
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
      >
        {saving ? "저장 중..." : "설정 저장"}
      </button>

      {/* 이벤트 히스토리 */}
      <div className="bg-slate-100 border border-slate-300 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-200/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-white">
              이벤트 발생 기록
            </span>
          </div>
          {showHistory ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showHistory && (
          <div className="px-5 pb-4 border-t border-slate-300">
            {historyLoading ? (
              <div className="py-6 text-center text-slate-500 text-sm">
                불러오는 중...
              </div>
            ) : history.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-sm">
                아직 발생한 이벤트가 없습니다
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 border-b border-slate-300 last:border-0"
                  >
                    <span className="text-lg flex-shrink-0">
                      {entry.event?.emoji || "⚡"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">
                        {entry.event?.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {getResultText(entry)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {formatTriggeredAt(entry.triggeredAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* cron 설정 안내 */}
      <div className="bg-slate-100/50 border border-slate-300 rounded-xl p-4">
        <p className="text-xs font-medium text-slate-400 mb-2">
          ⚙️ cron-job.org 설정 안내
        </p>
        <p className="text-xs text-slate-400">
          자동 이벤트가 작동하려면 cron-job.org에서{" "}
          <code className="bg-slate-200 px-1 rounded text-slate-400">
            economicEventScheduler
          </code>{" "}
          엔드포인트를
          <strong className="text-slate-400"> 매시간</strong> 호출하도록
          설정하세요.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          현재 설정된 시간(
          {HOUR_OPTIONS.find((o) => o.value === settings.triggerHour)?.label})에
          이벤트가 발생합니다.
        </p>
      </div>
    </div>
  );
}
