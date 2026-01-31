// src/SellCouponModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { useState, memo } from "react";
import { logger } from '../../utils/logger';

const SellCouponModal = memo(function SellCouponModal({
  showSellCouponModal,
  setShowSellCouponModal,
  currentCoupons = 0,
  couponValue = 1000,
  sellAmount = "",
  setSellAmount,
  // Dashboard 또는 MyAssets로부터 실제 판매 처리 함수를 props로 전달받습니다.
  // 이전 답변에서 언급했듯이, Dashboard.js에서는 <SellCouponModal SellCoupon={handleSellCoupon} ... /> 형태로 전달하고 있습니다.
  // 이 prop 이름을 그대로 사용합니다.
  SellCoupon, // 실제 판매 로직을 처리하는 함수 (Dashboard 또는 MyAssets 에서 전달받음)
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  // 모달이 표시되지 않을 때는 렌더링하지 않음
  if (!showSellCouponModal) return null;

  // 판매 금액 계산
  const calculateValue = () => {
    const amount = parseInt(sellAmount);
    if (!isNaN(amount) && amount > 0) {
      return amount * couponValue;
    }
    return 0;
  };

  // handleSubmit 함수에서 Dashboard의 handleSellCoupon (props로 전달받은 SellCoupon)을 호출합니다.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseInt(sellAmount);

    // 오류 메시지 초기화
    setError("");

    // 유효성 검사 추가
    if (!amount || isNaN(amount) || amount <= 0) {
      setError("유효한 쿠폰 수량을 입력해주세요.");
      return;
    }

    if (amount > currentCoupons) {
      setError("보유한 쿠폰보다 많은 수량을 판매할 수 없습니다.");
      return;
    }

    // SellCoupon prop이 함수인지 확인
    if (typeof SellCoupon !== "function") {
      setError("판매 처리 함수가 올바르게 전달되지 않았습니다.");
      logger.error("SellCoupon prop is not a function:", SellCoupon);
      // 사용자에게 이 오류를 직접 알릴 수도 있습니다.
      // alert("판매 처리 중 시스템 오류가 발생했습니다. 관리자에게 문의하세요.");
      return;
    }

    setIsProcessing(true);

    try {
      // Dashboard 또는 MyAssets로부터 전달받은 SellCoupon 함수를 호출합니다.
      // Dashboard.js의 handleSellCoupon 함수는 내부적으로 sellAmount 상태를 사용하므로,
      // 해당 함수는 별도의 인자 없이 호출될 수 있습니다 (Dashboard.js 구현에 따름).
      await SellCoupon(); // Dashboard의 handleSellCoupon 또는 MyAssets의 handleSellCoupon 호출

      // 판매 성공 후의 처리는 Dashboard.js 또는 MyAssets.js의 handleSellCoupon 함수 내부에서
      // 모달을 닫고, sellAmount를 초기화하는 등의 작업을 수행할 것으로 기대합니다.
      // (예: setShowSellCouponModal(false); setSellAmount(""); 등을 해당 함수 내에서 호출)
      // 현재 Dashboard.js의 handleSellCoupon 함수는 성공 시 모달을 닫고 sellAmount를 초기화하도록 되어 있습니다.
    } catch (err) {
      logger.error("판매 처리 중 예상치 못한 오류:", err);
      // err.message가 사용자에게 보여주기에 적절한 내용인지 확인 필요
      setError(
        err.message || "판매 처리 중 오류가 발생했습니다. 다시 시도해주세요."
      );
    } finally {
      setIsProcessing(false);
      // 성공/실패 여부와 관계없이 isProcessing 상태는 false로 변경
      // 성공 시 모달 닫기 및 입력 필드 초기화는 SellCoupon 함수가 담당
    }
  };

  const handleCancel = () => {
    setSellAmount("");
    setError("");
    setShowSellCouponModal(false);
  };

  // 판매 버튼 활성화 조건
  const isInvalidAmount =
    !sellAmount ||
    isNaN(parseInt(sellAmount)) ||
    parseInt(sellAmount) <= 0 ||
    parseInt(sellAmount) > currentCoupons;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={handleCancel}>
      <div className="bg-white p-5 rounded-lg max-w-[500px] w-[90%] max-h-[90vh] overflow-y-auto shadow-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          쿠폰 판매하기
        </h3>
        <p className="mb-2.5 text-sm text-gray-600">
          쿠폰을 판매하고 현금으로 교환하세요.
        </p>
        <div className="flex justify-between mb-4 p-2.5 bg-gray-50 rounded-md text-[15px]">
          <span>현재 보유 쿠폰:</span>
          <strong>{currentCoupons.toLocaleString()}</strong>
        </div>
        <div className="flex justify-between mb-4 p-2.5 bg-gray-50 rounded-md text-[15px] text-indigo-600">
          <span>1쿠폰 판매가:</span>
          <strong>{couponValue.toLocaleString()}원</strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="sellAmount"
              className="block mb-1 font-medium text-gray-700"
            >
              판매할 쿠폰 수:
            </label>
            <input
              id="sellAmount"
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              min="1"
              max={currentCoupons} // 최대값 설정
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none"
              disabled={isProcessing}
              required // HTML5 기본 유효성 검사
            />
          </div>

          {/* 에러 메시지 표시 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 mb-4 text-red-800 text-sm">
              <p className="m-0">⚠️ {error}</p>
            </div>
          )}

          <div className="mb-5 px-4 py-2.5 bg-indigo-50 rounded-md border-l-4 border-indigo-600">
            <div className="flex justify-between text-base font-semibold text-gray-800">
              <span>예상 수령액:</span>
              <span className="text-indigo-600">
                {calculateValue().toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 mt-5">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-100 text-gray-600 border-0 rounded-md text-sm cursor-pointer transition-colors duration-200"
              disabled={isProcessing}
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-500 text-white border-0 rounded-md text-sm font-medium transition-all duration-200"
              style={{
                cursor:
                  isInvalidAmount || isProcessing ? "not-allowed" : "pointer",
                opacity: isInvalidAmount || isProcessing ? 0.6 : 1,
              }}
              disabled={isInvalidAmount || isProcessing}
            >
              {isProcessing ? "처리 중..." : "판매하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default SellCouponModal;
