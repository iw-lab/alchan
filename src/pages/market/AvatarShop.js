// src/pages/market/AvatarShop.js - 아바타 상점
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  functions,
} from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { Sparkles, Crown, Shirt, Image as ImageIcon, Wand2, Check, Lock, ShoppingBag } from "lucide-react";
import { formatKoreanNumber } from "../../utils/numberFormatter";
import { isNetAssetsNegative, NEGATIVE_ASSETS_MESSAGE } from "../../utils/netAssets";
import Avatar from "../../components/Avatar";
import {
  AVATAR_SHOP_SLOTS,
  AVATAR_RARITIES,
  getRarity,
  getSlot,
  isOwned,
} from "../../utils/avatarShop";
import { getAvatarConfig } from "../../utils/avatarSystem";
import { logger } from "../../utils/logger";

const TAB_OPTIONS = [
  { id: "all", name: "전체", icon: Sparkles },
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [purchasing, setPurchasing] = useState(null); // itemId
  const [previewItem, setPreviewItem] = useState(null);

  const fetchItems = useCallback(async () => {
    try {
      const q = query(
        collection(db, "avatarShopItems"),
        where("active", "==", true),
        orderBy("sortOrder", "asc"),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(list);
    } catch (err) {
      logger.error("아바타 상점 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 현재 장착 상태 + 프리뷰 (장착 + 미리보기 합쳐서)
  const equippedOverlays = useMemo(() => {
    const eq = userDoc?.equippedAvatarItems || {};
    const owned = userDoc?.ownedAvatarItems || {};
    const slots = {};
    let bgUrl = null;
    let presetUrl = null;

    Object.entries(eq).forEach(([slot, itemId]) => {
      if (!itemId) return;
      const item = owned[itemId];
      if (!item?.imageUrl) return;
      if (slot === "background") {
        bgUrl = item.imageUrl;
      } else if (slot === "preset") {
        presetUrl = item.imageUrl;
      } else {
        slots[slot] = { url: item.imageUrl };
      }
    });

    // 프리뷰 (미리보기 아이템 가상 장착)
    if (previewItem && previewItem.imageUrl) {
      if (previewItem.slot === "background") bgUrl = previewItem.imageUrl;
      else if (previewItem.slot === "preset") presetUrl = previewItem.imageUrl;
      else slots[previewItem.slot] = { url: previewItem.imageUrl };
    }

    return { bgUrl, slots, presetUrl };
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
    if ((userDoc?.cash || 0) < item.price) {
      alert(`잔액 부족. 필요: ${item.price.toLocaleString()}원`);
      return;
    }
    if (await isNetAssetsNegative(userDoc)) {
      alert(NEGATIVE_ASSETS_MESSAGE);
      return;
    }
    if (!window.confirm(`${item.name} (${item.price.toLocaleString()}원) 구매하시겠습니까?`)) return;

    setPurchasing(item.id);

    // 낙관적 차감
    if (optimisticUpdate) optimisticUpdate({ cash: -item.price });

    try {
      const fn = httpsCallable(functions, "purchaseAvatarItem");
      await fn({ itemId: item.id });
      // 실시간 listener가 ownedAvatarItems 반영
      alert(`🎉 ${item.name} 구매 완료!`);
    } catch (err) {
      logger.error("아바타 아이템 구매 실패:", err);
      // 롤백
      if (optimisticUpdate) optimisticUpdate({ cash: item.price });
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

  const baseConfig = userDoc?.id ? getAvatarConfig(userDoc.id) : {};

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
        <div className="flex-shrink-0">
          <Avatar
            config={baseConfig}
            size={180}
            shopOverlays={equippedOverlays}
          />
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
            const canBuy = (userDoc?.cash || 0) >= item.price;
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                style={{
                  borderColor: equipped ? "#22c55e" : owned ? `${rar.color}80` : `${rar.color}40`,
                  boxShadow: equipped ? "0 0 0 2px #22c55e40" : undefined,
                  minWidth: 0,
                }}
                onMouseEnter={() => setPreviewItem(item)}
                onMouseLeave={() => setPreviewItem(null)}
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
                  <div className="text-sm font-bold mt-auto" style={{ color: rar.color }}>
                    💰 {formatKoreanNumber(item.price)}원
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
    </div>
  );
}
