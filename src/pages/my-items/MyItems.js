// src/pages/my-items/MyItems.js
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext";
import "./MyItems.css";
import LoginWarning from "../../components/LoginWarning";
import { useNavigate } from "react-router-dom";

import { logger } from "../../utils/logger";
// Firebase
import {
  db,
  firebaseDoc,
  collection,
  serverTimestamp,
  runTransaction,
  increment,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
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
    userItems,
    useItem,
    listItemForSale,
    refreshData,
    updateLocalUserItems,
  } = useItems() || {
    userItems: [],
    useItem: null,
    listItemForSale: null,
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

  const hasRecentlyUsedItems = Object.keys(recentlyUsedItems).length > 0;
  useEffect(() => {
    if (!hasRecentlyUsedItems) return;
    const timer = setInterval(() => {
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [sellToMarketModal, setSellToMarketModal] = useState({
    isOpen: false,
    item: null,
    quantity: 1,
    price: 0,
  });

  const handleOpenUseItemModal = (group) => {
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (!group || group.totalQuantity <= 0) {
      showNotification("error", "사용할 수 있는 아이템이 아닙니다.");
      return;
    }
    setUseItemModal({ isOpen: true, item: group, quantity: 1 });
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
    setGiftModal({ isOpen: true, item: group });
  };

  const handleCloseGiftModal = () => {
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
    const { item: group, quantity: quantityToUse } = useItemModal;
    if (!group || !quantityToUse || quantityToUse <= 0) {
      showNotification("error", "사용할 아이템 정보가 올바르지 않습니다.");
      return;
    }

    if (group.totalQuantity < quantityToUse) {
      showNotification("error", "보유 수량이 부족합니다.");
      return;
    }

    // 🔥 낙관적 업데이트: 즉시 성공 표시 + 모달 닫기 + 사용 중 아이템 등록
    showNotification(
      "success",
      `${group.displayInfo.name} ${quantityToUse}개를 사용했습니다.`,
    );
    handleCloseUseItemModal();

    setRecentlyUsedItems((prev) => ({
      ...prev,
      [group.displayInfo.itemId]: {
        usedTimestamp: Date.now(),
        itemDetails: {
          name: group.displayInfo.name,
          icon: group.displayInfo.icon,
          durationMs: group.displayInfo.durationMs || ITEM_DEFAULT_DURATION_MS,
        },
      },
    }));

    // 🔥 백그라운드에서 서버 호출 (useItem 내부에서 이미 낙관적 업데이트 수행)
    try {
      let remainingToUse = quantityToUse;

      const sortedDocs = [...group.sourceDocs].sort(
        (a, b) => a.quantity - b.quantity,
      );

      for (const doc of sortedDocs) {
        if (remainingToUse <= 0) break;

        const amountToUse = Math.min(doc.quantity, remainingToUse);

        // eslint-disable-next-line react-hooks/rules-of-hooks
        const result = await useItem(doc.id, amountToUse);

        if (!result.success) {
          throw new Error(
            result.message || `아이템 사용에 실패했습니다 (${doc.id})`,
          );
        }

        remainingToUse -= amountToUse;
      }

      if (remainingToUse > 0) {
        throw new Error(
          `요청한 수량을 모두 사용할 수 없습니다. (부족한 수량: ${remainingToUse})`,
        );
      }
    } catch (error) {
      // 🔥 서버 실패 시: 에러 알림 표시 + 사용 중 아이템 제거 (ItemContext에서 이미 롤백 처리)
      showNotification(
        "error",
        `아이템 사용 중 오류가 발생했습니다: ${error.message}`,
      );
      setRecentlyUsedItems((prev) => {
        const updated = { ...prev };
        delete updated[group.displayInfo.itemId];
        return updated;
      });
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
      logger.error("[MyItems] 선물 수량 오류:", {
        quantity,
        totalQuantity: group.totalQuantity,
      });
      showNotification("error", "선물 수량이 올바르지 않습니다.");
      return;
    }

    // 받는 사람 정보 찾기
    const recipient = classmates.find(
      (c) => (c.uid || c.id) === giftRecipientUid,
    );
    const recipientName = recipient ? recipient.name : "알 수 없는 사용자";

    logger.log("[MyItems] 선물 시작:", {
      아이템: group.displayInfo.name,
      수량: quantity,
      보내는사람: userDoc?.name || user.uid,
      받는사람: recipientName,
      받는사람UID: giftRecipientUid,
    });

    setIsGifting(true);
    let originalUserItems;
    try {
      // 🔥 디버깅: inventory 컬렉션 전체 조회
      const inventoryRef = collection(db, "users", user.uid, "inventory");
      const allInventoryDocs = await getDocs(inventoryRef);
      const actualDocs = allInventoryDocs.docs.map((doc) => ({
        id: doc.id,
        itemId: doc.data().itemId,
        name: doc.data().name,
        quantity: doc.data().quantity,
      }));

      logger.log("[MyItems] 🔍 실제 inventory 컬렉션 전체 조회:");
      logger.log("총문서수:", allInventoryDocs.size);
      logger.log("문서들:", actualDocs);

      // itemId로 그룹핑
      const itemIdGroups = {};
      actualDocs.forEach((doc) => {
        const key = doc.itemId || doc.id;
        if (!itemIdGroups[key]) itemIdGroups[key] = [];
        itemIdGroups[key].push(doc.id);
      });
      logger.log("[MyItems] itemId별 그룹:", itemIdGroups);

      // 🔥 보내는 사람의 실제 아이템 문서를 Firestore에서 다시 조회
      // group.sourceDocs에서 문서 ID 목록 가져오기
      const docIds = group.sourceDocs.map((doc) => doc.id);

      logger.log("[MyItems] 캐시된 문서 ID 목록:", docIds);

      // 각 문서 ID로 직접 조회 (getDoc 사용)
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
          logger.log("[MyItems] ✅ 문서 발견:", {
            id: docSnap.id,
            quantity: data.quantity,
          });
        } else {
          logger.warn("[MyItems] ⚠️ 문서 없음:", docId);
        }
      }

      logger.log("[MyItems] 보내는 사람 인벤토리 실제 조회 완료:", {
        캐시문서수: group.sourceDocs.length,
        실제문서수: actualSourceDocs.length,
        실제총수량: actualTotalQuantity,
      });

      if (actualSourceDocs.length === 0) {
        throw new Error(
          "보유 중인 아이템을 찾을 수 없습니다. 페이지를 새로고침해주세요.",
        );
      }

      if (actualTotalQuantity < quantity) {
        throw new Error(
          `아이템 수량이 부족합니다. (필요: ${quantity}, 실제 보유: ${actualTotalQuantity})`,
        );
      }

      // 🔥 받는 사람의 인벤토리 쿼리 (트랜잭션 외부에서 실행 - Firestore 제한사항)
      const recipientInventoryRef = collection(
        db,
        "users",
        giftRecipientUid,
        "inventory",
      );
      const recipientQuery = query(
        recipientInventoryRef,
        where("itemId", "==", group.displayInfo.itemId),
      );
      const recipientQuerySnapshot = await getDocs(recipientQuery);

      const recipientExistingDocRef = recipientQuerySnapshot.empty
        ? null
        : recipientQuerySnapshot.docs[0].ref;

      logger.log("[MyItems] 받는 사람 인벤토리 조회 (트랜잭션 외부):", {
        기존아이템존재: !recipientQuerySnapshot.empty,
        문서수: recipientQuerySnapshot.size,
      });

      originalUserItems = [...userItems];

      const updatedUserItems = [];
      let remainingToDeduct = quantity;

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

      // 🔥 트랜잭션: 모든 읽기를 먼저 수행하고, 그 다음 모든 쓰기를 수행
      await runTransaction(db, async (transaction) => {
        // ===== 1단계: 모든 읽기 작업 =====

        // 1-1. 보내는 사람의 아이템 문서들 읽기
        const senderItemSnaps = [];
        for (const senderDoc of actualSourceDocs) {
          const senderItemRef = firebaseDoc(
            db,
            "users",
            user.uid,
            "inventory",
            senderDoc.id,
          );
          const senderItemSnap = await transaction.get(senderItemRef);

          if (!senderItemSnap.exists()) {
            logger.error(
              "[MyItems] ❌ 트랜잭션 중 아이템 문서가 사라짐:",
              senderDoc.id,
            );
            throw new Error(
              "트랜잭션 중 아이템이 사라졌습니다. 다시 시도해주세요.",
            );
          }

          const currentQuantity = senderItemSnap.data().quantity || 0;
          if (currentQuantity <= 0) {
            logger.error(
              "[MyItems] ❌ 트랜잭션 중 아이템 수량이 0:",
              senderDoc.id,
            );
            throw new Error(
              "트랜잭션 중 아이템 수량이 변경되었습니다. 다시 시도해주세요.",
            );
          }

          senderItemSnaps.push({
            ref: senderItemRef,
            snap: senderItemSnap,
            quantity: currentQuantity,
          });
        }

        // 1-2. 받는 사람의 인벤토리 아이템 읽기 (트랜잭션 내부에서)
        let recipientItemRef = null;
        let recipientCurrentQuantity = 0;

        if (recipientExistingDocRef) {
          // 기존 아이템이 있는 경우, 트랜잭션 내에서 다시 읽기
          recipientItemRef = recipientExistingDocRef;
          const recipientSnap = await transaction.get(recipientItemRef);

          if (recipientSnap.exists()) {
            recipientCurrentQuantity = recipientSnap.data().quantity || 0;
            logger.log("[MyItems] 받는 사람 기존 아이템 발견:", {
              문서ID: recipientItemRef.id,
              현재수량: recipientCurrentQuantity,
            });
          } else {
            logger.warn(
              "[MyItems] ⚠️ 받는 사람의 기존 아이템이 사라짐, 새로 생성합니다.",
            );
            recipientItemRef = null;
          }
        } else {
          logger.log("[MyItems] 받는 사람에게 새 아이템 생성 예정");
        }

        // ===== 2단계: 모든 쓰기 작업 =====

        let remainingToSend = quantity;
        let processedAmount = 0;

        // 2-1. 보내는 사람의 아이템 차감
        for (const {
          ref: senderItemRef,
          quantity: currentQuantity,
        } of senderItemSnaps) {
          if (remainingToSend <= 0) break;

          const amountFromThisDoc = Math.min(currentQuantity, remainingToSend);
          const newSenderQty = currentQuantity - amountFromThisDoc;

          logger.log("[MyItems] 아이템 차감:", {
            문서ID: senderItemRef.id,
            기존수량: currentQuantity,
            차감수량: amountFromThisDoc,
            남은수량: newSenderQty,
          });

          if (newSenderQty <= 0) {
            transaction.delete(senderItemRef);
          } else {
            transaction.update(senderItemRef, { quantity: newSenderQty });
          }

          remainingToSend -= amountFromThisDoc;
          processedAmount += amountFromThisDoc;
        }

        // 실제로 처리된 수량 확인
        if (processedAmount < quantity) {
          logger.error("[MyItems] 처리된 수량 부족:", {
            요청: quantity,
            처리됨: processedAmount,
          });
          throw new Error(
            `아이템 수량이 부족합니다. (필요: ${quantity}, 실제 보유: ${processedAmount})`,
          );
        }

        // 2-2. 받는 사람에게 아이템 추가
        if (recipientItemRef) {
          // 기존 아이템에 수량 추가
          logger.log(
            "[MyItems] 받는 사람 아이템 업데이트 (기존 아이템에 추가):",
            {
              기존수량: recipientCurrentQuantity,
              추가수량: processedAmount,
              최종수량: recipientCurrentQuantity + processedAmount,
            },
          );
          transaction.update(recipientItemRef, {
            quantity: recipientCurrentQuantity + processedAmount,
            updatedAt: serverTimestamp(),
          });
        } else {
          // 새 아이템 생성
          logger.log("[MyItems] 받는 사람 아이템 생성 (새 아이템):", {
            수량: processedAmount,
          });
          const newRecipientItemRef = firebaseDoc(recipientInventoryRef);
          transaction.set(newRecipientItemRef, {
            itemId: group.displayInfo.itemId,
            name: group.displayInfo.name,
            icon: group.displayInfo.icon,
            description: group.displayInfo.description,
            type: group.displayInfo.type,
            quantity: processedAmount,
            receivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      logger.log("[MyItems] ✅ 선물 트랜잭션 완료");
      showNotification(
        "success",
        `${recipientName}님에게 ${group.displayInfo.name} ${quantity}개를 선물했습니다.`,
      );
      handleCloseGiftModal();

      setTimeout(() => {
        if (refreshData) refreshData();
      }, 2000);
    } catch (error) {
      logger.error("[MyItems] 선물하기 실패:", error);

      // 낙관적 업데이트 롤백
      if (updateLocalUserItems && originalUserItems) {
        logger.log("[MyItems] 낙관적 업데이트 롤백 - 원래 상태로 복원");
        updateLocalUserItems(originalUserItems);
      }

      // 데이터 동기화 후 에러 메시지 표시
      showNotification("error", `선물하기 실패: ${error.message}`);

      // 항상 데이터 새로고침
      if (refreshData) {
        logger.log("[MyItems] 데이터 새로고침 시작");
        try {
          const result = refreshData();
          if (result && typeof result.then === "function") {
            await result;
          }
          logger.log("[MyItems] 데이터 새로고침 완료");
        } catch (syncError) {
          logger.error("[MyItems] 데이터 새로고침 실패:", syncError);
        }
      }
    } finally {
      setIsGifting(false);
    }
  };

  const handleConfirmSellToMarket = async () => {
    const { item: group, quantity, price } = sellToMarketModal;
    if (!group || !quantity || !price) {
      showNotification("error", "판매 정보가 올바르지 않습니다.");
      return;
    }

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
              <div className="content-card-section">
                <h3 className="section-title">사용 중인 아이템</h3>
                <div className="items-grid">
                  {Object.entries(recentlyUsedItems).map(
                    ([itemId, itemData]) => (
                      <div
                        key={itemId}
                        className="store-item-card active-item-card"
                      >
                        <div className="item-content">
                          <div className="my-item-header">
                            <div className="item-icon-group">
                              <div className="item-icon">
                                {itemData.itemDetails.icon || "✨"}
                              </div>
                            </div>
                            <div className="item-info">
                              <h3 className="item-name">
                                {itemData.itemDetails.name}
                              </h3>
                              <p className="timer-text">
                                {formatTimeLeft(
                                  itemData.usedTimestamp,
                                  itemData.itemDetails.durationMs,
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="my-item-actions">
                            <button
                              className="stop-using-button"
                              onClick={() => handleRemoveUsedItem(itemId)}
                            >
                              사용 중지
                            </button>
                          </div>
                        </div>
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
                disabled={isSyncing}
              >
                {isSyncing ? "동기화 중..." : "판매 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(MyItems);
