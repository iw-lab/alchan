// src/ItemStore.js
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext"; // ItemContext가 classCode를 사용하도록 수정되어야 함
import "./ItemStore.css";
import "../admin/AdminPanel.css";
import LoginWarning from "../../components/LoginWarning";
import AdminItemPage from "../admin/AdminItemPage"; // AdminPanel 대신 AdminItemPage를 import 합니다.
import { logger } from "../../utils/logger";
import { formatKoreanCurrency } from "../../utils/numberFormatter";

const StockBadge = ({ stock, autoRestock }) => {
  if (stock === undefined || stock === null) return null;
  let badgeClass = "";
  if (stock <= 0) {
    badgeClass = autoRestock ? "stock-medium" : "stock-low";
  } else if (stock <= 3) {
    badgeClass = "stock-low";
  } else if (stock <= 5) {
    badgeClass = "stock-medium";
  } else {
    badgeClass = "stock-high";
  }
  const label =
    stock <= 0
      ? autoRestock
        ? "자동충전"
        : "품절"
      : `재고(${stock}개)`;
  return <span className={`stock-badge ${badgeClass}`}>{label}</span>;
};

const ItemStore = () => {
  const { user, userDoc, isAdmin } = useAuth() || {
    user: null,
    userDoc: null,
    isAdmin: () => false,
  };

  const {
    items,
    purchaseItem,
    deleteItem,
    updateItem,
    addItem,
    setAdminPriceIncrease,
    adminPriceIncreasePercentage,
  } = useItems() || {
    items: [],
    purchaseItem: null,
    updateItem: null,
    deleteItem: null,
    addItem: null,
    setAdminPriceIncrease: null,
    adminPriceIncreasePercentage: 10,
  };

  const [shopItems, setShopItems] = useState([]);
  const [notification, setNotification] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [priceIncreasePercentage, setPriceIncreasePercentage] = useState(
    adminPriceIncreasePercentage || 10,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [purchaseQuantities, setPurchaseQuantities] = useState({});
  const [loanBalance, setLoanBalance] = useState(0);

  const isCurrentUserAdmin = isAdmin();
  const currentUserClassCode = userDoc?.classCode; // 현재 사용자의 classCode

  // 사용자의 미상환 대출 합계 로드
  const loadLoanBalance = useCallback(async () => {
    if (!user?.uid) {
      setLoanBalance(0);
      return;
    }
    try {
      const productsRef = query(
        collection(db, "users", user.uid, "products"),
        limit(50),
      );
      const snap = await getDocs(productsRef);
      let total = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type === "loan") {
          total += Number(data.remainingPrincipal) || Number(data.balance) || 0;
        }
      });
      setLoanBalance(total);
    } catch (error) {
      logger.error("[ItemStore] 대출 잔액 로드 실패:", error);
      setLoanBalance(0);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadLoanBalance();
  }, [loadLoanBalance]);

  // 사용 가능 현금 = 보유 현금 - 미상환 대출금
  const rawCash = userDoc?.cash !== undefined ? userDoc.cash : user?.cash;
  const spendableCash = Math.max(0, (Number(rawCash) || 0) - loanBalance);

  useEffect(() => {
    if (items && Array.isArray(items)) {
      const itemsWithDefaults = items.map((item) => ({
        ...item,
        initialStock: item.initialStock ?? item.stock ?? 10,
      }));
      const availableItems = itemsWithDefaults.filter(
        (item) => item?.available !== false,
      );
      setShopItems(availableItems);

      const initialQuantities = {};
      availableItems.forEach((item) => {
        initialQuantities[item.id] = 1;
      });
      setPurchaseQuantities(initialQuantities);
    } else {
      setShopItems([]);
    }
  }, [items]);

  useEffect(() => {
    setPriceIncreasePercentage(adminPriceIncreasePercentage || 10);
  }, [adminPriceIncreasePercentage]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleEditItem = (item) => {
    setEditingItem({ ...item });
    setShowAdminPanel(true);
  };

  const handleDeleteConfirm = (item) => {
    setItemToDelete(item);
    setShowDeleteConfirm(true);
  };

  const handleDeleteItem = async () => {
    if (!deleteItem || !itemToDelete || !currentUserClassCode) {
      showNotification("error", "삭제 기능 오류 또는 학급 코드 없음");
      return;
    }
    try {
      await deleteItem(itemToDelete.id); // classCode는 서버에서 처리하므로 ID만 전달
      showNotification("success", `${itemToDelete.name} 삭제 완료`);
    } catch (error) {
      logger.error("아이템 삭제 중 오류:", error);
      showNotification("error", "아이템 삭제 중 오류가 발생했습니다.");
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handlePriceIncreaseChange = (value) => {
    const numericValue = parseInt(value, 10);
    if (isNaN(numericValue) || numericValue < 0) {
      showNotification("error", "가격 인상률은 0 이상의 숫자여야 합니다.");
      setPriceIncreasePercentage(adminPriceIncreasePercentage || 10);
      if (setAdminPriceIncrease)
        setAdminPriceIncrease(adminPriceIncreasePercentage || 10);
      return;
    }
    setPriceIncreasePercentage(numericValue);
    if (setAdminPriceIncrease) setAdminPriceIncrease(numericValue);
  };

  const handleQuantityChange = (itemId, value) => {
    const item = shopItems.find((item) => item.id === itemId);
    if (!item) return;
    let quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;
    const maxStock = item.stock <= 0 && item.initialStock > 0 ? item.initialStock : item.stock;
    if (quantity > maxStock) quantity = maxStock;
    setPurchaseQuantities((prev) => ({ ...prev, [itemId]: quantity }));
  };

  const handlePurchase = async (item) => {
    const canAutoRestock = item.initialStock > 0;
    if (!item || (item.stock <= 0 && !canAutoRestock)) return showNotification("error", "재고 없음");
    if (!user || !currentUserClassCode)
      return showNotification("error", "로그인 또는 학급 정보 필요");

    const quantity = purchaseQuantities[item.id] || 1;
    if (rawCash === undefined)
      return showNotification("error", "잔액 정보 오류");

    const totalPrice = item.price * quantity;

    // 대출금은 상점에서 사용 불가 — 미상환 대출 제외한 사용 가능 금액으로 체크
    if (spendableCash < totalPrice) {
      if (loanBalance > 0 && rawCash >= totalPrice) {
        return showNotification(
          "error",
          `대출금은 상점에서 사용할 수 없습니다. 미상환 ${loanBalance.toLocaleString()}원을 먼저 상환해주세요.`,
        );
      }
      return showNotification("error", "잔액 부족");
    }

    if (!purchaseItem) return showNotification("error", "구매 기능 오류");

    // 🔥 낙관적 업데이트: 즉시 성공 표시 + 재고 로컬 차감
    showNotification("success", `${item.name} ${quantity}개 구매 완료!`);
    setShopItems((prev) =>
      prev.map((shopItem) =>
        shopItem.id === item.id
          ? { ...shopItem, stock: Math.max(0, shopItem.stock - quantity) }
          : shopItem,
      ),
    );
    setPurchaseQuantities((prev) => ({ ...prev, [item.id]: 1 }));

    // 🔥 백그라운드에서 서버 확인 (purchaseItem 내부에서 이미 cash/userItems 낙관적 처리)
    try {
      const purchaseResult = await purchaseItem(item.id, quantity);

      if (!purchaseResult.success) {
        // 서버 실패 시: 재고 복원 + 에러 알림
        setShopItems((prev) =>
          prev.map((shopItem) =>
            shopItem.id === item.id
              ? { ...shopItem, stock: item.stock }
              : shopItem,
          ),
        );
        showNotification(
          "error",
          purchaseResult.message || "구매에 실패했습니다. 다시 시도해 주세요.",
        );
      }
    } catch (error) {
      // 서버 에러 시: 재고 복원 + 에러 알림
      logger.error("구매 처리 중 오류:", error);
      setShopItems((prev) =>
        prev.map((shopItem) =>
          shopItem.id === item.id
            ? { ...shopItem, stock: item.stock }
            : shopItem,
        ),
      );
      showNotification(
        "error",
        error.message || "구매 중 문제가 발생했습니다.",
      );
    }
  };

  const handleAddItemViaAdminPanel = async (newItemData) => {
    if (!addItem || !currentUserClassCode) {
      showNotification(
        "error",
        "아이템 추가 기능 사용 불가 또는 학급 코드 없음",
      );
      return false;
    }
    try {
      // addItem 함수는 newItemData 객체 하나만 받도록 ItemContext에서 처리
      const result = await addItem(newItemData);
      if (result.success) {
        showNotification("success", `${newItemData.name} 추가 완료`);
        return true;
      }
      showNotification("error", result.message || "아이템 추가 실패");
      return false;
    } catch (error) {
      logger.error("아이템 추가 중 오류:", error);
      showNotification("error", "아이템 추가 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleUpdateItemViaAdminPanel = async (updatedItemData) => {
    if (!updateItem || !currentUserClassCode) {
      showNotification(
        "error",
        "아이템 업데이트 기능 사용 불가 또는 학급 코드 없음",
      );
      return false;
    }
    try {
      // [수정] 객체에서 ID와 나머지 업데이트 내용을 분리
      const { id: itemId, ...updatesToApply } = updatedItemData;

      if (!itemId) {
        showNotification("error", "업데이트할 아이템의 ID가 없습니다.");
        return false;
      }

      // [수정] updateItem 함수에 (itemId, updatesToApply) 두 개의 인자로 전달
      const result = await updateItem(itemId, updatesToApply);

      if (result.success) {
        showNotification("success", `${updatedItemData.name} 업데이트 완료`);
        return true;
      }
      showNotification("error", result.message || "아이템 업데이트 실패");
      return false;
    } catch (error) {
      logger.error("아이템 업데이트 중 오류:", error);
      showNotification("error", "아이템 업데이트 중 오류가 발생했습니다.");
      return false;
    }
  };

  const getButtonText = (item) => {
    if (item.stock <= 0 && !(item.initialStock > 0)) return "품절";
    const quantity = purchaseQuantities[item.id] || 1;
    const totalPrice = item.price * quantity;
    if (user && rawCash !== undefined && spendableCash < totalPrice) {
      if (loanBalance > 0 && rawCash >= totalPrice) return "대출금 제외";
      return "잔액 부족";
    }
    return "구매하기";
  };

  const canOpenAdminPanel = isCurrentUserAdmin && currentUserClassCode;

  return (
    <div
      className={`page-container ${
        showAdminPanel && canOpenAdminPanel ? "admin-mode" : ""
      }`}
    >
      <div className="page-header-container">
        <h2 className="page-title">
          {showAdminPanel && canOpenAdminPanel
            ? "관리자 페이지"
            : "아이템 상점"}
        </h2>
        {isCurrentUserAdmin && (
          <button
            onClick={() => {
              if (!currentUserClassCode) {
                showNotification(
                  "error",
                  "관리자의 학급 코드가 없어 관리자 패널을 열 수 없습니다.",
                );
                return;
              }
              setShowAdminPanel((prev) => !prev);
              if (showAdminPanel) setEditingItem(null);
            }}
            className="admin-icon-button"
            title={showAdminPanel ? "상점 보기" : "아이템 상점 설정"}
          >
            {showAdminPanel && canOpenAdminPanel
              ? "🛒 상점 보기"
              : "⚙️ 아이템 상점 설정"}
          </button>
        )}
      </div>

      {notification && (
        <div
          className={`notification ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : notification.type === "error"
                ? "bg-red-100 text-red-800"
                : "bg-blue-100 text-blue-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      {showDeleteConfirm && canOpenAdminPanel && (
        <div className="delete-confirm-modal">
          <div className="delete-confirm-content">
            <h3>아이템 삭제 확인</h3>
            <p>
              <strong>{itemToDelete?.name}</strong> 아이템을 정말
              삭제하시겠습니까? <br />이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="delete-confirm-buttons">
              <button
                onClick={handleDeleteItem}
                className="delete-confirm-button"
              >
                삭제
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="delete-cancel-button"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && canOpenAdminPanel ? (
        <div className="admin-panel-full-container">
          <AdminItemPage
            classCode={currentUserClassCode}
            editingItemFromStore={editingItem}
            onAddItem={handleAddItemViaAdminPanel}
            onUpdateItem={handleUpdateItemViaAdminPanel}
            onClose={() => {
              setShowAdminPanel(false);
              setEditingItem(null);
            }}
          />
        </div>
      ) : (
        <>
          {!user && <LoginWarning />}
          {user &&
            (!currentUserClassCode ? (
              <div
                className="empty-message"
                style={{ padding: "20px", textAlign: "center", color: "red" }}
              >
                학급 코드 정보가 없어 상점 기능을 이용할 수 없습니다. 관리자에게
                문의하세요.
              </div>
            ) : shopItems.length > 0 ? (
              <div className="shop-content">
                <div className="content-card-section">
                  <h3 className="section-title">판매 아이템</h3>
                  <div className="items-grid">
                    {shopItems.map((item) => (
                      <div
                        key={item.id}
                        className="store-item-card shop-item-card compact-card"
                      >
                        <div className="item-content">
                          <div className="item-header-compact">
                            <h3 className="item-name-compact">{item.name}</h3>
                            <StockBadge stock={item.stock} autoRestock={item.initialStock > 0} />
                          </div>
                          {item.description && item.description.trim() && (
                            <p className="item-description-compact">
                              {item.description}
                            </p>
                          )}
                          <div
                            className={`item-actions-primary ${
                              isMobile ? "flex-col" : ""
                            }`}
                          >
                            <span className="item-price">
                              {formatKoreanCurrency(item.price || 0)}
                            </span>
                            <div className="quantity-and-buy-container">
                              <input
                                type="number"
                                min="1"
                                max={item.stock <= 0 && item.initialStock > 0 ? item.initialStock : item.stock}
                                value={purchaseQuantities[item.id] || 1}
                                onChange={(e) =>
                                  handleQuantityChange(item.id, e.target.value)
                                }
                                className="quantity-input"
                                disabled={item.stock <= 0 && !(item.initialStock > 0)}
                              />
                              <button
                                onClick={() => handlePurchase(item)}
                                className={`buy-item-button ${
                                  isMobile ? "w-full" : ""
                                }`}
                                disabled={
                                  !user ||
                                  (item.stock <= 0 && !(item.initialStock > 0)) ||
                                  spendableCash <
                                    item.price *
                                      (purchaseQuantities[item.id] || 1)
                                }
                              >
                                {getButtonText(item)}
                              </button>
                            </div>
                          </div>
                          {isCurrentUserAdmin && currentUserClassCode && (
                            <div className="item-actions-admin">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="edit-item-button"
                                title="아이템 수정"
                              >
                                수정
                                <span className="admin-button-icon">✏️</span>
                              </button>
                              <button
                                onClick={() => handleDeleteConfirm(item)}
                                className="delete-item-button"
                                title="아이템 삭제"
                              >
                                삭제
                                <span className="admin-button-icon">🗑️</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="empty-message"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <p>판매 중인 아이템이 없습니다.</p>
                {isCurrentUserAdmin && currentUserClassCode && (
                  <p>관리자 기능을 통해 아이템을 추가할 수 있습니다.</p>
                )}
              </div>
            ))}
        </>
      )}
    </div>
  );
};

export default ItemStore;
