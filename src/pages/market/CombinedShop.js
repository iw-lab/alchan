// src/CombinedShop.js
import React, { useState, useEffect } from "react";
import { useAuth } from "./App"; // 가정: useAuth는 App.js 또는 AuthContext.js에서 export됨
import { useItems } from "../../contexts/ItemContext"; // 가정: useItems는 ItemContext.js에서 export됨
import "./styles.css"; // 가정: 해당 CSS 파일이 있음
import LoginWarning from "../../LoginWarning"; // 가정: 해당 컴포넌트가 있음

// --- 아이콘 목록 ---
const iconOptions = [
  "🍎",
  "🍊",
  "🍋",
  "🍌",

  "🥒", // 채소
  "🌶️",
  "🌽",
  "🥕",
  "🧄",
  "🧅",
  "🥔",
  "🍠",
  "🥐",
  "🥯",
  "🍞", // 음식
  "🥖",
  "🥨",
  "🧀",
  "🥚",
  "🍳",
  "🧈",
  "🥞",
  "🧇",
  "🥓",
  "🥩", // 음식
  "🍗",
  "🍖",
  "🦴",
  "🌭",
  "🍔",
  "🍟",
  "🍕",
  "🥪",
  "🥙",
  "🧆", // 음식
  "🌮",
  "🌯",
  "🥗",
  "🥘",
  "🥫",
  "🍝",
  "🍜",
  "🍲",
  "🍛",
  "🍣", // 음식
  "🍱",
  "🥟",
  "🍤",
  "🍙",
  "🍚",
  "🍘",
  "🍥",
  "🥠",
  "🥮",
  "🍢", // 음식
  "🍡",
  "🍧",
  "🍨",
  "🍦",
  "🥧",
  "🧁",
  "🍰",
  "🎂",
  "🍮",
  "🍭", // 디저트
  "🍬",
  "🍫",
  "🍿",
  "🍩",
  "🍪",
  "🌰",
  "🥜",
  "🍯",
  "🥛",
  "🍼", // 디저트/음료
  "☕",
  "🍵",
  "🧃",
  "🥤",
  "🍶",
  "🍺",
  "🍻",
  "🥂",
  "🍷",
  "🥃", // 음료
  "🍸",
  "🍹",
  "🧉",
  "🍾",
  "🧊",
  "🥄",
  "🍴",
  "🍽️",
  "🥣",
  "🥡", // 주방/기타
  "⚽",
  "🏀",
  "🏈",
  "⚾",
  "🥎",
  "🎾",
  "🏐",
  "🏉",
  "🎱",
  "🥏", // 스포츠
  "🎳",
  "🏏",
  "🏑",
  "🏒",
  "🥍",
  "🏹",
  "🎣",
  "🥊",
  "🥋",
  "🥅", // 스포츠
  "⛳",
  "⛸️",
  "🛷",
  "🎿",
  "🎮",
  "🕹️",
  "🎲",
  "🧩",
  "🧸",
  "🎯", // 놀이
  "🎨",
  "🪙",
  "💎",
  "💍",
  "👑",
  "💡",
  "💊",
  "🧪",
  "🔭",
  "🔑", // 아이템/도구
  "🛡️",
  "⚔️",
  "📜",
  "✨",
  "⭐",
  "🔥",
  "💧",
  "⚡",
  "💨",
  "🍀", // 마법/효과
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💔", // 하트
  "💯",
  "💰",
  "📈",
  "📉",
  "🆕",
  "🆓",
  "🎁",
  "🎉",
  "🔔",
  "⚙️", // 기타
];

