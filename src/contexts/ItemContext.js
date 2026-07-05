import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "./AuthContext";
import { functions, httpsCallable, db } from "../firebase";
import { usePolling, POLLING_INTERVALS } from "../hooks/usePolling";
import { cachedFetch, invalidateCache as invalidateFetchCache } from "../utils/fetchCache";
import { logActivity, ACTIVITY_TYPES } from "../utils/firestoreHelpers";

import { logger } from "../utils/logger";
export const ItemContext = createContext(null);

export const useItems = () => {
  const context = useContext(ItemContext);
  if (!context) {
    // This fallback is for components that might render outside the provider.
    // It provides a safe, non-functional version of the context values.
    logger.warn("useItems: ItemContext 범위 밖에서 사용됨");
    return {
      items: [],
      userItems: [],
      marketListings: [],
      marketOffers: [],
      loading: true,
      error: null,
      addItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      purchaseItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      updateItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      deleteItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      useItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      updateUserItemQuantity: async () => ({
        success: false,
        message: "Context not available",
      }),
      listItemForSale: async () => ({
        success: false,
        message: "Context not available",
      }),
      buyMarketItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      cancelSale: async () => ({
        success: false,
        message: "Context not available",
      }),
      makeOffer: async () => ({
        success: false,
        message: "Context not available",
      }),
      respondToOffer: async () => ({
        success: false,
        message: "Context not available",
      }),
      adminCancelSale: async () => ({
        success: false,
        message: "Context not available",
      }),
      adminDeleteItem: async () => ({
        success: false,
        message: "Context not available",
      }),
      refreshData: async () => {},
    };
  }
  return context;
};

