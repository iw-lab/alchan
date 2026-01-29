// ItemCard.js

import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext"; // 올바른 경로로 수정
import { useItems } from "../../contexts/ItemContext"; // 올바른 경로로 수정
import "./styles.css"; // CombinedShop에서 사용된 스타일
import "./ItemCard.css"; // ItemCard에서 사용된 스타일 (원본 ItemCard.js 코드에서 가져옴)
import LoginWarning from "../../components/LoginWarning";

// --- ItemCard 컴포넌트 (원본 ItemCard.js 코드) ---
const ItemCard = ({ item, iconUrl, onBuy }) => {
  const formatPrice = (price) => {
    // 가격 포맷팅 함수 (한국 원화)
    return new Intl.NumberFormat("ko-KR").format(price);
  };

  return (
    // 개별 아이템 카드 UI
    <div className="item-card">
      {" "}
      {/* ItemCard.css의 클래스 */}
      <img
        src={iconUrl || "/icons/default.png"} // 아이콘 이미지 (기본값 포함)
        alt={item.name} // 이미지 대체 텍스트
        className="item-image" // ItemCard.css의 클래스
      />
      <h3 className="item-name">{item.name}</h3> {/* 아이템 이름 */}
      {/* item.function 대신 item.description을 사용하도록 수정 (CombinedShop 코드 참고) */}
      <p className="item-description">{item.description || item.function}</p>
      <p className="item-price">{formatPrice(item.price)} 원</p>{" "}
      {/* 포맷된 가격 */}
      <p className="item-stock">재고: {item.stock}</p> {/* 아이템 재고 */}
      <button className="buy-button" onClick={onBuy}>
        {" "}
        {/* 구매 버튼 */}
        구매하기
      </button>
    </div>
  );
};