// --- 관리자 아이템 추가/수정 폼 컴포넌트 ---
const AdminItemForm = ({
  onAddItem,
  onUpdateItem, // 아이템 업데이트 핸들러 추가
  priceIncreasePercentage,
  onPriceIncreaseChange,
  editingItem, // 수정 중인 아이템 데이터 추가
  onCancelEdit, // 수정 취소 핸들러 추가
}) => {
  const [itemName, setItemName] = useState("");
  const [itemEffect, setItemEffect] = useState("");
  const [itemPrice, setItemPrice] = useState(0);
  const [initialStock, setInitialStock] = useState(10);
  const [itemIcon, setItemIcon] = useState(iconOptions[0]); // 아이콘 상태 추가, 기본값 설정

  // 수정 모드일 때 폼 필드 채우기
  useEffect(() => {
    if (editingItem) {
      setItemName(editingItem.name);
      setItemEffect(editingItem.description);
      setItemPrice(editingItem.price);
      setInitialStock(editingItem.initialStock ?? editingItem.stock ?? 10); // 초기 재고 또는 현재 재고 사용
      setItemIcon(editingItem.icon || iconOptions[0]); // 기존 아이콘 또는 기본값
    } else {
      // 추가 모드일 때 폼 초기화
      resetForm();
    }
  }, [editingItem]);

  // 폼 초기화 함수
  const resetForm = () => {
    setItemName("");
    setItemEffect("");
    setItemPrice(0);
    setInitialStock(10);
    setItemIcon(iconOptions[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!itemName || itemPrice <= 0 || initialStock <= 0) {
      alert(
        "아이템 이름, 가격(0보다 커야 함), 초기 재고(0보다 커야 함)를 올바르게 입력하세요."
      );
      return;
    }

    const itemData = {
      name: itemName,
      description: itemEffect,
      price: parseInt(itemPrice, 10),
      initialStock: parseInt(initialStock, 10),
      stock: editingItem ? editingItem.stock : parseInt(initialStock, 10), // 수정 시 기존 재고 유지, 추가 시 초기 재고
      available: editingItem ? editingItem.available : true, // 수정 시 기존 상태 유지, 추가 시 true
      icon: itemIcon, // 선택된 아이콘 포함
    };

    if (editingItem) {
      // 수정 모드
      onUpdateItem({ ...itemData, id: editingItem.id }); // ID 포함하여 업데이트 핸들러 호출
    } else {
      // 추가 모드
      onAddItem(itemData); // 추가 핸들러 호출
    }
    // 폼 초기화는 부모 컴포넌트에서 처리 (상태 변경 후)
    // resetForm(); // 여기서 리셋하면 상태 업데이트 전에 리셋될 수 있음
    // onCancelEdit(); // 수정/추가 성공 시 패널 닫기 및 상태 초기화는 부모에서 처리
  };

  return (
    <div className="admin-panel content-card-section mb-6">
      <h3 className="section-title">
        {editingItem
          ? "관리자 패널: 아이템 수정"
          : "관리자 패널: 아이템 추가 및 설정"}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 아이템 이름 입력 */}
        <div>
          <label htmlFor="itemName">아이템 이름:</label>
          <input
            type="text"
            id="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
        </div>
        {/* 아이템 효과(설명) 입력 */}
        <div>
          <label htmlFor="itemEffect">아이템 효과 (설명):</label>
          <input
            type="text"
            id="itemEffect"
            value={itemEffect}
            onChange={(e) => setItemEffect(e.target.value)}
          />
        </div>
        {/* 가격 입력 */}
        <div>
          <label htmlFor="itemPrice">가격 (원):</label>
          <input
            type="number"
            id="itemPrice"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            required
            min="1"
          />
        </div>
        {/* 초기 재고 입력 */}
        <div>
          {/* 레이블 수정: editingItem 상태에 따라 레이블 변경 */}
          <label htmlFor="initialStock">
            {editingItem ? "현재 재고:" : "초기 재고:"}
          </label>
          <input
            type="number"
            id="initialStock"
            value={initialStock}
            // 수정 시에는 stock 값을 변경하도록 핸들러 분리 또는 조건 처리 필요
            // 여기서는 initialStock 상태를 사용하므로, 수정 시 실제 stock을 반영하는 로직 필요
            // 간단하게 하기 위해 initialStock 상태를 재고 설정으로 사용
            onChange={(e) => setInitialStock(e.target.value)}
            required
            min="0" // 재고는 0이 될 수 있음
          />
        </div>
        {/* 아이콘 선택 추가 */}
        <div>
          <label htmlFor="itemIcon">아이콘 선택:</label>
          <select
            id="itemIcon"
            value={itemIcon}
            onChange={(e) => setItemIcon(e.target.value)}
            className="icon-select" // 스타일링을 위한 클래스 추가
          >
            {iconOptions.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
        </div>
        {/* 가격 상승률 설정 */}
        {/* 가격 상승률 설정은 아이템 개별 설정이 아닌 전역 설정일 수 있으므로, 위치 재고 필요 */}
        {/* 여기서는 AdminItemForm에 유지 */}
        {!editingItem && ( // 아이템 추가 시에만 표시 (또는 전역 설정 UI로 이동)
          <div>
            <label htmlFor="priceIncrease">재고 소진 시 가격 상승률 (%):</label>
            <input
              type="number"
              id="priceIncrease"
              value={priceIncreasePercentage}
              onChange={(e) =>
                onPriceIncreaseChange(parseInt(e.target.value, 10) || 0)
              }
              min="0"
            />
          </div>
        )}
        <div className="admin-form-buttons">
          {" "}
          {/* 버튼 그룹핑 */}
          <button type="submit" className="admin-action-button">
            {editingItem ? "아이템 수정" : "아이템 추가"}
          </button>
          {editingItem && ( // 수정 모드일 때만 취소 버튼 표시
            <button
              type="button"
              onClick={onCancelEdit} // 취소 핸들러 호출
              className="admin-cancel-button"
            >
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

// --- 메인 상점 및 인벤토리 컴포넌트 ---
const CombinedShop = () => {
  const { user, deductCash } = useAuth() || {}; // useAuth 훅 사용 및 기본값 설정
  const {
    items,
    purchaseItem,
    getUserItems, // 인벤토리 표시에 사용될 수 있음
    addItem,
    updateItem, // updateItem 함수 가져오기
  } = useItems() || {
    // useItems 훅 사용 및 기본값 설정
    items: [],
    purchaseItem: null,
    getUserItems: () => [],
    addItem: null,
    updateItem: null,
  };

  const [shopItems, setShopItems] = useState([]);
  const [notification, setNotification] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [priceIncreasePercentage, setPriceIncreasePercentage] = useState(10); // 전역 가격 상승률 상태
  const [editingItem, setEditingItem] = useState(null); // 수정 중인 아이템 상태 추가

  // 아이템 목록 초기화 및 업데이트
  useEffect(() => {
    if (items && Array.isArray(items)) {
      const itemsWithDefaults = items.map((item) => ({
        ...item,
        initialStock: item.initialStock ?? item.stock ?? 10,
        icon: item.icon || "🆕", // 아이콘 기본값 설정
      }));
      // available 속성이 false가 아닌 아이템만 필터링
      const availableItems = itemsWithDefaults.filter(
        (item) => item?.available !== false
      );
      setShopItems(availableItems);
    } else {
      setShopItems([]); // items가 없거나 배열이 아니면 빈 배열로 초기화
    }
  }, [items]); // items 배열이 변경될 때마다 실행

  // 알림 표시 함수
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000); // 3초 후 알림 숨기기
  };

  // 아이템 추가 핸들러
  const handleAddItem = (newItemData) => {
    if (!addItem) {
      console.error("addItem 함수를 ItemContext에서 찾을 수 없습니다.");
      showNotification("error", "아이템 추가 기능을 사용할 수 없습니다.");
      return;
    }
    // ItemContext의 addItem 함수 호출
    addItem(newItemData);
    showNotification("success", `${newItemData.name} 아이템이 추가되었습니다.`);
    setEditingItem(null); // 추가 후 수정 상태 초기화
    setShowAdminPanel(false); // 추가 후 패널 닫기
  };

  // 아이템 수정 핸들러
  const handleUpdateItem = (updatedItemData) => {
    if (!updateItem) {
      console.error("updateItem 함수를 ItemContext에서 찾을 수 없습니다.");
      showNotification("error", "아이템 수정 기능을 사용할 수 없습니다.");
      return;
    }
    // ItemContext의 updateItem 함수 호출
    updateItem(updatedItemData.id, updatedItemData);
    showNotification(
      "success",
      `${updatedItemData.name} 아이템이 수정되었습니다.`
    );
    setEditingItem(null); // 수정 상태 종료
    setShowAdminPanel(false); // 수정 후 패널 닫기
  };

  // 아이템 카드 '수정' 버튼 클릭 핸들러
  const handleEditItem = (item) => {
    setEditingItem(item); // 수정할 아이템 설정
    setShowAdminPanel(true); // 관리자 패널 열기
  };

  // 관리자 패널 '취소' 버튼 클릭 핸들러
  const handleCancelEdit = () => {
    setEditingItem(null); // 수정 상태 초기화
    setShowAdminPanel(false); // 관리자 패널 닫기
  };

  // 가격 상승률 변경 핸들러
  const handlePriceIncreaseChange = (percentage) => {
    setPriceIncreasePercentage(percentage);
    // 필요하다면 이 설정을 저장하는 로직 추가 (예: Context 또는 localStorage)
  };

  // 아이템 구매 핸들러
  const handlePurchase = (item) => {
    if (!item) return; // 아이템 없으면 종료

    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (typeof user.cash === "undefined") {
      showNotification("error", "잔액 정보를 불러올 수 없습니다.");
      return;
    }
    if (user.cash < item.price) {
      showNotification("error", "잔액이 부족합니다.");
      return;
    }
    if (item.stock <= 0) {
      showNotification("error", "아이템 재고가 없습니다.");
      return;
    }
    // 필수 함수 확인
    if (!deductCash || !purchaseItem) {
      showNotification("error", "구매 처리 중 오류가 발생했습니다.");
      return;
    }

    // 1. 캐시 차감 시도
    const deductSuccess = deductCash(item.price);

    if (deductSuccess) {
      // 2. 캐시 차감 성공 시 아이템 구매 처리 (재고 감소 및 가격 업데이트 등)
      // purchaseItem 호출 시 priceIncreasePercentage 전달
      const purchaseSuccess = purchaseItem(item.id, priceIncreasePercentage);

      if (purchaseSuccess) {
        showNotification("success", `${item.name} 아이템을 구매했습니다!`);
        // 구매 성공 후 추가 작업 (예: 인벤토리 업데이트)
      } else {
        // 구매 실패 처리 (재고 동시성 문제 등)
        showNotification("error", `${item.name} 아이템 구매에 실패했습니다.`);
        // 중요: 캐시 롤백 로직 구현 필요
        // 예: auth.addCash(item.price); // (addCash 함수가 useAuth에 있다고 가정)
      }
    } else {
      // 캐시 차감 실패 처리
      showNotification("error", "잔액 처리 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="page-container relative">
      {/* 페이지 제목 */}
      <h2 className="text-xl font-bold mb-4">아이템 상점</h2>

      {/* 관리자 기능 토글 버튼 (관리자에게만 표시) */}
      {user?.isAdmin && (
        <button
          onClick={() => {
            // 패널을 열 때, 이미 열려있지 않다면 수정 상태 초기화 (추가 모드로 열기 위함)
            if (!showAdminPanel) {
              setEditingItem(null);
            }
            setShowAdminPanel(!showAdminPanel); // 패널 상태 토글
          }}
          className="admin-toggle-button" // 스타일링을 위한 클래스
          aria-expanded={showAdminPanel}
          aria-controls="admin-panel-content"
        >
          {/* 아이콘 추가 */}
          <span role="img" aria-label="settings" style={{ marginRight: "8px" }}>
            ⚙️
          </span>
          {showAdminPanel ? "관리자 기능 닫기" : "관리자 기능"}{" "}
          {/* 버튼 텍스트 변경 */}
        </button>
      )}

      {/* 알림 메시지 표시 영역 */}
      {notification && (
        <div
          className={`mb-4 p-3 rounded-md ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : notification.type === "error"
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800" // 정보성 알림 타입 추가 가능
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* 로그인 경고 (로그인하지 않은 사용자에게 표시) */}
      {!user && <LoginWarning />}

      {/* 상점 콘텐츠 (로그인한 사용자에게 표시) */}
      {user && (
        <div className="shop-content">
          {/* 관리자 패널 (관리자이고, 패널이 열려있을 때만 표시) */}
          {user?.isAdmin && showAdminPanel && (
            <div id="admin-panel-content">
              <AdminItemForm
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                priceIncreasePercentage={priceIncreasePercentage}
                onPriceIncreaseChange={handlePriceIncreaseChange}
                editingItem={editingItem} // 수정 중인 아이템 데이터 전달
                onCancelEdit={handleCancelEdit} // 취소 핸들러 전달
              />
            </div>
          )}

          {/* 아이템 목록 섹션 */}
          <div className="content-card-section">
            <h3 className="section-title">판매 아이템</h3>
            {/* 판매 아이템이 있을 경우 그리드 표시 */}
            {shopItems.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-grid">
                {shopItems.map((item) => (
                  <div key={item.id} className="store-item-card shop-item-card">
                    <div className="p-4 flex">
                      {" "}
                      {/* Flexbox 적용 */}
                      {/* 아이콘 */}
                      <div className="item-icon-container item-icon flex-shrink-0 mr-4">
                        {item.icon || "❓"}
                      </div>
                      {/* 아이템 정보 (이름, 설명, 재고, 가격, 버튼) */}
                      <div className="item-info flex-grow">
                        <h3 className="item-name">{item.name}</h3>
                        <p className="item-description">
                          {item.description || "설명 없음"}
                        </p>
                        <p className="item-stock">
                          재고: {item.stock ?? "확인 불가"}
                        </p>
                        {/* 아이템 하단 (가격, 수정 버튼, 구매 버튼) */}
                        <div className="item-details-footer item-footer mt-2 flex justify-between items-center">
                          <span className="item-price">
                            {item.price?.toLocaleString() || 0} 원
                          </span>
                          <div className="flex items-center">
                            {" "}
                            {/* 버튼 그룹 */}
                            {/* 수정 버튼 (관리자에게만 표시) */}
                            {user?.isAdmin && (
                              <button
                                onClick={() => handleEditItem(item)}
                                className="edit-item-button mr-2" // 오른쪽 마진 추가
                                title="아이템 수정"
                              >
                                수정
                              </button>
                            )}
                            {/* 구매 버튼 */}
                            <button
                              onClick={() => handlePurchase(item)}
                              className="buy-item-button buy-button"
                              disabled={
                                // 비활성화 조건
                                item.stock <= 0 ||
                                (user &&
                                  typeof user.cash !== "undefined" &&
                                  user.cash < item.price)
                              }
                            >
                              {item.stock <= 0 ? "품절" : "구매하기"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // 판매 아이템이 없을 경우 메시지 표시
              <div className="text-center py-8">
                <p className="text-gray-500 empty-message">
                  판매 중인 아이템이 없습니다.
                  {user?.isAdmin &&
                    " 관리자 기능을 통해 아이템을 추가해보세요."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedShop;
