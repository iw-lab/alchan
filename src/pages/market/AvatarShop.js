// src/pages/market/AvatarShop.js - 아바타 상점
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  functions,
} from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { Sparkles, Crown, Shirt, Image as ImageIcon, Wand2, Check, Lock, ShoppingBag, Smile, Edit3, RotateCcw } from "lucide-react";
import { formatKoreanNumber } from "../../utils/numberFormatter";
import { isNetAssetsNegative, NEGATIVE_ASSETS_MESSAGE } from "../../utils/netAssets";
import Avatar from "../../components/Avatar";
import {
  AVATAR_SHOP_SLOTS,
  AVATAR_RARITIES,
  getRarity,
  getSlot,
  isOwned,
  buildAvatarOverlays,
} from "../../utils/avatarShop";
import { logger } from "../../utils/logger";

const TAB_OPTIONS = [
  { id: "all", name: "전체", icon: Sparkles },
  { id: "base", name: "기본 얼굴", icon: Smile },
  { id: "preset", name: "프리셋", icon: Crown },
  { id: "hair", name: "헤어", icon: Wand2 },
  { id: "hat", name: "모자/관", icon: Crown },
  { id: "glasses", name: "안경", icon: ImageIcon },
  { id: "outfit", name: "의상", icon: Shirt },
  { id: "background", name: "배경", icon: ImageIcon },
  { id: "effect", name: "이펙트", icon: Sparkles },
  { id: "owned", name: "보유함", icon: ShoppingBag },
];