export const ItemProvider = ({ children }) => {
  const {
    user,
    userDoc,
    isAdmin: isAuthAdmin,
    loading: authLoading,
    deductCash,
    addCash,
    optimisticUpdate,
  } = useAuth() || {};
  const userId = user?.uid;
  const currentUserClassCode = userDoc?.classCode;

  // State for all economic data
  const [items, setItems] = useState([]);
  const [userItems, setUserItems] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [marketOffers, setMarketOffers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  // Unified loading state
  const loading = authLoading || dataLoading;

  // Memoized Firebase callables
  const getItemContextData = useMemo(
    () => httpsCallable(functions, "getItemContextData"),
    [],
  );
  const firebaseFunctions = useMemo(
    () => ({
      addStoreItem: httpsCallable(functions, "addStoreItem"),
      updateStoreItem: httpsCallable(functions, "updateStoreItem"),
      deleteStoreItem: httpsCallable(functions, "deleteStoreItem"),
      purchaseStoreItem: httpsCallable(functions, "purchaseStoreItem"),
      useUserItem: httpsCallable(functions, "useUserItem"),
      drawRandomItem: httpsCallable(functions, "drawRandomItem"),
      updateUserItemQuantity: httpsCallable(
        functions,
        "updateUserItemQuantity",
      ),
      listUserItemForSale: httpsCallable(functions, "listUserItemForSale"),
      sellItemToTreasury: httpsCallable(functions, "sellItemToTreasury"),
      buyMarketItem: httpsCallable(functions, "buyMarketItem"),
      cancelMarketSale: httpsCallable(functions, "cancelMarketSale"),
      makeOffer: httpsCallable(functions, "makeOffer"),
      respondToOffer: httpsCallable(functions, "respondToOffer"),
      adminCancelSale: httpsCallable(functions, "adminCancelSale"),
      adminDeleteItem: httpsCallable(functions, "adminDeleteItem"),
    }),
    [],
  );

  // Central data fetching function
  // 🔥 [읽기 절감 2단계] getItemContextData CF는 호출 1회당 서버에서 상점·인벤토리·마켓
  // 40~100문서를 읽는다(서버 읽기도 동일 과금). 데이터 획득부만 세션 캐시로 감싸
  // TTL(27분=폴링 30분×0.9) 내 재마운트/페이지 이동은 CF 호출 0회로 만든다.
  // setState(부수효과)는 캐시 히트 시에도 그대로 실행 — 화면 고착 없음.
  // 쓰기 후 refreshData()는 force로 항상 우회(신선도 UX 불변).
  const fetchData = useCallback(async (opts = {}) => {
    if (!userId || !currentUserClassCode) {
      setDataLoading(false);
      return;
    }
    const force = opts && opts.force === true;

    setDataLoading(true);
    try {
      const payload = await cachedFetch(
        `itemCtx:${currentUserClassCode}:${userId}`,
        27 * 60 * 1000,
        async () => {
          const result = await getItemContextData();
          if (!result.data.success) {
            // 실패 응답은 throw → 캐시에 기록되지 않음(다음 요청 재시도)
            throw new Error(
              result.data.message || "데이터를 불러오는데 실패했습니다.",
            );
          }
          return result.data.data;
        },
        // persist: CF 응답은 순수 JSON → sessionStorage 지속 안전. 새로고침 콜드 로드도 절감.
        { force, persist: true },
      );

      const {
        storeItems,
        userItems: groupedUserItems,
        marketListings,
        marketOffers,
      } = payload;
      setItems(storeItems || []);
      setUserItems(groupedUserItems || []);
      setMarketListings(marketListings || []);
      setMarketOffers(marketOffers || []);
      setError(null);
    } catch (err) {
      logger.error("[ItemContext] 데이터 로드 오류:", err);
      setError(err);
    } finally {
      setDataLoading(false);
    }
  }, [userId, currentUserClassCode, getItemContextData]);

  // Effect to fetch data when user is authenticated, now using polling
  // 🔥 [최적화] 아이템 데이터는 자주 변경되지 않으므로 10분 간격으로 변경 (읽기 비용 90% 절감)
  usePolling(fetchData, {
    interval: 30 * 60 * 1000, // 🔥 [최적화] 30분마다 자동 갱신 (10분에서 변경)
    enabled: !authLoading && !!userId && !!currentUserClassCode,
    deps: [authLoading, userId, currentUserClassCode],
  });

  // Public refresh function
  // 🔥 [읽기 절감 2단계] 쓰기 후 갱신 경로 — 반드시 캐시 우회(force)
  const refreshData = useCallback(() => {
    return fetchData({ force: true });
  }, [fetchData]);

  // 🔥 로컬 상태 즉시 업데이트 함수 (Firestore 읽기 없이)
  const updateLocalUserItems = useCallback((newUserItems) => {
    logger.log(
      "[ItemContext] 로컬 userItems 업데이트:",
      newUserItems?.length,
      "개",
    );
    setUserItems(newUserItems);
    // 🔥 [읽기 절감 2단계] 로컬 직접 갱신 경로(선물·사용 등)는 세션 캐시를 무효화해
    // 이전 스냅샷이 되살아나지 않게 한다(추가 읽기 0 — 다음 fetch만 신선본).
    if (userId && currentUserClassCode) {
      invalidateFetchCache(`itemCtx:${currentUserClassCode}:${userId}`);
    }
  }, [userId, currentUserClassCode]);

  // All context functions now use firebaseFunctions and refreshData
  const addItem = useCallback(
    async (newItemData) => {
      if (typeof isAuthAdmin !== "function" || !isAuthAdmin())
        return { success: false, message: "관리자 권한 필요" };

      // Optimistic Update: Add item to local state immediately
      const tempId = `temp_${Date.now()}`;
      const tempNewItem = { ...newItemData, id: tempId };
      setItems((prevItems) => [...prevItems, tempNewItem]);

      try {
        const token = await user?.getIdToken();
        if (!token) {
          throw new Error("인증 토큰을 가져올 수 없습니다.");
        }

        const functionUrl = `https://asia-northeast3-inconomysu-class.cloudfunctions.net/addStoreItem`;
        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: { newItemData } }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `서버 오류: ${response.status}`);
        }

        const result = await response.json();

        if (result.data.success) {
          // Success: Refresh data from server to get final item with correct ID
          await refreshData();
          return { success: true };
        } else {
          throw new Error(
            result.data.message || "알 수 없는 오류가 발생했습니다.",
          );
        }
      } catch (error) {
        // Rollback on error
        setItems((prevItems) => prevItems.filter((item) => item.id !== tempId));
        return { success: false, message: error.message };
      }
    },
    [isAuthAdmin, user, refreshData],
  );

  const updateItem = useCallback(
    async (itemId, updatesToApply) => {
      if (typeof isAuthAdmin !== "function" || !isAuthAdmin())
        return { success: false, message: "관리자 권한 필요" };
      try {
        await firebaseFunctions.updateStoreItem({ itemId, updatesToApply });
        refreshData();
        return { success: true };
      } catch (error) {
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 수정 함수(updateStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [isAuthAdmin, firebaseFunctions, refreshData],
  );

  const deleteItem = useCallback(
    async (itemId) => {
      if (typeof isAuthAdmin !== "function" || !isAuthAdmin())
        return { success: false, message: "관리자 권한 필요" };
      try {
        await firebaseFunctions.deleteStoreItem({ itemId });
        refreshData();
        return { success: true };
      } catch (error) {
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 삭제 함수(deleteStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [isAuthAdmin, firebaseFunctions, refreshData],
  );

  const purchaseItem = useCallback(
    async (itemId, quantity = 1) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      const itemToPurchase = items.find((item) => item.id === itemId);
      if (!itemToPurchase)
        return { success: false, message: "아이템을 찾을 수 없습니다." };

      const totalPrice = itemToPurchase.price * quantity;

      // 🔥 1. 현금 즉시 차감 (낙관적 업데이트)
      if (optimisticUpdate) {
        optimisticUpdate({ cash: -totalPrice });
      }

      // 🔥 2. userItems에 낙관적으로 추가
      const newUserItem = {
        id: `temp-${Date.now()}-${Math.random()}`, // 임시 ID
        itemId: itemToPurchase.id,
        name: itemToPurchase.name,
        icon: itemToPurchase.icon || "🔮",
        description: itemToPurchase.description || "",
        type: itemToPurchase.type || "general",
        quantity: quantity,
        price: itemToPurchase.price,
        durationMs: itemToPurchase.durationMs || 300000,
        purchasedAt: new Date(),
      };

      logger.log(
        "[ItemContext] 낙관적 업데이트: Store 아이템 추가",
        newUserItem,
      );

      // 기존 상태 백업 (롤백용)
      const originalUserItems = [...userItems];
      const originalStock = itemToPurchase.stock;
      const originalPrice = itemToPurchase.price;

      // 🔥 userItems에 즉시 추가
      setUserItems((prev) => {
        // 동일한 itemId가 있으면 수량 증가, 없으면 새로 추가
        const existingIndex = prev.findIndex(
          (item) => item.itemId === newUserItem.itemId,
        );
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
          };
          return updated;
        } else {
          return [...prev, newUserItem];
        }
      });

      try {
        const result = await firebaseFunctions.purchaseStoreItem({
          itemId,
          quantity,
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.data.success) {
          // 🎯 서버 응답에서 재고 보충 정보를 받아서 즉시 로컬 상태 업데이트
          const { restocked, newStock, newPrice } = result.data;

          logger.log("[ItemContext] 구매 성공:", {
            itemId,
            quantity,
            restocked,
            newStock,
            newPrice,
            oldPrice: originalPrice,
            oldStock: originalStock,
          });

          // 🔥 활동 로그 기록 (아이템 구매)
          logActivity(db, {
            classCode: currentUserClassCode,
            userId: userId,
            userName: userDoc?.name || "사용자",
            type: ACTIVITY_TYPES.ITEM_PURCHASE,
            description: `${itemToPurchase.name} ${quantity}개 구매 (${totalPrice.toLocaleString()}원)`,
            amount: -totalPrice,
            metadata: {
              itemId,
              itemName: itemToPurchase.name,
              quantity,
              pricePerItem: itemToPurchase.price,
              totalPrice,
            },
          });

          if (itemToPurchase.stock !== undefined) {
            setItems((prevItems) =>
              prevItems.map((item) => {
                if (item.id === itemId) {
                  return {
                    ...item,
                    stock: newStock,
                    price: newPrice,
                  };
                }
                return item;
              }),
            );
          }

          // 🎯 낙관적 업데이트의 임시 ID를 실제 inventory doc ID로 교체
          // purchaseStoreItem은 inventory doc ID = storeItems doc ID (itemId) 로 저장함
          setUserItems((prev) =>
            prev.map((item) => {
              if (item.itemId === itemId && item.id?.startsWith("temp-")) {
                return { ...item, id: itemId };
              }
              return item;
            }),
          );

          // 🔥 [읽기 절감 2단계] 구매 성공은 로컬 상태로 즉시 반영하되, 세션 캐시는
          // 무효화(구매 전 스냅샷이 탭복귀/재마운트에서 되살아나는 것 방지 — codex CRITICAL).
          // refreshData(CF 재호출) 대신 invalidate만 → 추가 읽기 0, 다음 fetch가 신선본.
          invalidateFetchCache(`itemCtx:${currentUserClassCode}:${userId}`);

          return { success: true, restocked, newStock, newPrice };
        } else {
          // 🔥 실패: 모든 변경사항 롤백
          logger.warn("[ItemContext] 구매 실패, 롤백 수행");
          if (optimisticUpdate) {
            optimisticUpdate({ cash: totalPrice });
          }
          setUserItems(originalUserItems);
          throw new Error(result.data.message || "구매에 실패했습니다.");
        }
      } catch (error) {
        // 🔥 에러: 모든 변경사항 롤백
        logger.error("[ItemContext] 구매 에러, 롤백 수행:", error);
        if (optimisticUpdate) {
          optimisticUpdate({ cash: totalPrice });
        }
        setUserItems(originalUserItems);

        // 에러 시에만 refreshData로 동기화
        refreshData();

        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 구매 함수(purchaseStoreItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [
      userId,
      firebaseFunctions,
      refreshData,
      items,
      userItems,
      optimisticUpdate,
      currentUserClassCode,
      userDoc,
    ],
  );

  const useItem = useCallback(
    async (inventoryItemId, quantity = 1) => {
      if (!userId) return { success: false, message: "로그인 필요" };

      // 🔥 아이템 정보를 먼저 저장 (Firebase 호출 전에)
      const itemToUse = userItems.find(
        (item) =>
          item.id === inventoryItemId || item.itemId === inventoryItemId,
      );
      const itemName = itemToUse?.name || itemToUse?.itemName || "아이템";

      // 🔥 낙관적 업데이트: userItems에서 수량 즉시 차감
      const originalUserItems = [...userItems];
      setUserItems((prev) => {
        return prev
          .map((item) => {
            if (
              item.id === inventoryItemId ||
              item.itemId === inventoryItemId
            ) {
              const newQuantity = item.quantity - quantity;
              if (newQuantity <= 0) return null; // 수량이 0 이하면 제거
              return { ...item, quantity: newQuantity };
            }
            return item;
          })
          .filter(Boolean);
      });

      try {
        await firebaseFunctions.useUserItem({
          itemId: inventoryItemId,
          quantityToUse: quantity,
          sourceCollection: "inventory",
        });

        // 🔥 활동 로그 기록 (아이템 사용)
        logActivity(db, {
          classCode: currentUserClassCode,
          userId: userId,
          userName: userDoc?.name || "사용자",
          type: ACTIVITY_TYPES.ITEM_USE,
          description: `${itemName} ${quantity}개 사용`,
          metadata: {
            itemId: inventoryItemId,
            itemName: itemName,
            quantity,
          },
        });

        refreshData();
        return { success: true };
      } catch (error) {
        // 🔥 에러: 낙관적 업데이트 롤백
        logger.error("[ItemContext] 아이템 사용 에러, 롤백 수행:", error);
        setUserItems(originalUserItems);
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 사용 함수(useUserItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [
      userId,
      userItems,
      currentUserClassCode,
      userDoc,
      firebaseFunctions,
      refreshData,
    ],
  );

  // 🎰 랜덤뽑기 사용: 서버에서 추첨/지급. 결과(돌림판 표시용 segments·winningIndex·prize) 반환.
  const drawRandomItem = useCallback(
    async (inventoryItemId) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      try {
        const res = await firebaseFunctions.drawRandomItem({
          itemId: inventoryItemId,
        });
        const data = res?.data || {};
        refreshData();
        return { success: true, ...data };
      } catch (error) {
        logger.error("[ItemContext] 랜덤뽑기 에러:", error);
        refreshData();
        return { success: false, message: error.message };
      }
    },
    [userId, firebaseFunctions, refreshData],
  );

  const listItemForSale = useCallback(
    async ({ itemId, quantity, price }) => {
      if (!userId) return { success: false, message: "로그인 필요" };

      // 🔥 아이템 정보를 먼저 저장 (Firebase 호출 전에)
      const itemToSell = userItems.find(
        (item) => item.id === itemId || item.itemId === itemId,
      );
      const itemName = itemToSell?.name || itemToSell?.itemName || "아이템";

      // 🔥 낙관적 업데이트: userItems에서 수량 즉시 차감
      const originalUserItems = [...userItems];
      setUserItems((prev) => {
        return prev
          .map((item) => {
            if (item.id === itemId || item.itemId === itemId) {
              const newQuantity = item.quantity - quantity;
              if (newQuantity <= 0) return null;
              return { ...item, quantity: newQuantity };
            }
            return item;
          })
          .filter(Boolean);
      });

      try {
        await firebaseFunctions.listUserItemForSale({
          inventoryItemId: itemId,
          quantity,
          price,
          sourceCollection: "inventory",
        });

        // 🔥 활동 로그 기록 (아이템 시장 등록)
        logActivity(db, {
          classCode: currentUserClassCode,
          userId: userId,
          userName: userDoc?.name || "사용자",
          type: ACTIVITY_TYPES.ITEM_MARKET_LIST,
          description: `${itemName} ${quantity}개 시장 등록 (${price.toLocaleString()}원)`,
          metadata: {
            itemId,
            itemName: itemName,
            quantity,
            price,
          },
        });

        refreshData();
        return { success: true };
      } catch (error) {
        // 🔥 에러: 낙관적 업데이트 롤백
        logger.error("[ItemContext] 시장 등록 에러, 롤백 수행:", error);
        setUserItems(originalUserItems);
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 판매 등록 함수(listUserItemForSale)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [
      userId,
      firebaseFunctions,
      refreshData,
      userItems,
      currentUserClassCode,
      userDoc,
    ],
  );

  const buyMarketItem = useCallback(
    async (listingId) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      const itemToBuy = marketListings.find((item) => item.id === listingId);
      if (!itemToBuy)
        return {
          success: false,
          message: "판매 목록에서 아이템을 찾을 수 없습니다.",
        };

      const itemPrice = itemToBuy.price || itemToBuy.totalPrice || 0;

      // 🔥 1. 현금 낙관적 차감
      const deductResult = await deductCash(
        itemPrice,
        `${itemToBuy.itemName} 구매`,
      );
      if (!deductResult) {
        return { success: false, message: "현금 차감에 실패했습니다." };
      }

      // 🔥 2. 낙관적 업데이트: 내 아이템에 추가
      const newUserItem = {
        id: `temp-${Date.now()}-${Math.random()}`, // 임시 ID
        itemId: itemToBuy.itemId || itemToBuy.id,
        name: itemToBuy.itemName,
        icon: itemToBuy.icon || "🔮",
        description: itemToBuy.description || "",
        type: itemToBuy.category || itemToBuy.itemType || "general",
        quantity: itemToBuy.quantity || 1,
        purchasedAt: new Date(),
      };

      logger.log("[ItemContext] 낙관적 업데이트: 아이템 추가", newUserItem);

      // 기존 상태 백업 (롤백용)
      const originalUserItems = [...userItems];
      const originalMarketListings = [...marketListings];

      // 🔥 userItems에 즉시 추가
      setUserItems((prev) => {
        // 동일한 itemId가 있으면 수량 증가, 없으면 새로 추가
        const existingIndex = prev.findIndex(
          (item) => item.itemId === newUserItem.itemId,
        );
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + newUserItem.quantity,
          };
          return updated;
        } else {
          return [...prev, newUserItem];
        }
      });

      // 🔥 marketListings에서 즉시 제거
      setMarketListings((prev) => prev.filter((item) => item.id !== listingId));

      try {
        const result = await firebaseFunctions.buyMarketItem({ listingId, idempotencyKey: crypto.randomUUID() });
        if (result.data.success) {
          logger.log("[ItemContext] 구매 성공, 서버 데이터로 동기화");

          // 🔥 활동 로그 기록 (아이템 시장 구매)
          logActivity(db, {
            classCode: currentUserClassCode,
            userId: userId,
            userName: userDoc?.name || "사용자",
            type: ACTIVITY_TYPES.ITEM_MARKET_BUY,
            description: `${itemToBuy.itemName} ${itemToBuy.quantity || 1}개 시장 구매 (${itemPrice.toLocaleString()}원)`,
            amount: -itemPrice,
            metadata: {
              listingId,
              itemName: itemToBuy.itemName,
              quantity: itemToBuy.quantity || 1,
              sellerId: itemToBuy.sellerId,
              sellerName: itemToBuy.sellerName,
              price: itemPrice,
            },
          });

          // 🎯 성공: refreshData로 정확한 데이터 동기화
          refreshData();
          return { success: true };
        } else {
          // 🔥 실패: 모든 변경사항 롤백
          logger.warn("[ItemContext] 구매 실패, 롤백 수행");
          await addCash(itemPrice, `${itemToBuy.itemName} 구매 실패 (롤백)`);
          setUserItems(originalUserItems);
          setMarketListings(originalMarketListings);
          throw new Error(result.data.message || "구매에 실패했습니다.");
        }
      } catch (error) {
        // 🔥 에러: 모든 변경사항 롤백
        logger.error("[ItemContext] 구매 에러, 롤백 수행:", error);
        await addCash(itemPrice, `${itemToBuy.itemName} 구매 실패 (롤백)`);
        setUserItems(originalUserItems);
        setMarketListings(originalMarketListings);

        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "구매 처리 함수(buyMarketItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [
      userId,
      firebaseFunctions,
      refreshData,
      marketListings,
      userItems,
      deductCash,
      addCash,
      currentUserClassCode,
      userDoc,
    ],
  );

  const cancelSale = useCallback(
    async (listingId) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      try {
        await firebaseFunctions.cancelMarketSale({ listingId });
        refreshData();
        return { success: true };
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "판매 취소 함수(cancelMarketSale)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [userId, firebaseFunctions, refreshData],
  );

  const makeOffer = useCallback(
    async ({ listingId, offerPrice, quantity = 1 }) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      try {
        const result = await firebaseFunctions.makeOffer({
          listingId,
          offerPrice,
          quantity,
        });
        refreshData();
        return { success: true, offerId: result.data.offerId };
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "가격 제안 함수(makeOffer)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [userId, firebaseFunctions, refreshData],
  );

  const respondToOffer = useCallback(
    async ({ offerId, response }) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      try {
        await firebaseFunctions.respondToOffer({ offerId, response, idempotencyKey: crypto.randomUUID() });
        refreshData();
        return { success: true };
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "제안 응답 함수(respondToOffer)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [userId, firebaseFunctions, refreshData],
  );

  const adminCancelSale = useCallback(
    async (listingId) => {
      if (typeof isAuthAdmin !== "function" || !isAuthAdmin())
        return { success: false, message: "관리자 권한 필요" };
      try {
        await firebaseFunctions.adminCancelSale({ listingId });
        refreshData();
        return { success: true };
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "관리자 판매 취소 함수(adminCancelSale)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [isAuthAdmin, firebaseFunctions, refreshData],
  );

  const adminDeleteItem = useCallback(
    async (listingId) => {
      if (typeof isAuthAdmin !== "function" || !isAuthAdmin())
        return { success: false, message: "관리자 권한 필요" };
      try {
        await firebaseFunctions.adminDeleteItem({ listingId });
        refreshData();
        return { success: true };
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "관리자 아이템 삭제 함수(adminDeleteItem)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [isAuthAdmin, firebaseFunctions, refreshData],
  );

  const updateUserItemQuantity = useCallback(
    async (itemId, quantityChange, sourceCollection = "inventory") => {
      if (!userId) return { success: false, message: "로그인 필요" };
      try {
        const result = await firebaseFunctions.updateUserItemQuantity({
          itemId,
          quantityChange,
          sourceCollection,
        });
        if (result.data.success) {
          refreshData();
          return { success: true };
        } else {
          throw new Error(
            result.data.message || "아이템 수량 업데이트에 실패했습니다.",
          );
        }
      } catch (error) {
        refreshData();
        if (error.code === "not-found") {
          return {
            success: false,
            message:
              "아이템 수량 업데이트 함수(updateUserItemQuantity)를 찾을 수 없습니다. 관리자에게 문의하세요.",
          };
        }
        return { success: false, message: error.message };
      }
    },
    [userId, firebaseFunctions, refreshData],
  );

  // 💰 국고에 되팔기: 현재 상점가 × 70% (서버가 시세·금액 결정). 낙관적 cash 증액 + 인벤토리 차감.
  const sellItemToTreasury = useCallback(
    async (itemId, quantity = 1) => {
      if (!userId) return { success: false, message: "로그인 필요" };
      if (!Number.isInteger(quantity) || quantity < 1) {
        return { success: false, message: "수량이 올바르지 않습니다." };
      }

      const itemInStore = items.find((it) => it.id === itemId);
      const itemName =
        itemInStore?.name ||
        userItems.find((u) => u.itemId === itemId || u.id === itemId)?.name ||
        "아이템";
      // 낙관적 표시용 추정 단가(서버가 최종 결정)
      const estUnit = itemInStore?.price
        ? Math.max(1, Math.round(itemInStore.price * 0.7))
        : 0;
      const estGain = estUnit * quantity;

      // 낙관적 업데이트: cash 증액 + 인벤토리 수량 차감 (실패 시 롤백)
      const originalUserItems = [...userItems];
      if (optimisticUpdate && estGain > 0) {
        optimisticUpdate({ cash: estGain });
      }
      setUserItems((prev) =>
        prev
          .map((item) => {
            if (item.itemId === itemId || item.id === itemId) {
              const newQuantity = (item.quantity || 0) - quantity;
              if (newQuantity <= 0) return null;
              return { ...item, quantity: newQuantity };
            }
            return item;
          })
          .filter(Boolean),
      );

      try {
        const res = await firebaseFunctions.sellItemToTreasury({
          itemId,
          quantity,
          idempotencyKey: crypto.randomUUID(),
        });
        const data = res.data || {};
        // 서버 확정 금액과 낙관적 추정의 차이를 보정
        if (optimisticUpdate) {
          const diff = (data.totalGain || 0) - (estGain > 0 ? estGain : 0);
          if (diff !== 0) optimisticUpdate({ cash: diff });
        }

        logActivity(db, {
          classCode: currentUserClassCode,
          userId,
          userName: userDoc?.name || "사용자",
          type: ACTIVITY_TYPES.ITEM_SELL,
          description: `${data.itemName || itemName} ${quantity}개 국고 되팔기 (${(data.totalGain || 0).toLocaleString()}원)`,
          amount: data.totalGain || 0,
          metadata: {
            itemId,
            itemName: data.itemName || itemName,
            quantity,
            unitPrice: data.unitPrice,
            totalGain: data.totalGain,
          },
        });

        refreshData();
        return { success: true, ...data };
      } catch (error) {
        // 롤백
        logger.error("[ItemContext] 국고 되팔기 실패, 롤백:", error);
        if (optimisticUpdate && estGain > 0) {
          optimisticUpdate({ cash: -estGain });
        }
        setUserItems(originalUserItems);
        refreshData();
        return { success: false, message: error.message };
      }
    },
    [
      userId,
      items,
      userItems,
      firebaseFunctions,
      optimisticUpdate,
      refreshData,
      currentUserClassCode,
      userDoc,
    ],
  );

  // Final context value
  const contextValue = useMemo(
    () => ({
      items,
      userItems,
      marketListings,
      marketOffers,
      loading,
      error,
      addItem,
      updateItem,
      deleteItem,
      purchaseItem,
      useItem,
      drawRandomItem,
      updateUserItemQuantity,
      listItemForSale,
      sellItemToTreasury,
      buyMarketItem,
      cancelSale,
      makeOffer,
      respondToOffer,
      adminCancelSale,
      adminDeleteItem,
      refreshData,
      updateLocalUserItems,
    }),
    [
      items,
      userItems,
      marketListings,
      marketOffers,
      loading,
      error,
      addItem,
      updateItem,
      deleteItem,
      purchaseItem,
      useItem,
      drawRandomItem,
      updateUserItemQuantity,
      listItemForSale,
      sellItemToTreasury,
      buyMarketItem,
      cancelSale,
      makeOffer,
      respondToOffer,
      adminCancelSale,
      adminDeleteItem,
      refreshData,
      updateLocalUserItems,
    ],
  );

  return (
    <ItemContext.Provider value={contextValue}>{children}</ItemContext.Provider>
  );
};