// --- 관리자 아이템 추가 폼 컴포넌트 (원본 ItemCard (6).js 파일 코드) ---
const AdminItemForm = ({
  onAddItem,
  priceIncreasePercentage,
  onPriceIncreaseChange,
}) => {
  // 상태: 아이템 이름, 효과(설명), 가격, 초기 재고
  const [itemName, setItemName] = useState("");
  const [itemEffect, setItemEffect] = useState("");
  const [itemPrice, setItemPrice] = useState(0);
  const [initialStock, setInitialStock] = useState(10); // 기본 초기 재고

  // 폼 제출 핸들러
  const handleSubmit = (e) => {
    e.preventDefault();
    // 입력 값 유효성 검사
    if (!itemName || itemPrice <= 0 || initialStock <= 0) {
      alert(
        "아이템 이름, 가격(0보다 커야 함), 초기 재고(0보다 커야 함)를 올바르게 입력하세요."
      );
      return;
    }
    // 새 아이템 데이터 객체 생성
    const newItemData = {
      name: itemName,
      description: itemEffect, // 'effect'를 설명으로 사용
      price: parseInt(itemPrice, 10), // 가격을 정수로 변환
      initialStock: parseInt(initialStock, 10), // 초기 재고를 정수로 변환
      stock: parseInt(initialStock, 10), // 현재 재고도 초기 재고와 동일하게 시작
      available: true, // 기본적으로 구매 가능
      icon: "🆕", // 새 아이템 기본 아이콘 (임시)
      // id는 ItemContext의 addItem 함수 내에서 생성된다고 가정
    };
    onAddItem(newItemData); // 부모 컴포넌트에서 전달된 핸들러 호출
    // 폼 초기화
    setItemName("");
    setItemEffect("");
    setItemPrice(0);
    setInitialStock(10);
  };

  return (
    <div className="admin-panel content-card-section mb-6">
      {" "}
      {/* */}
      <h3 className="section-title">관리자 패널: 아이템 추가 및 설정</h3>{" "}
      {/* */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {" "}
        {/* */}
        {/* 아이템 이름 입력 */}
        <div>
          <label
            htmlFor="itemName"
            className="block text-sm font-medium text-gray-700"
          >
            아이템 이름:
          </label>
          <input
            type="text"
            id="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" //
          />
        </div>
        {/* 아이템 효과(설명) 입력 */}
        <div>
          <label
            htmlFor="itemEffect"
            className="block text-sm font-medium text-gray-700"
          >
            아이템 효과 (설명):
          </label>
          <input
            type="text"
            id="itemEffect"
            value={itemEffect}
            onChange={(e) => setItemEffect(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" //
          />
        </div>
        {/* 가격 입력 */}
        <div>
          <label
            htmlFor="itemPrice"
            className="block text-sm font-medium text-gray-700"
          >
            가격 (원):
          </label>
          <input
            type="number"
            id="itemPrice"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            required
            min="1"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" //
          />
        </div>
        {/* 초기 재고 입력 */}
        <div>
          <label
            htmlFor="initialStock"
            className="block text-sm font-medium text-gray-700"
          >
            초기 재고:
          </label>
          <input
            type="number"
            id="initialStock"
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
            required
            min="1"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" //
          />
        </div>
        {/* 가격 상승률 설정 */}
        <div>
          <label
            htmlFor="priceIncrease"
            className="block text-sm font-medium text-gray-700"
          >
            재고 소진 시 가격 상승률 (%):
          </label>
          <input
            type="number"
            id="priceIncrease"
            value={priceIncreasePercentage}
            onChange={
              (e) => onPriceIncreaseChange(parseInt(e.target.value, 10) || 0) // 숫자로 변환, 실패 시 0으로 기본값
            }
            min="0" // 최소 0%
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" //
          />
        </div>
        <button type="submit" className="admin-add-button">
          {" "}
          {/* */}
          아이템 추가
        </button>
      </form>
    </div>
  );
};

// --- 메인 상점 및 인벤토리 컴포넌트 (원본 ItemCard (6).js 파일 코드) ---
const CombinedShop = () => {
  // 컨텍스트 훅 사용, null/undefined 반환 시 기본값 제공
  const { user, userDoc, deductCash } = useAuth() || {};
  const { items, purchaseItem, getUserItems, addItem, updateItemPrice } =
    useItems() || {
      items: [],
      purchaseItem: null,
      getUserItems: () => [], // getUserItems 기본값 추가
      addItem: null,
      updateItemPrice: null,
    };

  // 상태 관리
  const [shopItems, setShopItems] = useState([]); // 상점 탭에 표시될 아이템
  const [userInventoryItems, setUserInventoryItems] = useState([]); // 인벤토리 탭에 표시될 아이템
  const [notification, setNotification] = useState(null); // 알림 메시지 상태
  const [showAdminPanel, setShowAdminPanel] = useState(false); // 관리자 패널 표시 상태
  const [priceIncreasePercentage, setPriceIncreasePercentage] = useState(10); // 기본 가격 상승률 10%

  // ItemContext의 items가 변경될 때 상점 아이템 목록 업데이트
  useEffect(() => {
    if (items) {
      // 하위 호환성을 위해 initialStock 기본값 추가
      const itemsWithDefaults = items.map((item) => ({
        ...item,
        initialStock: item.initialStock ?? item.stock ?? 10, // 기존 stock 또는 10으로 기본값 설정
      }));
      const availableItems = itemsWithDefaults.filter(
        (item) => item?.available // 구매 가능한 아이템만 필터링
      );
      setShopItems(availableItems);
    }
  }, [items]); // items가 변경될 때마다 실행

  // 알림 표시 함수
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000); // 3초 후 알림 숨김
  };

  // 새 아이템 추가 핸들러 (AdminItemForm에서 호출)
  const handleAddItem = async (newItemData) => {
    if (!addItem) {
      console.error("addItem 함수를 ItemContext에서 찾을 수 없습니다."); //
      showNotification("error", "아이템 추가 기능을 사용할 수 없습니다.");
      return;
    }
    
    try {
      const success = await addItem(newItemData, userDoc?.classCode);
      if (success) {
        showNotification("success", `${newItemData.name} 아이템이 추가되었습니다.`);
        setShowAdminPanel(false); // 추가 후 패널 닫기 (선택 사항)
      } else {
        showNotification("error", "아이템 추가에 실패했습니다.");
      }
    } catch (error) {
      console.error("아이템 추가 중 오류:", error);
      showNotification("error", "아이템 추가 중 오류가 발생했습니다.");
    }
  };

  // 가격 상승률 변경 핸들러
  const handlePriceIncreaseChange = (percentage) => {
    setPriceIncreasePercentage(percentage);
  };

  // 아이템 구매 핸들러 (ItemStore.js 로직 기반)
  const handlePurchase = async (item) => {
    if (!item) return; // 아이템 객체 유효성 검사

    // --- 유효성 검사 ---
    if (!user) {
      showNotification("error", "로그인이 필요합니다.");
      return;
    }
    if (typeof userDoc?.cash === "undefined") {
      console.error("사용자 잔액 정보를 찾을 수 없습니다."); //
      showNotification("error", "사용자 잔액 정보를 불러올 수 없습니다.");
      return;
    }
    if (userDoc.cash < item.price) {
      showNotification("error", "잔액이 부족합니다.");
      return;
    }
    // 구매 시점의 재고 확인
    if (item.stock <= 0) {
      showNotification("error", "아이템 재고가 없습니다.");
      return;
    }
    if (!purchaseItem) {
      console.error("필수 함수(purchaseItem)를 찾을 수 없습니다."); //
      showNotification("error", "구매 처리 중 오류가 발생했습니다.");
      return;
    }
    // --- 유효성 검사 끝 ---

    try {
      const result = await purchaseItem(item.id, 1, priceIncreasePercentage, false);
      
      if (result.success) {
        showNotification("success", `${item.name} 아이템을 구매했습니다!`);
      } else {
        showNotification("error", result.message || "구매에 실패했습니다.");
      }
    } catch (error) {
      console.error("구매 처리 중 오류:", error);
      showNotification("error", "구매 처리 중 오류가 발생했습니다.");
    }
  };

  // JSX 렌더링
  return (
    <div className="page-container relative">
      {" "}
      {/* */}
      {/* 관리자 버튼 위치 지정을 위해 relative 추가 */}
      {/* 상점 제목 */}
      <h2 className="text-xl font-bold mb-4">아이템 상점</h2> {/* */}
      {/* 관리자 패널 토글 버튼 (우측 상단) */}
      {user?.isAdmin && ( // 사용자가 로그인했고 isAdmin 플래그가 있는 경우에만 표시
        <button
          onClick={() => setShowAdminPanel(!showAdminPanel)}
          className="admin-toggle-button" // CSS에서 스타일 지정 필요
        >
          {showAdminPanel ? "관리자 패널 닫기" : "관리자 패널 열기"}
        </button>
      )}
      {/* 알림 영역 */}
      {notification && ( //
        <div
          className={`mb-4 p-3 rounded-md ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : notification.type === "error"
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800" // 정보 알림 추가
          }`}
        >
          {notification.message}
        </div>
      )}
      {/* 로그인 경고 (로그인 안했을 때) */}
      {!user && <LoginWarning />} {/* */}
      {/* 메인 상점 컨텐츠 */}
      {user && ( //
        <div className="shop-content">
          {" "}
          {/* */}
          {/* 관리자 패널 (조건부 렌더링) */}
          {user?.isAdmin &&
            showAdminPanel && ( //
              <AdminItemForm
                onAddItem={handleAddItem}
                priceIncreasePercentage={priceIncreasePercentage}
                onPriceIncreaseChange={handlePriceIncreaseChange}
              />
            )}
          {/* 아이템 목록 섹션 */}
          <div className="content-card-section">
            {" "}
            {/* */}
            <h3 className="section-title">판매 아이템</h3> {/* */}
            {shopItems.length > 0 ? ( //
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-grid">
                {" "}
                {/* */}
                {/* items-grid 클래스 추가 */}
                {shopItems.map((item) => (
                  // ItemCard 컴포넌트 사용하도록 수정
                  <ItemCard
                    key={item.id}
                    item={item}
                    // iconUrl prop 추가 (item 객체에 icon 속성이 있다고 가정)
                    iconUrl={item.iconUrl || `/icons/${item.id}.png`} // 아이콘 경로 예시
                    onBuy={() => handlePurchase(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                {" "}
                {/* */}
                <p className="text-gray-500 empty-message">
                  {" "}
                  {/* */}
                  판매 중인 아이템이 없습니다.
                </p>
                {/* empty-message 클래스 추가 */}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// CombinedShop을 기본으로 내보냅니다.
export default CombinedShop;