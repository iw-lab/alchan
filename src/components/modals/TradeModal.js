// src/TradeModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { useState, useEffect, memo } from "react";
import "../../pages/banking/StockExchange.css"; // 스타일 공유
import { useAuth } from "../../contexts/AuthContext"; // 사용자 잔고 확인용

const TradeModal = memo(function TradeModal({
  isOpen,
  onClose,
  stock,
  action,
  onConfirmTrade,
  userStock,
}) {
  const [quantity, setQuantity] = useState(1);
  const { userDoc } = useAuth(); // 현재 사용자 정보 (cash 포함)

  useEffect(() => {
    setQuantity(1); // 모달 열릴 때마다 수량 초기화
  }, [isOpen]);

  if (!isOpen || !stock) return null;

  const maxAffordableQuantity =
    action === "buy"
      ? Math.floor((userDoc?.cash || 0) / stock.currentPrice)
      : userStock?.quantity || 0;

  const handleQuantityChange = (e) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 1) {
      value = 1;
    }
    if (value > maxAffordableQuantity && action === "buy") {
      value = maxAffordableQuantity > 0 ? maxAffordableQuantity : 1;
    }
    if (value > maxAffordableQuantity && action === "sell") {
      value = maxAffordableQuantity;
    }
    setQuantity(value);
  };

  const totalPrice = stock.currentPrice * quantity;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (quantity <= 0) {
      alert("수량은 1 이상이어야 합니다.");
      return;
    }
    if (action === "buy" && (userDoc?.cash || 0) < totalPrice) {
      alert("현금이 부족합니다.");
      return;
    }
    if (action === "sell" && (userStock?.quantity || 0) < quantity) {
      alert("보유 수량이 부족합니다.");
      return;
    }
    onConfirmTrade(stock.id, quantity, stock.currentPrice, action);
    onClose();
  };

  const canTrade = stock.status === "listed";

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>
          {stock.name} - {action === "buy" ? "주식 매수" : "주식 매도"}
        </h3>
        {!canTrade && (
          <p className="error-indicator">
            이 주식은 현재 거래할 수 없습니다 (상장폐지됨).
          </p>
        )}
        {canTrade && (
          <form onSubmit={handleSubmit} className="modal-form">
            <p>현재가: {stock.currentPrice?.toLocaleString()}원</p>
            {action === "buy" && (
              <p>내 잔고: {(userDoc?.cash || 0).toLocaleString()}원</p>
            )}
            {action === "sell" && (
              <p>보유 수량: {(userStock?.quantity || 0).toLocaleString()}주</p>
            )}

            <div>
              <label htmlFor="tradeQuantity">수량:</label>
              <input
                id="tradeQuantity"
                type="number"
                value={quantity}
                onChange={handleQuantityChange}
                min="1"
                max={
                  maxAffordableQuantity > 0
                    ? maxAffordableQuantity
                    : action === "buy"
                    ? 1
                    : 0
                }
              />
            </div>
            <p>총 금액: {totalPrice.toLocaleString()}원</p>

            <div className="modal-actions">
              <button
                type="submit"
                className="save-button"
                disabled={
                  quantity === 0 ||
                  (action === "buy" && maxAffordableQuantity === 0)
                }
              >
                {action === "buy" ? "매수 확인" : "매도 확인"}
              </button>
              <button type="button" className="cancel-button" onClick={onClose}>
                취소
              </button>
            </div>
          </form>
        )}
        {!canTrade && (
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={onClose}>
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default TradeModal;
