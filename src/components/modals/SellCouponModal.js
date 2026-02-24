// src/SellCouponModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { useState, memo } from "react";
import { logger } from "../../utils/logger";

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
      return;
    }

    setIsProcessing(true);

    try {
      await SellCoupon(); // Dashboard의 handleSellCoupon 또는 MyAssets의 handleSellCoupon 호출
    } catch (err) {
      logger.error("판매 처리 중 예상치 못한 오류:", err);
      setError(
        err.message || "판매 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
      );
    } finally {
      setIsProcessing(false);
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]"
      onClick={handleCancel}
    >
      <div
        className="bg-[#1a1a2e] p-5 rounded-lg max-w-[500px] w-[90%] max-h-[90vh] overflow-y-auto shadow-md border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4 text-slate-100">
          쿠폰 판매하기
        </h3>
        <p className="mb-2.5 text-sm text-slate-400">
          쿠폰을 판매하고 현금으로 교환하세요.
        </p>
        <div className="flex justify-between mb-4 p-2.5 bg-slate-800/60 rounded-md text-[15px] text-slate-300">
          <span>현재 보유 쿠폰:</span>
          <strong className="text-slate-100">
            {currentCoupons.toLocaleString()}
          </strong>
        </div>
        <div className="flex justify-between mb-4 p-2.5 bg-slate-800/60 rounded-md text-[15px] text-indigo-400">
          <span>1쿠폰 판매가:</span>
          <strong>{couponValue.toLocaleString()}원</strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="sellAmount"
              className="block mb-1 font-medium text-slate-300"
            >
              판매할 쿠폰 수:
            </label>
            <input
              id="sellAmount"
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              min="1"
              max={currentCoupons}
              className="w-full px-3 py-2 border border-slate-600 rounded-md text-sm outline-none bg-slate-700/50 text-slate-100"
              disabled={isProcessing}
              required
            />
          </div>

          {/* 에러 메시지 표시 */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-md px-4 py-3 mb-4 text-red-300 text-sm">
              <p className="m-0">{error}</p>
            </div>
          )}

          <div className="mb-5 px-4 py-2.5 bg-indigo-900/30 rounded-md border-l-4 border-indigo-500">
            <div className="flex justify-between text-base font-semibold text-slate-200">
              <span>예상 수령액:</span>
              <span className="text-indigo-400">
                {calculateValue().toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 mt-5">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-slate-600 text-slate-200 border-0 rounded-md text-sm cursor-pointer transition-colors duration-200 hover:bg-slate-500"
              disabled={isProcessing}
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white border-0 rounded-md text-sm font-medium transition-all duration-200"
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
