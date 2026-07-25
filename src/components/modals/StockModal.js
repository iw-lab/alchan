// src/StockModal.js
// 🔥 성능 최적화: React.memo 적용
import { getCurrencyUnit } from "../../utils/numberFormatter";
import React, { useState, useEffect, memo } from "react";
import "../../pages/banking/StockExchange.css"; // 스타일 공유
import { formatKoreanCurrency } from '../../utils/numberFormatter';

const StockModal = memo(function StockModal({ isOpen, onClose, onSave, stock, isAdmin }) {
  const [name, setName] = useState("");
  const [initialPrice, setInitialPrice] = useState(10000);
  const [type, setType] = useState("auto"); // 'auto' or 'manual'
  const [currentPrice, setCurrentPrice] = useState(10000); // 수동 주식 현재가 설정용
  const [autoResetPercentage, setAutoResetPercentage] = useState(1.15); // 자동 주식 리셋 비율

  useEffect(() => {
    if (stock) {
      setName(stock.name || "");
      setInitialPrice(stock.initialPrice || 10000);
      setType(stock.type || "auto");
      setCurrentPrice(stock.currentPrice || stock.initialPrice || 10000);
      setAutoResetPercentage(stock.autoResetPercentage || 1.15);
    } else {
      // 새 주식 추가 시 기본값
      setName("");
      setInitialPrice(10000);
      setType("auto");
      setCurrentPrice(10000);
      setAutoResetPercentage(1.15);
    }
  }, [stock, isOpen]);

  if (!isOpen || !isAdmin) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (initialPrice <= 0) {
      alert("초기 상장가는 0보다 커야 합니다.");
      return;
    }
    if (type === "manual" && currentPrice <= 0) {
      alert("수동 주식의 현재가는 0보다 커야 합니다.");
      return;
    }
    if (
      type === "auto" &&
      (autoResetPercentage <= 1 || autoResetPercentage > 3)
    ) {
      alert(
        "자동 주식 리셋 비율은 1 (100%) 초과, 3 (300%) 이하로 설정해주세요 (예: 1.15는 115%)."
      );
      return;
    }

    const stockData = {
      name: name.trim(),
      initialPrice: parseFloat(initialPrice),
      type,
      autoResetPercentage:
        type === "auto" ? parseFloat(autoResetPercentage) : null,
      // currentPrice는 수동 주식 생성/수정 시에만 의미가 있고, 자동은 initialPrice로 시작
      // onSave 함수에서 stock (기존 데이터) 유무에 따라 currentPrice 처리
    };

    // 수정 시에는 ID를 전달하고, 현재가를 직접 설정할 수 있도록 함 (특히 수동 주식)
    if (stock && stock.id) {
      stockData.id = stock.id;
      if (type === "manual") {
        stockData.currentPrice = parseFloat(currentPrice);
      }
      // 자동 주식 수정 시에는 현재가를 여기서 바꾸지 않고, 기존 로직에 맡기거나,
      // 또는 리셋이 필요하면 관리자가 별도 조치 (여기서는 현재가 직접 수정은 수동에만)
    } else {
      // 새 주식 추가 시
      if (type === "manual") {
        stockData.currentPrice = parseFloat(currentPrice);
      }
      // 자동 주식은 currentPrice가 initialPrice로 시작
    }

    onSave(stockData);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{stock ? "주식 수정" : "새 주식 추가"}</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <div>
            <label htmlFor="stockName">주식 이름:</label>
            <input
              id="stockName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="initialPrice">초기 상장가 ({getCurrencyUnit()}):</label>
            <input
              id="initialPrice"
              type="number"
              value={initialPrice}
              onChange={(e) => setInitialPrice(parseFloat(e.target.value))}
              min="1"
              required
            />
          </div>
          <div>
            <label htmlFor="stockType">주식 유형:</label>
            <select
              id="stockType"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="auto">자동 (가격 자동 변동)</option>
              <option value="manual">수동 (관리자 가격 조작)</option>
            </select>
          </div>
          {type === "manual" && (
            <div>
              <label htmlFor="currentPriceManual">현재가 (수동 설정 시):</label>
              <input
                id="currentPriceManual"
                type="number"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                min="1"
              />
            </div>
          )}
          {type === "auto" && (
            <div>
              <label htmlFor="autoResetPercentage">
                자동 리셋 비율 (예: 1.15는 115%):
              </label>
              <input
                id="autoResetPercentage"
                type="number"
                value={autoResetPercentage}
                onChange={(e) =>
                  setAutoResetPercentage(parseFloat(e.target.value))
                }
                step="0.01"
                min="1.01"
                max="3.00"
              />
              <small className="text-[0.8em] text-gray-600">
                자동 주식 가격이 초기 상장가에 도달 시, (초기 상장가 * 이
                비율)로 리셋됩니다.
              </small>
            </div>
          )}
          <div className="modal-actions">
            <button type="submit" className="save-button">
              {stock ? "저장" : "추가"}
            </button>
            <button type="button" className="cancel-button" onClick={onClose}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default StockModal;
