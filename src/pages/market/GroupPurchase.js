// src/pages/market/GroupPurchase.js
// 함께구매 - 학급 친구들과 함께 모금하여 아이템을 구매하는 기능
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import {
  db,
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
} from "../../firebase";
import {
  Users,
  Plus,
  HandCoins,
  Trophy,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { formatKoreanNumber } from "../../utils/numberFormatter";
import { logger } from "../../utils/logger";

export default function GroupPurchase() {
  const { user, userDoc, isAdmin } = useAuth();
  const { items } = useItems() || { items: [] };
  const { currencyUnit } = useCurrency?.() || { currencyUnit: "알찬" };
  const classCode = userDoc?.classCode;

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contributeModal, setContributeModal] = useState(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("active"); // active, completed, all

  // 새 캠페인 폼
  const [newCampaign, setNewCampaign] = useState({
    itemName: "",
    itemIcon: "🎁",
    itemDescription: "",
    targetPrice: "",
    useStoreItem: false,
    selectedItemId: "",
  });

  // 캠페인 목록 로드
  const fetchCampaigns = useCallback(async () => {
    if (!classCode) return;
    try {
      const q = query(
        collection(db, "groupPurchases"),
        where("classCode", "==", classCode),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCampaigns(list);
    } catch (err) {
      logger.error("함께구매 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [classCode]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // 캠페인 생성
  const handleCreate = async () => {
    const target = parseInt(newCampaign.targetPrice);
    if (!newCampaign.itemName.trim() || !target || target <= 0) return;

    try {
      await addDoc(collection(db, "groupPurchases"), {
        classCode,
        itemName: newCampaign.itemName.trim(),
        itemIcon: newCampaign.itemIcon || "🎁",
        itemDescription: newCampaign.itemDescription.trim(),
        targetPrice: target,
        currentAmount: 0,
        initiatorId: user.uid,
        initiatorName: userDoc?.name || "알 수 없음",
        contributors: [],
        status: "active",
        createdAt: serverTimestamp(),
        completedAt: null,
      });
      setShowCreateModal(false);
      setNewCampaign({
        itemName: "",
        itemIcon: "🎁",
        itemDescription: "",
        targetPrice: "",
        useStoreItem: false,
        selectedItemId: "",
      });
      fetchCampaigns();
    } catch (err) {
      logger.error("함께구매 생성 실패:", err);
      alert("생성에 실패했습니다.");
    }
  };

  // 기여(모금 참여)
  const handleContribute = async () => {
    const amount = parseInt(contributeAmount);
    if (!amount || amount <= 0 || !contributeModal) return;

    const campaign = contributeModal;
    const remaining = campaign.targetPrice - campaign.currentAmount;
    const actualAmount = Math.min(amount, remaining);

    if ((userDoc?.cash || 0) < actualAmount) {
      alert("잔액이 부족합니다.");
      return;
    }

    try {
      const campaignRef = doc(db, "groupPurchases", campaign.id);
      const userRef = doc(db, "users", user.uid);

      await runTransaction(db, async (transaction) => {
        const campaignSnap = await transaction.get(campaignRef);
        const userSnap = await transaction.get(userRef);

        if (!campaignSnap.exists() || !userSnap.exists()) {
          throw new Error("문서를 찾을 수 없습니다.");
        }

        const cData = campaignSnap.data();
        const uData = userSnap.data();

        if (cData.status !== "active") {
          throw new Error("이미 완료된 캠페인입니다.");
        }

        const currentRemaining = cData.targetPrice - cData.currentAmount;
        const finalAmount = Math.min(actualAmount, currentRemaining);

        if (uData.cash < finalAmount) {
          throw new Error("잔액이 부족합니다.");
        }

        const newContributors = [...(cData.contributors || [])];
        const existingIdx = newContributors.findIndex(
          (c) => c.userId === user.uid,
        );
        if (existingIdx >= 0) {
          newContributors[existingIdx].amount += finalAmount;
          newContributors[existingIdx].contributedAt = new Date();
        } else {
          newContributors.push({
            userId: user.uid,
            userName: userDoc?.name || "알 수 없음",
            amount: finalAmount,
            contributedAt: new Date(),
          });
        }

        const newTotal = cData.currentAmount + finalAmount;
        const isCompleted = newTotal >= cData.targetPrice;

        transaction.update(campaignRef, {
          currentAmount: newTotal,
          contributors: newContributors,
          status: isCompleted ? "completed" : "active",
          completedAt: isCompleted ? new Date() : null,
        });

        transaction.update(userRef, {
          cash: uData.cash - finalAmount,
        });
      });

      setContributeModal(null);
      setContributeAmount("");
      fetchCampaigns();
    } catch (err) {
      logger.error("모금 참여 실패:", err);
      alert(err.message || "참여에 실패했습니다.");
    }
  };

  // 캠페인 삭제 (관리자 또는 생성자)
  const handleDelete = async (campaign) => {
    if (
      !window.confirm(
        "정말 삭제하시겠습니까? 모금된 금액은 참여자에게 환불됩니다.",
      )
    )
      return;

    try {
      // 환불 처리
      if (campaign.contributors?.length > 0 && campaign.currentAmount > 0) {
        for (const contributor of campaign.contributors) {
          const userRef = doc(db, "users", contributor.userId);
          await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(userRef);
            if (snap.exists()) {
              transaction.update(userRef, {
                cash: (snap.data().cash || 0) + contributor.amount,
              });
            }
          });
        }
      }
      await deleteDoc(doc(db, "groupPurchases", campaign.id));
      fetchCampaigns();
    } catch (err) {
      logger.error("함께구매 삭제 실패:", err);
      alert("삭제에 실패했습니다.");
    }
  };

  // 필터된 캠페인
  const filtered = campaigns.filter((c) => {
    if (filter === "active") return c.status === "active";
    if (filter === "completed") return c.status === "completed";
    return true;
  });

  // 진행률 계산
  const getProgress = (c) =>
    Math.min(100, Math.round((c.currentAmount / c.targetPrice) * 100));

  // 내 기여금
  const getMyContribution = (c) => {
    const me = c.contributors?.find((x) => x.userId === user?.uid);
    return me?.amount || 0;
  };

  // 상점 아이템 선택 시 폼 자동 채우기
  const handleSelectStoreItem = (itemId) => {
    const item = items?.find((i) => i.id === itemId);
    if (item) {
      setNewCampaign((prev) => ({
        ...prev,
        selectedItemId: itemId,
        itemName: item.name,
        itemIcon: item.icon || "🎁",
        itemDescription: item.description || "",
        targetPrice: String(item.price || ""),
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-jua">함께구매</h1>
            <p className="text-xs text-gray-400">
              친구들과 모금하여 함께 아이템을 구매해요
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-bold transition-all hover:scale-105 shadow-lg shadow-purple-500/20"
        >
          <Plus className="w-4 h-4" />새 함께구매
        </button>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2">
        {[
          { key: "active", label: "진행중", icon: Clock },
          { key: "completed", label: "완료", icon: Trophy },
          { key: "all", label: "전체", icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === key
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* 캠페인 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-50">🤝</div>
          <p className="text-gray-400 text-lg font-medium">
            {filter === "active"
              ? "진행 중인 함께구매가 없습니다"
              : filter === "completed"
                ? "완료된 함께구매가 없습니다"
                : "함께구매 내역이 없습니다"}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            새 함께구매를 시작해보세요!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((campaign) => {
            const progress = getProgress(campaign);
            const myAmount = getMyContribution(campaign);
            const isCompleted = campaign.status === "completed";
            const isExpanded = expandedId === campaign.id;
            const canDelete = isAdmin() || campaign.initiatorId === user?.uid;
            const remaining = campaign.targetPrice - campaign.currentAmount;

            return (
              <div
                key={campaign.id}
                className={`rounded-2xl border transition-all ${
                  isCompleted
                    ? "bg-gradient-to-r from-emerald-900/20 to-teal-900/20 border-emerald-500/20"
                    : "bg-[rgba(20,20,35,0.6)] border-[rgba(0,255,242,0.1)] hover:border-purple-500/30"
                }`}
              >
                {/* 메인 카드 */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* 아이콘 */}
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                        isCompleted
                          ? "bg-emerald-500/20"
                          : "bg-purple-500/10 border border-purple-500/20"
                      }`}
                    >
                      {campaign.itemIcon}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-white truncate">
                          {campaign.itemName}
                        </h3>
                        {isCompleted && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                            <Trophy className="w-3 h-3" />
                            달성
                          </span>
                        )}
                      </div>

                      {campaign.itemDescription && (
                        <p className="text-xs text-gray-400 mb-2 line-clamp-1">
                          {campaign.itemDescription}
                        </p>
                      )}

                      {/* 진행 바 */}
                      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden mb-2">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                            isCompleted
                              ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                              : "bg-gradient-to-r from-purple-500 to-indigo-500"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white drop-shadow-md">
                            {progress}%
                          </span>
                        </div>
                      </div>

                      {/* 금액 정보 */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">
                          {formatKoreanNumber(campaign.currentAmount)}
                          {currencyUnit} /{" "}
                          {formatKoreanNumber(campaign.targetPrice)}
                          {currencyUnit}
                        </span>
                        <span className="text-gray-500">
                          참여 {campaign.contributors?.length || 0}명
                        </span>
                      </div>

                      {/* 내 기여 */}
                      {myAmount > 0 && (
                        <div className="mt-1.5 text-xs text-purple-300">
                          내 기여: {formatKoreanNumber(myAmount)}
                          {currencyUnit}
                        </div>
                      )}
                    </div>

                    {/* 참여/상세 버튼 */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {!isCompleted && (
                        <button
                          onClick={() => {
                            setContributeModal(campaign);
                            setContributeAmount("");
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white text-xs font-bold transition-all"
                        >
                          <HandCoins className="w-3.5 h-3.5" />
                          참여
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : campaign.id)
                        }
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        상세
                      </button>
                    </div>
                  </div>
                </div>

                {/* 상세 패널 */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                    <div className="text-xs text-gray-500">
                      시작: {campaign.initiatorName} ·{" "}
                      {campaign.createdAt?.toDate
                        ? campaign.createdAt
                            .toDate()
                            .toLocaleDateString("ko-KR")
                        : ""}
                    </div>

                    {/* 참여자 목록 */}
                    {campaign.contributors?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-300 mb-2">
                          참여자 ({campaign.contributors.length}명)
                        </p>
                        <div className="space-y-1.5">
                          {campaign.contributors
                            .sort((a, b) => b.amount - a.amount)
                            .map((c, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-300">
                                    {i + 1}.
                                  </span>
                                  <span className="text-sm text-white">
                                    {c.userName}
                                  </span>
                                </div>
                                <span className="text-sm font-bold text-purple-300">
                                  {formatKoreanNumber(c.amount)}
                                  {currencyUnit}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* 남은 금액 */}
                    {!isCompleted && remaining > 0 && (
                      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-xs text-amber-300">
                          목표까지{" "}
                          <strong>
                            {formatKoreanNumber(remaining)}
                            {currencyUnit}
                          </strong>{" "}
                          더 필요합니다
                        </span>
                      </div>
                    )}

                    {/* 삭제 버튼 */}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(campaign)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        삭제 (환불 처리)
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========== 새 캠페인 생성 모달 ========== */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md bg-[#12121f] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-b border-purple-500/20">
              <h2 className="text-lg font-bold text-white font-jua flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />새 함께구매
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 상점 아이템 선택 (필수) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">
                  아이템 선택 *
                </label>
                <select
                  value={newCampaign.selectedItemId}
                  onChange={(e) => handleSelectStoreItem(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1a1a2e] border border-white/10 text-white text-sm focus:border-purple-500/50 focus:outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white"
                >
                  <option value="">-- 아이템을 선택하세요 --</option>
                  {(items || [])
                    .filter((i) => i.available !== false)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.icon || "🎁"} {i.name} -{" "}
                        {formatKoreanNumber(i.price)}
                        {currencyUnit}
                      </option>
                    ))}
                </select>
              </div>

              {/* 선택된 아이템 미리보기 */}
              {newCampaign.selectedItemId && (
                <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  <span className="text-2xl">{newCampaign.itemIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">
                      {newCampaign.itemName}
                    </p>
                    {newCampaign.itemDescription && (
                      <p className="text-xs text-gray-400 truncate">
                        {newCampaign.itemDescription}
                      </p>
                    )}
                    <p className="text-xs text-purple-300 font-bold mt-0.5">
                      목표: {formatKoreanNumber(newCampaign.targetPrice)}
                      {currencyUnit}
                    </p>
                  </div>
                </div>
              )}

              {/* 목표 금액 (수정 가능) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">
                  목표 금액 (수정 가능)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={newCampaign.targetPrice}
                    onChange={(e) =>
                      setNewCampaign((p) => ({
                        ...p,
                        targetPrice: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2.5 pr-14 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                    placeholder="0"
                    min="1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    {currencyUnit}
                  </span>
                </div>
              </div>

              {/* 생성 버튼 */}
              <button
                onClick={handleCreate}
                disabled={
                  !newCampaign.selectedItemId ||
                  !newCampaign.targetPrice ||
                  parseInt(newCampaign.targetPrice) <= 0
                }
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-sm transition-all"
              >
                함께구매 시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 모금 참여 모달 ========== */}
      {contributeModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setContributeModal(null)}
        >
          <div
            className="w-full max-w-sm bg-[#12121f] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-b border-purple-500/20">
              <h2 className="text-lg font-bold text-white font-jua flex items-center gap-2">
                <HandCoins className="w-5 h-5 text-purple-400" />
                모금 참여
              </h2>
            </div>

            <div className="p-5 space-y-4">
              {/* 캠페인 정보 */}
              <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                <span className="text-2xl">{contributeModal.itemIcon}</span>
                <div>
                  <p className="text-sm font-bold text-white">
                    {contributeModal.itemName}
                  </p>
                  <p className="text-xs text-gray-400">
                    남은 금액:{" "}
                    {formatKoreanNumber(
                      contributeModal.targetPrice -
                        contributeModal.currentAmount,
                    )}
                    {currencyUnit}
                  </p>
                </div>
              </div>

              {/* 내 잔액 */}
              <div className="text-xs text-gray-400">
                내 잔액:{" "}
                <span className="text-white font-bold">
                  {formatKoreanNumber(userDoc?.cash || 0)}
                  {currencyUnit}
                </span>
              </div>

              {/* 금액 입력 */}
              <div className="relative">
                <input
                  type="number"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  className="w-full px-3 py-3 pr-14 rounded-xl bg-white/5 border border-white/10 text-white text-lg font-bold focus:border-purple-500/50 focus:outline-none text-center"
                  placeholder="0"
                  min="1"
                  max={Math.min(
                    userDoc?.cash || 0,
                    contributeModal.targetPrice - contributeModal.currentAmount,
                  )}
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  {currencyUnit}
                </span>
              </div>

              {/* 빠른 금액 버튼 */}
              <div className="flex gap-2">
                {[100, 500, 1000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setContributeAmount(String(amt))}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 text-gray-300 text-xs font-medium transition-all"
                  >
                    {formatKoreanNumber(amt)}
                  </button>
                ))}
              </div>

              {/* 전액 투입 */}
              <button
                onClick={() => {
                  const max = Math.min(
                    userDoc?.cash || 0,
                    contributeModal.targetPrice - contributeModal.currentAmount,
                  );
                  setContributeAmount(String(max));
                }}
                className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-all"
              >
                남은 금액 전부 참여
              </button>

              {/* 참여 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setContributeModal(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-sm transition-all"
                >
                  취소
                </button>
                <button
                  onClick={handleContribute}
                  disabled={
                    !contributeAmount ||
                    parseInt(contributeAmount) <= 0 ||
                    parseInt(contributeAmount) > (userDoc?.cash || 0)
                  }
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-sm transition-all"
                >
                  참여하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