export default function AvatarShop() {
  const { user, userDoc, optimisticUpdate } = useAuth() || {};
  const [items, setItems] = useState([]);
  const [priceOverrides, setPriceOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [purchasing, setPurchasing] = useState(null); // itemId
  const [previewItem, setPreviewItem] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null); // { itemId, currentPrice }
  const [newPriceInput, setNewPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const isClassAdmin = !!(userDoc?.isAdmin || userDoc?.isSuperAdmin);
  const classCode = userDoc?.classCode;

  const fetchItems = useCallback(async () => {
    try {
      // 복합 인덱스 회피 - 전체 가져온 후 클라이언트에서 필터/정렬
      const snap = await getDocs(collection(db, "avatarShopItems"));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((i) => i.active !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      logger.log(`[AvatarShop] 로드된 아이템: ${list.length}개`);
      setItems(list);
    } catch (err) {
      logger.error("아바타 상점 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 학급별 가격 override 로드 (governments/{classCode}.avatarShopPriceOverrides)
  const fetchPriceOverrides = useCallback(async () => {
    if (!classCode) return;
    try {
      const govSnap = await getDoc(doc(db, "governments", classCode));
      if (govSnap.exists()) {
        setPriceOverrides(govSnap.data()?.avatarShopPriceOverrides || {});
      }
    } catch (err) {
      logger.warn("[AvatarShop] 가격 override 로드 실패:", err);
    }
  }, [classCode]);

  useEffect(() => {
    fetchItems();
    fetchPriceOverrides();
  }, [fetchItems, fetchPriceOverrides]);

  // 표시 가격 계산 (override > base)
  const getDisplayPrice = useCallback(
    (item) => {
      const o = priceOverrides?.[item.id];
      return typeof o === "number" && o >= 0 ? o : item.price;
    },
    [priceOverrides],
  );

  // 가격 수정 (관리자만)
  const openPriceEditor = (item) => {
    if (!isClassAdmin) return;
    const cur = getDisplayPrice(item);
    setEditingPrice({ itemId: item.id, baseName: item.name, basePrice: item.price, isOverridden: priceOverrides[item.id] != null });
    setNewPriceInput(String(cur));
  };

  const savePriceEdit = async () => {
    if (!editingPrice) return;
    const priceNum = parseInt(newPriceInput, 10);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      alert("0 이상의 숫자를 입력하세요.");
      return;
    }
    setSavingPrice(true);
    try {
      const fn = httpsCallable(functions, "updateAvatarShopPrice");
      await fn({ itemId: editingPrice.itemId, price: priceNum });
      setPriceOverrides((prev) => ({ ...prev, [editingPrice.itemId]: priceNum }));
      setEditingPrice(null);
      setNewPriceInput("");
    } catch (err) {
      logger.error("가격 수정 실패:", err);
      alert(err?.message || "가격 수정 실패");
    } finally {
      setSavingPrice(false);
    }
  };

  const resetPriceToBase = async () => {
    if (!editingPrice) return;
    setSavingPrice(true);
    try {
      const fn = httpsCallable(functions, "updateAvatarShopPrice");
      await fn({ itemId: editingPrice.itemId, price: null });
      setPriceOverrides((prev) => {
        const next = { ...prev };
        delete next[editingPrice.itemId];
        return next;
      });
      setEditingPrice(null);
      setNewPriceInput("");
    } catch (err) {
      logger.error("가격 초기화 실패:", err);
      alert(err?.message || "가격 초기화 실패");
    } finally {
      setSavingPrice(false);
    }
  };

  // 현재 장착 상태 + 프리뷰 (장착 + 미리보기 합쳐서)
  const equippedOverlays = useMemo(() => {
    const eq = userDoc?.equippedAvatarItems || {};
    const owned = userDoc?.ownedAvatarItems || {};
    const slots = {};
    let bgUrl = null;
    let presetUrl = null;
    let baseUrl = null;

    Object.entries(eq).forEach(([slot, itemId]) => {
      if (!itemId) return;
      const item = owned[itemId];
      if (!item?.imageUrl) return;
      if (slot === "background") {
        bgUrl = item.imageUrl;
      } else if (slot === "preset") {
        presetUrl = item.imageUrl;
      } else if (slot === "base") {
        baseUrl = item.imageUrl;
      } else {
        slots[slot] = { url: item.imageUrl };
      }
    });

    // 프리뷰 (미리보기 아이템 가상 장착)
    if (previewItem && previewItem.imageUrl) {
      if (previewItem.slot === "background") bgUrl = previewItem.imageUrl;
      else if (previewItem.slot === "preset") presetUrl = previewItem.imageUrl;
      else if (previewItem.slot === "base") baseUrl = previewItem.imageUrl;
      else slots[previewItem.slot] = { url: previewItem.imageUrl };
    }

    return { baseUrl, bgUrl, slots, presetUrl };
  }, [userDoc, previewItem]);

  // 필터링된 아이템
  const filteredItems = useMemo(() => {
    let list = [...items];
    if (activeTab === "owned") {
      const ownedMap = userDoc?.ownedAvatarItems || {};
      list = list.filter((i) => ownedMap[i.id]);
    } else if (activeTab !== "all") {
      list = list.filter((i) => i.slot === activeTab);
    }
    if (rarityFilter !== "all") {
      list = list.filter((i) => i.rarity === rarityFilter);
    }
    return list;
  }, [items, activeTab, rarityFilter, userDoc?.ownedAvatarItems]);

  const handlePurchase = async (item) => {
    if (!user?.uid) return;
    if (isOwned(userDoc, item.id)) {
      alert("이미 보유 중인 아이템입니다.");
      return;
    }
    // 학급별 override 가격 적용 (서버와 동일)
    const effectivePrice = getDisplayPrice(item);
    const isFree = (effectivePrice || 0) === 0;
    if (!isFree) {
      if ((userDoc?.cash || 0) < effectivePrice) {
        alert(`잔액 부족. 필요: ${effectivePrice.toLocaleString()}원`);
        return;
      }
      if (await isNetAssetsNegative(userDoc)) {
        alert(NEGATIVE_ASSETS_MESSAGE);
        return;
      }
      if (!window.confirm(`${item.name} (${effectivePrice.toLocaleString()}원) 구매하시겠습니까?`)) return;
    }

    setPurchasing(item.id);

    if (!isFree && optimisticUpdate) optimisticUpdate({ cash: -effectivePrice });

    try {
      const fn = httpsCallable(functions, "purchaseAvatarItem");
      await fn({ itemId: item.id });
      if (!isFree) alert(`🎉 ${item.name} 구매 완료!`);
    } catch (err) {
      logger.error("아바타 아이템 구매 실패:", err);
      if (!isFree && optimisticUpdate) optimisticUpdate({ cash: effectivePrice });
      alert(err?.message || "구매 실패");
    } finally {
      setPurchasing(null);
    }
  };

  const handleEquip = async (item) => {
    if (!user?.uid) return;
    if (!isOwned(userDoc, item.id)) {
      alert("먼저 구매가 필요합니다.");
      return;
    }
    try {
      const eq = { ...(userDoc?.equippedAvatarItems || {}) };
      eq[item.slot] = item.id;
      // 프리셋 장착 시 다른 슬롯 해제 안내 (선택)
      await updateDoc(doc(db, "users", user.uid), { equippedAvatarItems: eq });
    } catch (err) {
      logger.error("장착 실패:", err);
      alert("장착 실패");
    }
  };

  const handleUnequip = async (slot) => {
    if (!user?.uid) return;
    try {
      const eq = { ...(userDoc?.equippedAvatarItems || {}) };
      delete eq[slot];
      await updateDoc(doc(db, "users", user.uid), { equippedAvatarItems: eq });
    } catch (err) {
      logger.error("해제 실패:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 font-jua">아바타 상점</h1>
            <p className="text-xs text-slate-500">알찬 화폐로 나만의 아바타를 꾸며봐요!</p>
          </div>
        </div>
        <div className="text-sm font-bold text-slate-800">
          💰 {formatKoreanNumber(userDoc?.cash || 0)}원
        </div>
      </div>

      {/* 미리보기 + 장착 슬롯 */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-5">
        <div className="flex-shrink-0 relative">
          <Avatar
            size={200}
            shopOverlays={equippedOverlays}
          />
          {previewItem && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600 text-white text-[11px] font-bold shadow-lg whitespace-nowrap z-50 animate-pulse">
              👁️ 미리보기: {previewItem.name}
            </div>
          )}
        </div>
        <div className="flex-1 w-full">
          <h3 className="text-sm font-bold text-slate-700 mb-3">착용 중</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(AVATAR_SHOP_SLOTS)
              .filter(([k]) => k !== "preset")
              .map(([slotKey, slotInfo]) => {
                const equippedId = userDoc?.equippedAvatarItems?.[slotKey];
                const equipped = equippedId && userDoc?.ownedAvatarItems?.[equippedId];
                return (
                  <div
                    key={slotKey}
                    className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{slotInfo.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">{slotInfo.name}</div>
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {equipped?.name || "없음"}
                        </div>
                      </div>
                    </div>
                    {equipped && (
                      <button
                        onClick={() => handleUnequip(slotKey)}
                        className="text-xs text-red-500 hover:text-red-600 font-bold"
                        title="해제"
                      >
                        해제
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TAB_OPTIONS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-purple-500 text-white border border-purple-600 shadow-md"
                  : "bg-slate-100 text-slate-600 border border-transparent hover:bg-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* 등급 필터 */}
      <div className="flex gap-2 flex-wrap">
        {[{ id: "all", name: "전체 등급", color: "#64748b" }, ...Object.entries(AVATAR_RARITIES).map(([k, v]) => ({ id: k, name: v.name, color: v.color }))].map((r) => (
          <button
            key={r.id}
            onClick={() => setRarityFilter(r.id)}
            className="px-2.5 py-1 rounded-full text-xs font-bold border-2 transition-all"
            style={{
              borderColor: rarityFilter === r.id ? r.color : "transparent",
              background: rarityFilter === r.id ? `${r.color}20` : "#f1f5f9",
              color: rarityFilter === r.id ? r.color : "#64748b",
            }}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* 아이템 그리드 */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-50">🪄</div>
          <p className="text-slate-500 text-lg">
            {activeTab === "owned"
              ? "아직 보유한 아이템이 없습니다"
              : "해당 카테고리에 아이템이 없습니다"}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          {filteredItems.map((item) => {
            const owned = isOwned(userDoc, item.id);
            const equipped = userDoc?.equippedAvatarItems?.[item.slot] === item.id;
            const rar = getRarity(item.rarity);
            const slotInfo = getSlot(item.slot);
            const displayPrice = getDisplayPrice(item);
            const canBuy = (userDoc?.cash || 0) >= displayPrice;
            const isPreviewActive = previewItem?.id === item.id;
            const hasOverride = priceOverrides[item.id] != null;
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col cursor-pointer"
                style={{
                  borderColor: isPreviewActive
                    ? "#a855f7"
                    : equipped
                      ? "#22c55e"
                      : owned
                        ? `${rar.color}80`
                        : `${rar.color}40`,
                  boxShadow: isPreviewActive
                    ? "0 0 0 3px #a855f740"
                    : equipped
                      ? "0 0 0 2px #22c55e40"
                      : undefined,
                  minWidth: 0,
                }}
                onMouseEnter={() => setPreviewItem(item)}
                onMouseLeave={() => setPreviewItem(null)}
                onClick={() => setPreviewItem(isPreviewActive ? null : item)}
              >
                {/* 이미지 */}
                <div
                  className="relative flex items-center justify-center aspect-square"
                  style={{
                    background: `linear-gradient(135deg, ${rar.color}10 0%, ${rar.color}25 100%)`,
                  }}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-3/4 h-3/4 object-contain"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="text-5xl opacity-30">{slotInfo.icon}</div>
                  )}
                  {/* 등급 배지 */}
                  <div
                    className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: rar.color,
                      color: "white",
                      boxShadow: `0 2px 6px ${rar.glow}`,
                    }}
                  >
                    {rar.name}
                  </div>
                  {/* 슬롯 아이콘 */}
                  <div className="absolute top-2 right-2 text-xl bg-white/80 rounded-lg px-1.5 py-0.5">
                    {slotInfo.icon}
                  </div>
                  {/* 장착중 표시 */}
                  {equipped && (
                    <div className="absolute bottom-2 right-2 bg-green-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> 착용중
                    </div>
                  )}
                </div>

                {/* 내용 */}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <h3 className="text-sm font-bold text-slate-800 truncate" title={item.name}>
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto">
                    <div className="text-sm font-bold flex items-center gap-1" style={{ color: rar.color }}>
                      💰 {formatKoreanNumber(displayPrice)}원
                      {hasOverride && (
                        <span
                          className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300"
                          title={`기본가: ${formatKoreanNumber(item.price)}원`}
                        >
                          학급
                        </span>
                      )}
                    </div>
                    {isClassAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPriceEditor(item);
                        }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-purple-600"
                        title="가격 수정 (관리자)"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* 액션 버튼 */}
                  {owned ? (
                    equipped ? (
                      <button
                        onClick={() => handleUnequip(item.slot)}
                        className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                      >
                        해제하기
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEquip(item)}
                        className="w-full py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold"
                      >
                        착용하기
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={!canBuy || purchasing === item.id}
                      className="w-full py-2 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      style={{
                        background: canBuy
                          ? `linear-gradient(135deg, ${rar.color} 0%, ${rar.color}cc 100%)`
                          : "#94a3b8",
                      }}
                    >
                      {purchasing === item.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : !canBuy ? (
                        <>
                          <Lock className="w-3.5 h-3.5" /> 잔액 부족
                        </>
                      ) : (
                        "구매하기"
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 관리자 가격 수정 모달 */}
      {editingPrice && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !savingPrice && setEditingPrice(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b border-purple-200">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-600" />
                가격 수정 (학급 전용)
              </h2>
              <p className="text-xs text-slate-600 mt-1">{editingPrice.baseName}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-500">기본 가격</span>
                  <span className="font-bold text-slate-800">
                    {Number(editingPrice.basePrice || 0).toLocaleString()}원
                  </span>
                </div>
                {editingPrice.isOverridden && (
                  <div className="flex justify-between text-amber-700">
                    <span>현재 학급 가격</span>
                    <span className="font-bold">
                      {Number(priceOverrides[editingPrice.itemId] || 0).toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  새 가격 (학급 적용)
                </label>
                <input
                  type="number"
                  value={newPriceInput}
                  onChange={(e) => setNewPriceInput(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-lg font-bold focus:border-purple-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  💡 이 학급의 학생들에게만 적용됩니다. 다른 학급에는 영향 없음.
                </p>
              </div>
              <div className="flex gap-2">
                {editingPrice.isOverridden && (
                  <button
                    onClick={resetPriceToBase}
                    disabled={savingPrice}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    기본가로
                  </button>
                )}
                <button
                  onClick={() => setEditingPrice(null)}
                  disabled={savingPrice}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={savePriceEdit}
                  disabled={savingPrice}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  {savingPrice ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
