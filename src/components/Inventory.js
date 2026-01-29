// src/Inventory.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./App";
import { useItems } from "./contexts/ItemContext";
import ItemCard from "./ItemCard";
import LoginWarning from "./LoginWarning";
import "../styles.css";

const Inventory = () => {
  const { user } = useAuth() || {};
  const { getUserItems, useItem } = useItems() || {
    getUserItems: () => [],
    useItem: null,
  };

  const [userInventoryItems, setUserInventoryItems] = useState([]);
  const [notification, setNotification] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // "grid" 또는 "list"

  // 인벤토리 아이템 업데이트
  useEffect(() => {
    if (user && getUserItems) {
      const inventoryItems = getUserItems();
      setUserInventoryItems(inventoryItems);
    } else {
      setUserInventoryItems([]);
    }
  }, [user, getUserItems]);

  // 알림 표시 함수
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // 아이템 사용 핸들러
  const handleUseItem = (item) => {
    if (!item || !useItem) return;

    const success = useItem(item.id);

    if (success) {
      showNotification("success", `${item.name} 아이템을 사용했습니다!`);
      // 인벤토리 즉시 업데이트를 위해 다시 가져오기
      if (getUserItems) {
        const updatedItems = getUserItems();
        setUserInventoryItems(updatedItems);
      }
    } else {
      showNotification("error", `${item.name} 아이템 사용에 실패했습니다.`);
    }
  };

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">내 인벤토리</h2>

        {/* 보기 모드 전환 버튼 */}
        <div className="view-toggle">
          <button
            onClick={() => setViewMode("grid")}
            className={`tab-button ${viewMode === "grid" ? "active" : ""}`}
          >
            그리드 보기
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`tab-button ${viewMode === "list" ? "active" : ""}`}
          >
            리스트 보기
          </button>
        </div>
      </div>

      {/* 알림 영역 */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* 로그인 경고 */}
      {!user && <LoginWarning />}

      {/* 인벤토리 컨텐츠 */}
      {user && (
        <div className="content-card-section">
          <h3 className="section-title">보유 아이템</h3>

          {userInventoryItems.length > 0 ? (
            <div className={viewMode === "grid" ? "items-grid" : ""}>
              {userInventoryItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  showStock={false}
                  showQuantity={true}
                  compact={viewMode === "list"}
                  actionButton={
                    <button
                      onClick={() => handleUseItem(item)}
                      className="use-button"
                      disabled={item.quantity <= 0}
                    >
                      사용
                    </button>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-message">
              보유한 아이템이 없습니다. 상점에서 아이템을 구매해보세요!
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Inventory;
