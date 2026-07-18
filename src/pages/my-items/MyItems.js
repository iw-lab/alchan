// src/pages/my-items/MyItems.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext";
import RandomDrawWheel from "./RandomDrawWheel";
import "./MyItems.css";
import LoginWarning from "../../components/LoginWarning";
import { useNavigate } from "react-router-dom";

import { logger } from "../../utils/logger";
import {
  isNetAssetsNegative,
  NEGATIVE_ASSETS_MESSAGE,
} from "../../utils/netAssets";
// Firebase
import {
  db,
  firebaseDoc,
  getDoc,
  updateDoc,
  functions,
  httpsCallable,
} from "../../firebase";

const ITEM_DEFAULT_DURATION_MS = 5 * 60 * 1000;

const formatTimeLeft = (
  usedTimestamp,
  durationMs = ITEM_DEFAULT_DURATION_MS,
) => {
  const now = Date.now();
  const timeElapsed = now - usedTimestamp;
  const timeLeft = durationMs - timeElapsed;
  if (timeLeft <= 0) return "만료됨";
  const hours = Math.floor(timeLeft / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
  let formatted = "";
  if (hours > 0) formatted += `${hours}시간 `;
  if (minutes > 0 || hours > 0) formatted += `${minutes}분 `;
  formatted += `${seconds}초 남음`;
  return formatted.trim();
};

const QuantityBadge = ({ quantity }) => {
  let badgeClass = "";
  if (quantity > 10) badgeClass = "quantity-high";
  else if (quantity > 5) badgeClass = "quantity-medium";
  else badgeClass = "quantity-low";
  return <span className={`quantity-badge ${badgeClass}`}>×{quantity}</span>;
};

const MyItems = () => {
  const { user, userDoc, users, classmates } = useAuth() || {};
  const {
    items: storeItems,
    userItems,
    useItem,
    drawRandomItem,
    listItemForSale,
    sellItemToTreasury,
    refreshData,
    updateLocalUserItems,
  } = useItems() || {
    items: [],
    userItems: [],
    useItem: null,
    drawRandomItem: null,
    listItemForSale: null,
    sellItemToTreasury: null,
    refreshData: null,
    updateLocalUserItems: null,
  };

  const navigate = useNavigate();

  const [notification, setNotification] = useState(null);
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const groupedUserItems = useMemo(() => {
    if (!userItems || userItems.length === 0) {
      return [];
    }

    const itemsMap = new Map();

    userItems.forEach((item) => {
      if (
        !item ||
        !item.itemId ||
        typeof item.quantity !== "number" ||
        item.quantity <= 0
      ) {
        return;
      }

      const key = item.itemId;

      if (itemsMap.has(key)) {
        const existingGroup = itemsMap.get(key);
        existingGroup.totalQuantity += item.quantity;
        existingGroup.sourceDocs.push(item);
        if (item.name && !existingGroup.displayInfo.name) {
          existingGroup.displayInfo.name = item.name;
        }
        if (item.icon && !existingGroup.displayInfo.icon) {
          existingGroup.displayInfo.icon = item.icon;
        }
        if (item.description && !existingGroup.displayInfo.description) {
          existingGroup.displayInfo.description = item.description;
        }
      } else {
        itemsMap.set(key, {
          displayInfo: {
            itemId: item.itemId,
            name: item.name || "알 수 없는 아이템",
            icon: item.icon || "🔮",
            description: item.description || "",
            type: item.type || "general",
            price: item.price || 0,
            durationMs: item.durationMs || ITEM_DEFAULT_DURATION_MS,
          },
          totalQuantity: item.quantity,
          sourceDocs: [item],
        });
      }
    });

    return Array.from(itemsMap.values()).sort((a, b) =>
      a.displayInfo.name.localeCompare(b.displayInfo.name),
    );
  }, [userItems]);

  const [recentlyUsedItems, setRecentlyUsedItems] = useState(() => {
    try {
      const saved = localStorage.getItem(
        `recentlyUsedItems_${user?.uid || "guest"}`,
      );
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    if (user?.uid) {
      localStorage.setItem(
        `recentlyUsedItems_${user.uid}`,
        JSON.stringify(recentlyUsedItems),
      );
    }
  }, [recentlyUsedItems, user?.uid]);

  // 남은 시간 카운트다운을 매초 강제 리렌더 (아래 setRecentlyUsedItems는 만료 전까지
  // 동일 참조를 반환해 리렌더를 일으키지 않으므로, formatTimeLeft가 갱신되지 않는 문제 방지)
  const [, setNowTick] = useState(0);
  const hasRecentlyUsedItems = Object.keys(recentlyUsedItems).length > 0;
  useEffect(() => {
    if (!hasRecentlyUsedItems) return;
    const timer = setInterval(() => {
      setNowTick((t) => (t + 1) % 1000000);
      setRecentlyUsedItems((prevItems) => {
        let itemsChanged = false;
        const updatedItems = { ...prevItems };
        const now = Date.now();
        Object.keys(updatedItems).forEach((itemId) => {
          const itemData = updatedItems[itemId];
          const duration =
            itemData.itemDetails?.durationMs || ITEM_DEFAULT_DURATION_MS;
          if (now - itemData.usedTimestamp > duration) {
            delete updatedItems[itemId];
            itemsChanged = true;
          }
        });
        return itemsChanged ? updatedItems : prevItems;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasRecentlyUsedItems]);

  const [useItemModal, setUseItemModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
  });
  const [giftModal, setGiftModal] = useState({
    isOpen: false,
    item: null,
  });
  const [giftRecipientUid, setGiftRecipientUid] = useState("");
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [isGifting, setIsGifting] = useState(false);
  // 선물 1건당 고정 idempotency 키 (모달 오픈 시 발급, 재시도에도 동일 키 재사용)
  const giftIdemKeyRef = useRef(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isListingToMarket, setIsListingToMarket] = useState(false); // 버튼 disabled(UX)용
  const listingToMarketRef = useRef(false); // 🔒 실제 이중제출 가드 — 동기 ref(useState는 같은 틱 재진입 미차단)
  const [sellToMarketModal, setSellToMarketModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
    price: 0,
  });
  // 💰 국고 되팔기 모달
  const [sellToTreasuryModal, setSellToTreasuryModal] = useState({
    isOpen: false,
    group: null,
    quantity: 1,
  });
  const [isSellingToTreasury, setIsSellingToTreasury] = useState(false);

  // 현재 상점가 기준 되팔기 단가(70%) 계산 — 상점에 판매중인 아이템만 되팔기 가능
  // 가치 고정 아이템(자유시간 등)은 제외 (서버 isStorePriceEventExcluded와 동일 판별)
  const isValueFixedItem = (store) => {
    if (!store) return false;
    if (store.excludeFromEconomicEvent === true) return true;
    const name = (store.name || "").toString();
    return name.includes("자유시간") || name.includes("자유 시간");
  };
  const getTreasuryBuyback = (group) => {
    const itemId = group?.displayInfo?.itemId;
    const store = storeItems?.find((it) => it.id === itemId);
    if (!store || store.available === false || isValueFixedItem(store)) {
      return { eligible: false, unitPrice: 0 };
    }
    const price = Number(store.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { eligible: false, unitPrice: 0 };
    }
    return { eligible: true, unitPrice: Math.max(1, Math.round(price * 0.7)) };
  };

  const handleOpenSellToTreasuryModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!sellItemToTreasury) {
      showNotification("error", "되팔기 기능을 사용할 수 없습니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "되팔 아이템이 없습니다.");
      return;
    }
    const { eligible } = getTreasuryBuyback(group);
    if (!eligible) {
      showNotification(
        "error",
        "상점에서 판매중인 아이템만 국고에 되팔 수 있어요.",
      );
      return;
    }
    setSellToTreasuryModal({ isOpen: true, group, quantity: 1 });
  };

  const handleCloseSellToTreasuryModal = () => {
    if (isSellingToTreasury) return;
    setSellToTreasuryModal({ isOpen: false, group: null, quantity: 1 });
  };

  const handleSellToTreasuryQuantityChange = (value) => {
    const maxQty = sellToTreasuryModal.group?.totalQuantity || 1;
    const newQty = Math.max(1, Math.min(maxQty, parseInt(value, 10) || 1));
    setSellToTreasuryModal((prev) => ({ ...prev, quantity: newQty }));
  };

  const handleConfirmSellToTreasury = async () => {
    if (isSellingToTreasury) return; // 클라이언트 lock
    const group = sellToTreasuryModal.group;
    const quantity = sellToTreasuryModal.quantity;
    if (!group || !sellItemToTreasury) return;
    const itemId = group.displayInfo.itemId;

    setIsSellingToTreasury(true);
    try {
      const res = await sellItemToTreasury(itemId, quantity);
      if (res?.success) {
        showNotification(
          "success",
          res.message ||
            `${group.displayInfo.name} ${quantity}개를 국고에 되팔았어요.`,
        );
        setSellToTreasuryModal({ isOpen: false, group: null, quantity: 1 });
      } else {
        showNotification("error", res?.message || "되팔기에 실패했습니다.");
      }
    } catch (error) {
      logger.error("[MyItems] 국고 되팔기 실패:", error);
      showNotification("error", `되팔기 중 오류: ${error.message}`);
    } finally {
      setIsSellingToTreasury(false);
    }
  };

  const handleOpenUseItemModal = async (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "사용할 수 있는 아이템이 아닙니다.");
      return;
    }
    if (await isNetAssetsNegative(userDoc)) {
      showNotification("error", NEGATIVE_ASSETS_MESSAGE);
      return;
    }
    // 🎰 랜덤뽑기 아이템은 사용 모달 대신 돌림판으로
    if (group.displayInfo.type === "randomDraw") {
      openWheelAndSpin(group);
      return;
    }
    setUseItemModal({ isOpen: true, item: group, quantity: 1 });
  };

  // 🎰 랜덤뽑기 돌림판 상태/핸들러
  const [wheelModal, setWheelModal] = useState({
    isOpen: false,
    group: null,
    spinning: false,
    segments: [],
    winningIndex: 0,
    result: null,
    error: null,
  });
  const spinLockRef = useRef(false);
  const useItemLockRef = useRef(false); // 🔒 아이템 '사용하기' 이중제출(더블클릭 이중소모) 방지

  const openWheelAndSpin = async (group) => {
    if (spinLockRef.current) return;
    if (!drawRandomItem) {
      showNotification("error", "뽑기 기능을 사용할 수 없습니다.");
      return;
    }
    spinLockRef.current = true;
    setWheelModal({
      isOpen: true,
      group,
      spinning: true,
      segments: [],
      winningIndex: 0,
      result: null,
      error: null,
    });
    try {
      const res = await drawRandomItem(group.displayInfo.itemId);
      if (!res?.success) {
        throw new Error(res?.message || "뽑기에 실패했습니다.");
      }
      setWheelModal((prev) => ({
        ...prev,
        spinning: true,
        segments: res.segments || [],
        winningIndex: res.winningIndex ?? 0,
        result: res,
      }));
    } catch (e) {
      setWheelModal((prev) => ({ ...prev, spinning: false, error: e.message }));
      showNotification("error", `뽑기 실패: ${e.message}`);
      spinLockRef.current = false;
    }
  };

  const handleWheelDone = () => {
    const res = wheelModal.result;
    setWheelModal((prev) => ({ ...prev, spinning: false }));
    spinLockRef.current = false;
    if (res?.outcome === "win") {
      showNotification("success", `🎉 ${res.prize?.name} 당첨!`);
    } else if (res?.outcome === "lose") {
      showNotification("info", "아쉽게도 꽝이에요 😢");
    }
    if (refreshData) refreshData();
  };

  const closeWheelModal = () => {
    if (wheelModal.spinning) return; // 회전 중에는 닫기 방지
    spinLockRef.current = false;
    setWheelModal({
      isOpen: false,
      group: null,
      spinning: false,
      segments: [],
      winningIndex: 0,
      result: null,
      error: null,
    });
  };

  const handleCloseUseItemModal = () => {
    setUseItemModal({ isOpen: false, item: null, quantity: 1 });
  };

  const handleOpenGiftModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!classmates || classmates.length === 0) {
      showNotification("error", "선물할 친구 목록을 불러올 수 없습니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "선물할 아이템이 없습니다.");
      return;
    }

    setGiftRecipientUid("");
    setGiftQuantity(1);
    // 🔑 idempotency 키는 모달 오픈 시 1회 발급 — 타임아웃 후 재시도가 같은 키를 쓰게 해
    //    서버는 성공했는데 응답만 유실된 경우의 중복 선물을 차단한다.
    giftIdemKeyRef.current = crypto.randomUUID();
    setGiftModal({ isOpen: true, item: group });
  };

  const handleCloseGiftModal = () => {
    giftIdemKeyRef.current = null;
    setGiftModal({ isOpen: false, item: null });
  };

  const handleOpenSellToMarketModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "판매할 아이템이 없습니다.");
      return;
    }
    if (!listItemForSale) {
      showNotification("error", "판매 기능을 사용할 수 없습니다.");
      return;
    }
    const defaultPrice = group.displayInfo.price
      ? Math.max(1, Math.round(group.displayInfo.price * 0.8))
      : 100;
    setSellToMarketModal({
      isOpen: true,
      item: group,
      quantity: 1,
      price: defaultPrice,
    });
  };

  const handleCloseSellToMarketModal = () => {
    setSellToMarketModal({
      isOpen: false,
      item: null,
      quantity: 1,
      price: 0,
    });
  };

  const handleSellToMarketQuantityChange = (value) => {
    const maxQty = sellToMarketModal.item?.totalQuantity || 1;
    const newQty = Math.max(1, Math.min(maxQty, parseInt(value) || 1));
    setSellToMarketModal((prev) => ({
      ...prev,
      quantity: newQty,
    }));
  };

  const handleSellToMarketPriceChange = (value) => {
    const newPrice = Math.max(1, parseInt(value) || 1);
    setSellToMarketModal((prev) => ({
      ...prev,
      price: newPrice,
    }));
  };

  const handleConfirmUseItem = async () => {
    if (useItemLockRef.current) return; // 🔒 이중제출(더블클릭 이중소모) 방지
    const { item: group, quantity: quantityToUse } = useItemModal;
    if (!group || !quantityToUse || quantityToUse <= 0) {
      showNotification("error", "사용할 아이템 정보가 올바르지 않습니다.");
      return;
    }

    if (group.totalQuantity < quantityToUse) {
      showNotification("error", "보유 수량이 부족합니다.");
      return;
    }

    useItemLockRef.current = true;
    try {
      // 모달은 즉시 닫고, 서버 결과를 기다린 뒤 알림 (try 안에서 — 예외 시에도 finally가 lock 해제)
      handleCloseUseItemModal();
      let remainingToUse = quantityToUse;

      // 수량 적은 doc부터 소진 (sourceDocs는 cloud function이 만든 inventory doc 배열)
      const sortedDocs = [...group.sourceDocs].sort(
        (a, b) => (a.quantity || 0) - (b.quantity || 0),
      );

      for (const sd of sortedDocs) {
        if (remainingToUse <= 0) break;
        const amountToUse = Math.min(sd.quantity || 0, remainingToUse);
        if (amountToUse <= 0) continue;

        // useItem은 cloud function (useUserItem) 호출 + 낙관적 차감 처리
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const result = await useItem(sd.id, amountToUse);

        if (!result?.success) {
          throw new Error(
            result?.message || `아이템 사용에 실패했습니다 (${sd.id})`,
          );
        }

        remainingToUse -= amountToUse;
      }

      if (remainingToUse > 0) {
        throw new Error(
          `요청한 수량을 모두 사용할 수 없습니다 (남은 수량: ${remainingToUse})`,
        );
      }

      // ✅ 서버 성공 확인 후 알림 + 사용중 표시 (낙관적 표시는 ItemContext가 이미 처리)
      showNotification(
        "success",
        `${group.displayInfo.name} ${quantityToUse}개를 사용했습니다.`,
      );

      setRecentlyUsedItems((prev) => {
        const existing = prev[group.displayInfo.itemId];
        return {
          ...prev,
          [group.displayInfo.itemId]: {
            usedTimestamp: Date.now(),
            usedQuantity: (existing?.usedQuantity || 0) + quantityToUse,
            itemDetails: {
              name: group.displayInfo.name,
              icon: group.displayInfo.icon,
              durationMs:
                group.displayInfo.durationMs || ITEM_DEFAULT_DURATION_MS,
            },
          },
        };
      });
    } catch (error) {
      // 서버 실패 → ItemContext가 이미 롤백 처리. 사용자에게 명확한 에러 알림.
      showNotification(
        "error",
        `아이템 사용 실패: ${error.message || "알 수 없는 오류"}`,
      );
    } finally {
      useItemLockRef.current = false;
    }
  };

  const handleRemoveUsedItem = (itemId) => {
    setRecentlyUsedItems((prevItems) => {
      const updatedItems = { ...prevItems };
      delete updatedItems[itemId];
      return updatedItems;
    });
    showNotification("info", "아이템 사용을 중지했습니다.");
  };

  const handleSendGift = async () => {
    if (isGifting) return;

    const { item: group } = giftModal;
    if (!user || !giftRecipientUid || !group) {
      logger.error("[MyItems] 선물 정보 오류:", {
        user: !!user,
        giftRecipientUid,
        group: !!group,
      });
      showNotification("error", "선물 정보가 올바르지 않습니다.");
      return;
    }
    const quantity = Number(giftQuantity) || 1;
    if (quantity <= 0 || quantity > group.totalQuantity) {
      showNotification("error", "선물 수량이 올바르지 않습니다.");
      return;
    }

    setIsGifting(true);

    // 낙관적 업데이트: 내 아이템에서 즉시 차감 (실패 시 롤백)
    const originalUserItems = [...userItems];
    let remainingToDeduct = quantity;
    const updatedUserItems = [];
    for (const item of userItems) {
      if (item.itemId === group.displayInfo.itemId && remainingToDeduct > 0) {
        const deductAmount = Math.min(item.quantity, remainingToDeduct);
        const newQuantity = item.quantity - deductAmount;
        if (newQuantity > 0) {
          updatedUserItems.push({ ...item, quantity: newQuantity });
        }
        remainingToDeduct -= deductAmount;
      } else {
        updatedUserItems.push(item);
      }
    }
    if (updateLocalUserItems) {
      updateLocalUserItems(updatedUserItems);
    }

    try {
      // 🎁 선물은 서버(giftItem CF)가 원자 처리: 같은 학급 검증 + 양측 로그 + idempotency.
      //    (클라이언트가 남의 인벤토리에 직접 쓰던 방식은 2026-07-10 rules 잠금으로 차단됨)
      const giftItemFn = httpsCallable(functions, "giftItem");
      if (!giftIdemKeyRef.current) {
        giftIdemKeyRef.current = crypto.randomUUID();
      }
      const result = await giftItemFn({
        recipientUid: giftRecipientUid,
        itemId: group.displayInfo.itemId,
        quantity,
        idempotencyKey: giftIdemKeyRef.current,
      });

      if (!result?.data?.success) {
        throw new Error(result?.data?.message || "선물하기에 실패했습니다.");
      }

      logger.log("[MyItems] ✅ 선물 완료:", result.data.message);
      showNotification("success", result.data.message);
      handleCloseGiftModal();

      setTimeout(() => {
        if (refreshData) refreshData();
      }, 2000);
    } catch (error) {
      logger.error("[MyItems] 선물하기 실패:", error);

      // 재시도인데 서버는 이미 성공했던 경우(응답 유실) — 중복 아님, 성공으로 안내
      if (String(error.message || "").includes("이미 처리된 요청")) {
        showNotification("success", "선물이 이미 전달되었습니다.");
        handleCloseGiftModal();
        if (refreshData) refreshData();
        return; // setIsGifting(false)는 finally에서 처리
      }

      // 낙관적 업데이트 롤백
      if (updateLocalUserItems) {
        updateLocalUserItems(originalUserItems);
      }
      showNotification("error", `선물하기 실패: ${error.message}`);

      if (refreshData) {
        try {
          const result = refreshData();
          if (result && typeof result.then === "function") {
            await result;
          }
        } catch (syncError) {
          logger.error("[MyItems] 데이터 새로고침 실패:", syncError);
        }
      }
    } finally {
      setIsGifting(false);
    }
  };
  const handleConfirmSellToMarket = async () => {
    if (listingToMarketRef.current) return; // 🔒 동기 ref 가드(같은 틱 재진입까지 차단)
    const { item: group, quantity, price } = sellToMarketModal;
    if (!group || !quantity || !price) {
      showNotification("error", "판매 정보가 올바르지 않습니다.");
      return;
    }

    listingToMarketRef.current = true;
    setIsListingToMarket(true); // 버튼 disabled(UX)
    try {
      // 🔥 실제 Firestore에서 문서 다시 조회
      const docIds = group.sourceDocs.map((doc) => doc.id);
      const actualSourceDocs = [];
      let actualTotalQuantity = 0;

      for (const docId of docIds) {
        const docRef = firebaseDoc(db, "users", user.uid, "inventory", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          actualSourceDocs.push({
            id: docSnap.id,
            ...data,
          });
          actualTotalQuantity += data.quantity || 0;
        }
      }

      logger.log("[MyItems] 시장에 팔기 - 실제 조회:", {
        요청수량: quantity,
        실제보유: actualTotalQuantity,
        문서수: actualSourceDocs.length,
      });

      if (actualSourceDocs.length === 0) {
        throw new Error(
          "판매할 아이템을 찾을 수 없습니다. 페이지를 새로고침해주세요.",
        );
      }

      if (actualTotalQuantity < quantity) {
        throw new Error(
          `아이템 수량이 부족합니다. (필요: ${quantity}, 실제 보유: ${actualTotalQuantity})`,
        );
      }

      // 실제 문서들로 판매 진행
      let remainingToSell = quantity;
      const itemsToProcess = [...actualSourceDocs].sort(
        (a, b) => a.quantity - b.quantity,
      );

      for (const doc of itemsToProcess) {
        if (remainingToSell <= 0) break;
        const amountToSell = Math.min(doc.quantity, remainingToSell);

        // 🔥 FIX: 판매 전 필수 필드가 undefined인 경우 기본값으로 업데이트
        const updateFields = {};
        if (doc.description === undefined) {
          logger.warn(`[MyItems] 누락된 description 필드 수정: ${doc.id}`);
          updateFields.description = "";
        }
        if (doc.icon === undefined) {
          logger.warn(`[MyItems] 누락된 icon 필드 수정: ${doc.id}`);
          updateFields.icon = "🔮";
        }
        if (doc.type === undefined) {
          logger.warn(`[MyItems] 누락된 type 필드 수정: ${doc.id}`);
          updateFields.type = "general";
        }
        if (Object.keys(updateFields).length > 0) {
          const itemRef = firebaseDoc(
            db,
            "users",
            user.uid,
            "inventory",
            doc.id,
          );
          await updateDoc(itemRef, updateFields);
          // 로컬 doc 객체도 업데이트
          Object.assign(doc, updateFields);
        }

        const result = await listItemForSale({
          itemId: doc.id,
          quantity: amountToSell,
          price,
        });

        if (!result.success) {
          throw new Error(
            result.message || "일부 아이템 판매 등록에 실패했습니다.",
          );
        }
        remainingToSell -= amountToSell;
      }

      showNotification(
        "success",
        `${group.displayInfo.name} ${quantity}개를 시장에 판매 등록했습니다.`,
      );
      handleCloseSellToMarketModal();

      setTimeout(() => {
        if (window.confirm("아이템 시장으로 이동하시겠습니까?")) {
          navigate("/item-market");
        }
      }, 500);
    } catch (error) {
      logger.error("[MyItems] 시장 판매 등록 실패:", error);

      if (
        error.message.includes("아이템을 찾을 수 없") ||
        error.message.includes("수량이 부족합니다")
      ) {
        showNotification(
          "warning",
          "아이템 정보가 변경되었습니다. 데이터를 동기화합니다.",
        );
        setIsSyncing(true);

        if (refreshData) {
          refreshData()
            .then(() => {
              showNotification(
                "success",
                "동기화가 완료되었습니다. 다시 시도해주세요.",
              );
              setIsSyncing(false);
            })
            .catch((syncError) => {
              logger.error("[MyItems] 데이터 동기화 실패:", syncError);
              showNotification("error", "데이터 동기화에 실패했습니다.");
              setIsSyncing(false);
            });
        } else {
          showNotification(
            "error",
            `오류가 발생했으며 데이터를 새로고칠 수 없습니다: ${error.message}`,
          );
          setIsSyncing(false);
        }
      } else {
        showNotification("error", `시장 판매 등록 중 오류: ${error.message}`);
      }
    } finally {
      listingToMarketRef.current = false;
      setIsListingToMarket(false);
    }
  };

  const itemToGift = giftModal.isOpen ? giftModal.item : null;

  return (
    <>
      <div className="page-container relative">
        <h2 className="page-title">내 아이템 관리</h2>
        {!user && <LoginWarning />}
        {notification && (
          <div className={`notification bg-${notification.type}-100`}>
            {notification.message}
          </div>
        )}

        {user && (
          <>
            {Object.keys(recentlyUsedItems).length > 0 && (
              <div>
                <h3 className="section-title">사용 중인 아이템</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                  {Object.entries(recentlyUsedItems).map(
                    ([itemId, itemData]) => (
                      <div
                        key={itemId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          background: "linear-gradient(135deg, #f5f3ff, #eef2ff)",
                          border: "1px solid #c7d2fe",
                          borderRadius: "12px",
                          padding: "12px 16px",
                        }}
                      >
                        <span style={{ fontSize: "1.5rem" }}>{itemData.itemDetails.icon || "✨"}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem" }}>
                            {itemData.itemDetails.name}
                            {itemData.usedQuantity >= 1 && (
                              <span style={{ marginLeft: "6px", fontSize: "0.8rem", color: "#6366f1" }}>
                                ×{itemData.usedQuantity}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                            {formatTimeLeft(
                              itemData.usedTimestamp,
                              itemData.itemDetails.durationMs,
                            )}
                          </div>
                        </div>
                        <button
                          className="stop-using-button"
                          onClick={() => handleRemoveUsedItem(itemId)}
                          style={{ marginLeft: "8px", padding: "6px 14px", fontSize: "0.8rem", borderRadius: "8px" }}
                        >
                          사용 중지
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="content-card-section">
              <h3 className="section-title">보유 아이템</h3>
              {groupedUserItems.length > 0 ? (
                <div className="items-grid">
                  {groupedUserItems.map((group) => (
                    <div
                      key={group.displayInfo.itemId}
                      className="store-item-card compact-myitem-card"
                    >
                      <div className="item-content">
                        <div className="my-item-header-compact">
                          <h3 className="my-item-name-compact">
                            {group.displayInfo.name}
                          </h3>
                          <QuantityBadge quantity={group.totalQuantity} />
                        </div>
                        {group.displayInfo.description &&
                          group.displayInfo.description.trim() && (
                            <p className="my-item-description-compact">
                              {group.displayInfo.description}
                            </p>
                          )}
                        <div className="my-item-actions">
                          <button
                            className="use-item-button"
                            onClick={() => {
                              handleOpenUseItemModal(group);
                            }}
                            disabled={isSyncing}
                          >
                            사용하기
                          </button>
                          <button
                            className="gift-item-button"
                            onClick={() => {
                              handleOpenGiftModal(group);
                            }}
                            disabled={
                              !classmates ||
                              classmates.length === 0 ||
                              isSyncing
                            }
                          >
                            {isSyncing ? "동기화 중" : "선물하기"}
                          </button>
                          {getTreasuryBuyback(group).eligible && (
                            <button
                              className="sell-treasury-button"
                              onClick={() => {
                                handleOpenSellToTreasuryModal(group);
                              }}
                              disabled={isSyncing}
                              title="현재 상점가의 70%로 국고에 되팔기"
                            >
                              국고에 팔기
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-message">
                  <p>보유 중인 아이템이 없습니다.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {wheelModal.isOpen && (
        <div
          className="myitems-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWheelModal();
          }}
        >
          <div
            className="myitems-modal-container"
            style={{ maxWidth: "360px" }}
          >
            <div className="myitems-modal-header">
              <h3>🎰 {wheelModal.group?.displayInfo?.name || "랜덤뽑기"}</h3>
              {!wheelModal.spinning && (
                <button
                  onClick={closeWheelModal}
                  className="myitems-close-button"
                >
                  ✕
                </button>
              )}
            </div>
            <div
              className="myitems-modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                padding: "20px",
              }}
            >
              {wheelModal.error ? (
                <p style={{ color: "#dc2626", fontWeight: 600 }}>
                  {wheelModal.error}
                </p>
              ) : wheelModal.segments.length === 0 ? (
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#6366f1" }}>
                  🎲 뽑는 중...
                </p>
              ) : (
                <>
                  <RandomDrawWheel
                    segments={wheelModal.segments}
                    winningIndex={wheelModal.winningIndex}
                    onDone={handleWheelDone}
                  />
                  {/* 📊 당첨 확률 공개 (서버가 내려준 portion = 실제 확률) */}
                  <div
                    style={{
                      width: "100%",
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#475569",
                        marginBottom: "6px",
                      }}
                    >
                      📊 당첨 확률
                    </div>
                    {wheelModal.segments.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          color: s.name === "꽝" ? "#94a3b8" : "#334155",
                          padding: "2px 0",
                        }}
                      >
                        <span>
                          {s.icon} {s.name}
                        </span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {(((s.portion ?? 0) * 100)).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  {!wheelModal.spinning && wheelModal.result && (
                    <div style={{ textAlign: "center" }}>
                      {wheelModal.result.outcome === "win" ? (
                        <>
                          <div style={{ fontSize: "40px" }}>
                            {wheelModal.result.prize?.icon}
                          </div>
                          <div
                            style={{
                              fontSize: "20px",
                              fontWeight: 800,
                              color: "#059669",
                              marginTop: "4px",
                            }}
                          >
                            🎉 {wheelModal.result.prize?.name} 당첨!
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            fontSize: "20px",
                            fontWeight: 800,
                            color: "#6b7280",
                            marginTop: "4px",
                          }}
                        >
                          😢 꽝! 다음 기회에...
                        </div>
                      )}
                      <button
                        onClick={closeWheelModal}
                        style={{
                          marginTop: "16px",
                          padding: "10px 28px",
                          borderRadius: "10px",
                          border: "none",
                          background: "#6366f1",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "15px",
                          cursor: "pointer",
                        }}
                      >
                        확인
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {useItemModal.isOpen && useItemModal.item && (
        <div
          className="myitems-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseUseItemModal();
          }}
        >
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>{useItemModal.item.displayInfo.name} 사용하기</h3>
              <button
                onClick={handleCloseUseItemModal}
                className="myitems-close-button"
              >
                ✕
              </button>
            </div>
            <div className="myitems-modal-body">
              <div className="form-group">
                <label htmlFor="useQuantity">
                  사용할 수량: (최대 {useItemModal.item.totalQuantity}개)
                </label>
                <div className="quantity-controls">
                  <button
                    onClick={() =>
                      setUseItemModal((prev) => ({
                        ...prev,
                        quantity: Math.max(1, prev.quantity - 1),
                      }))
                    }
                    disabled={useItemModal.quantity <= 1}
                  >
                    -
                  </button>
                  <input
                    id="useQuantity"
                    type="number"
                    min="1"
                    max={useItemModal.item.totalQuantity}
                    value={useItemModal.quantity}
                    onChange={(e) =>
                      setUseItemModal((prev) => ({
                        ...prev,
                        quantity: Math.max(
                          1,
                          Math.min(
                            prev.item.totalQuantity,
                            parseInt(e.target.value) || 1,
                          ),
                        ),
                      }))
                    }
                  />
                  <button
                    onClick={() =>
                      setUseItemModal((prev) => ({
                        ...prev,
                        quantity: Math.min(
                          prev.item.totalQuantity,
                          prev.quantity + 1,
                        ),
                      }))
                    }
                    disabled={
                      useItemModal.quantity >= useItemModal.item.totalQuantity
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button
                onClick={handleCloseUseItemModal}
                className="button-secondary"
              >
                취소
              </button>
              <button onClick={handleConfirmUseItem} className="button-primary">
                사용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {giftModal.isOpen && itemToGift && (
        <div
          className="myitems-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseGiftModal();
          }}
        >
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>{itemToGift.displayInfo.name || "아이템"} 선물하기</h3>
              <button
                onClick={handleCloseGiftModal}
                className="myitems-close-button"
              >
                ✕
              </button>
            </div>
            <div className="myitems-modal-body">
              <div className="form-group">
                <label htmlFor="giftRecipient">선물 받을 친구:</label>
                <select
                  id="giftRecipient"
                  value={giftRecipientUid}
                  onChange={(e) => setGiftRecipientUid(e.target.value)}
                  className="form-select"
                >
                  <option value="" disabled>
                    -- 친구를 선택하세요 --
                  </option>
                  {classmates.map((classmate) => (
                    <option
                      key={classmate.uid || classmate.id}
                      value={classmate.uid || classmate.id}
                    >
                      {classmate.name} ({classmate.nickname})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="giftQuantity">
                  선물할 수량: (최대 {itemToGift.totalQuantity}개)
                </label>
                <div className="quantity-controls">
                  <button
                    onClick={() =>
                      setGiftQuantity((prev) => Math.max(1, prev - 1))
                    }
                    disabled={giftQuantity <= 1}
                  >
                    -
                  </button>
                  <input
                    id="giftQuantity"
                    type="number"
                    min="1"
                    max={itemToGift.totalQuantity}
                    value={giftQuantity}
                    onChange={(e) =>
                      setGiftQuantity(
                        Math.max(
                          1,
                          Math.min(
                            itemToGift.totalQuantity,
                            parseInt(e.target.value) || 1,
                          ),
                        ),
                      )
                    }
                  />
                  <button
                    onClick={() =>
                      setGiftQuantity((prev) =>
                        Math.min(itemToGift.totalQuantity, prev + 1),
                      )
                    }
                    disabled={giftQuantity >= itemToGift.totalQuantity}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button
                onClick={handleCloseGiftModal}
                className="button-secondary"
              >
                취소
              </button>
              <button
                onClick={handleSendGift}
                className="button-primary"
                disabled={isGifting || isSyncing}
              >
                {isGifting
                  ? "선물하는 중..."
                  : isSyncing
                    ? "동기화 중..."
                    : "선물하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellToMarketModal.isOpen && sellToMarketModal.item && (
        <div
          className="myitems-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseSellToMarketModal();
          }}
        >
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>
                '{sellToMarketModal.item.displayInfo.name}' 시장에 판매하기
              </h3>
              <button
                onClick={handleCloseSellToMarketModal}
                className="myitems-close-button"
              >
                ✕
              </button>
            </div>
            <div className="myitems-modal-body">
              <div className="item-preview-simple">
                <span className="item-icon-small">
                  {sellToMarketModal.item.displayInfo.icon}
                </span>
                <span>
                  {sellToMarketModal.item.displayInfo.name} (보유:{" "}
                  {sellToMarketModal.item.totalQuantity}개)
                </span>
              </div>
              <div className="form-group">
                <label htmlFor="sellToMarketQuantity">
                  판매 수량 (최대: {sellToMarketModal.item.totalQuantity}개):
                </label>
                <input
                  type="number"
                  id="sellToMarketQuantity"
                  value={sellToMarketModal.quantity}
                  onChange={(e) =>
                    handleSellToMarketQuantityChange(e.target.value)
                  }
                  min="1"
                  max={sellToMarketModal.item.totalQuantity}
                />
              </div>
              <div className="form-group">
                <label htmlFor="sellToMarketPrice">개당 판매 가격 (원):</label>
                <input
                  type="number"
                  id="sellToMarketPrice"
                  value={sellToMarketModal.price}
                  onChange={(e) =>
                    handleSellToMarketPriceChange(e.target.value)
                  }
                  min="1"
                />
              </div>
              <div className="total-price-preview">
                예상 판매 총액:{" "}
                <strong>
                  {(
                    sellToMarketModal.price * sellToMarketModal.quantity
                  ).toLocaleString()}
                  원
                </strong>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button
                onClick={handleCloseSellToMarketModal}
                className="button-secondary"
              >
                취소
              </button>
              <button
                onClick={handleConfirmSellToMarket}
                className="button-primary sell-button"
                disabled={isSyncing || isListingToMarket}
              >
                {isSyncing ? "동기화 중..." : "판매 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💰 국고에 되팔기 모달 */}
      {sellToTreasuryModal.isOpen && sellToTreasuryModal.group && (
        <div
          className="myitems-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseSellToTreasuryModal();
          }}
        >
          <div className="myitems-modal-container">
            <div className="myitems-modal-header">
              <h3>
                '{sellToTreasuryModal.group.displayInfo.name}' 국고에 되팔기
              </h3>
              <button
                onClick={handleCloseSellToTreasuryModal}
                className="myitems-close-button"
                disabled={isSellingToTreasury}
              >
                ✕
              </button>
            </div>
            <div className="myitems-modal-body">
              <div className="item-preview-simple">
                <span className="item-icon-small">
                  {sellToTreasuryModal.group.displayInfo.icon}
                </span>
                <span>
                  {sellToTreasuryModal.group.displayInfo.name} (보유:{" "}
                  {sellToTreasuryModal.group.totalQuantity}개)
                </span>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  margin: "8px 0",
                }}
              >
                현재 상점가의 <strong>70%</strong> 가격으로 국고에 되팝니다.
                (단가{" "}
                <strong>
                  {getTreasuryBuyback(
                    sellToTreasuryModal.group,
                  ).unitPrice.toLocaleString()}
                  원
                </strong>
                )
              </p>
              <div className="form-group">
                <label htmlFor="sellToTreasuryQuantity">
                  되팔 수량 (최대: {sellToTreasuryModal.group.totalQuantity}개):
                </label>
                <input
                  type="number"
                  id="sellToTreasuryQuantity"
                  value={sellToTreasuryModal.quantity}
                  onChange={(e) =>
                    handleSellToTreasuryQuantityChange(e.target.value)
                  }
                  min="1"
                  max={sellToTreasuryModal.group.totalQuantity}
                  disabled={isSellingToTreasury}
                />
              </div>
              <div className="sell-total-preview">
                예상 수령액:{" "}
                <strong>
                  {(
                    getTreasuryBuyback(sellToTreasuryModal.group).unitPrice *
                    sellToTreasuryModal.quantity
                  ).toLocaleString()}
                  원
                </strong>
              </div>
            </div>
            <div className="myitems-modal-footer">
              <button
                onClick={handleCloseSellToTreasuryModal}
                className="button-secondary"
                disabled={isSellingToTreasury}
              >
                취소
              </button>
              <button
                onClick={handleConfirmSellToTreasury}
                className="button-primary sell-button"
                disabled={isSellingToTreasury}
              >
                {isSellingToTreasury ? "되파는 중..." : "국고에 팔기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(MyItems);
