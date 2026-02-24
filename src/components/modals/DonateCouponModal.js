// src/DonateCouponModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { useState, memo } from "react";
import { logger } from "../../utils/logger";

const DonateCouponModal = memo(function DonateCouponModal({
  showDonateModal,
  setShowDonateModal,
  currentCoupons,
  onDonate,
  classCode, // 🔥 userId, currentGoalId는 더 이상 필요 없음
}) {
  const [donateAmount, setDonateAmount] = useState("");
  const [donateMessage, setDonateMessage] = useState("");
  const [isDonating, setIsDonating] = useState(false);

  const handleDonate = async () => {
    const amount = parseInt(donateAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("올바른 쿠폰 수량을 입력해주세요.");
      return;
    }
    if (amount > currentCoupons) {
      alert("보유 쿠폰보다 많이 응모할 수 없습니다.");
      return;
    }

    setIsDonating(true);
    try {
      // onDonate는 MyAssets.js의 handleDonateCoupon 함수
      const success = await onDonate(amount, donateMessage);
      if (success) {
        // 🔥 성공 시 모달을 닫고 상태를 초기화
        setDonateAmount("");
        setDonateMessage("");
        setShowDonateModal(false);
      }
    } catch (error) {
      logger.error("[DonateCouponModal] 응모 처리 중 오류:", error);
      alert("응모 처리 중 오류가 발생했습니다.");
    } finally {
      setIsDonating(false);
    }
  };

  const handleClose = () => {
    if (!isDonating) {
      setShowDonateModal(false);
      setDonateAmount("");
      setDonateMessage("");
    }
  };

  if (!showDonateModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-5"
      onClick={handleClose}
    >
      <div
        className="bg-[#1a1a2e] rounded-xl shadow-lg w-full max-w-[500px] overflow-hidden border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-slate-600 flex justify-between items-center bg-[#151528]">
          <h3 className="m-0 text-lg font-semibold text-slate-100">
            쿠폰 응모하기
            {classCode && (
              <span className="ml-2 text-sm bg-indigo-900/60 text-indigo-300 px-2 py-1 rounded-xl font-medium">
                {classCode}
              </span>
            )}
          </h3>
          <button
            onClick={handleClose}
            disabled={isDonating}
            className={`bg-transparent border-0 text-xl text-slate-400 p-0 leading-none ${isDonating ? "cursor-not-allowed" : "cursor-pointer hover:text-slate-200"}`}
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        {/* 내용 */}
        <div className="p-5">
          <div className="mb-5">
            <div className="flex justify-between items-center bg-indigo-900/30 px-4 py-3 rounded-lg border border-indigo-700/50">
              <span className="text-sm font-medium text-indigo-300">
                현재 보유 쿠폰
              </span>
              <span className="text-base font-semibold text-indigo-400">
                {currentCoupons.toLocaleString()} 개
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              응모할 쿠폰 수량
            </label>
            <input
              type="number"
              min="1"
              max={currentCoupons}
              value={donateAmount}
              onChange={(e) => setDonateAmount(e.target.value)}
              disabled={isDonating}
              className={`w-full p-3 border border-slate-600 rounded-md text-base text-slate-100 ${isDonating ? "bg-slate-800 cursor-not-allowed" : "bg-slate-700/50 cursor-text"}`}
              placeholder="응모할 쿠폰 수량을 입력하세요"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              응모 메시지 (선택사항)
            </label>
            <textarea
              value={donateMessage}
              onChange={(e) => setDonateMessage(e.target.value)}
              disabled={isDonating}
              className={`w-full p-3 border border-slate-600 rounded-md text-sm resize-y min-h-[80px] text-slate-100 ${isDonating ? "bg-slate-800 cursor-not-allowed" : "bg-slate-700/50 cursor-text"}`}
              placeholder="응모와 함께 전할 메시지를 입력하세요"
            />
          </div>

          {/* 예상 응모액 표시 */}
          {donateAmount && !isNaN(parseInt(donateAmount, 10)) && (
            <div className="bg-emerald-900/30 px-4 py-3 rounded-lg border border-emerald-700/50 mb-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-emerald-300">
                  응모 예정 쿠폰
                </span>
                <span className="text-base font-semibold text-emerald-400">
                  {parseInt(donateAmount, 10).toLocaleString()} 개
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-slate-600 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isDonating}
            className={`px-4 py-2 bg-slate-600 text-slate-200 border-0 rounded-md font-medium ${isDonating ? "cursor-not-allowed opacity-60" : "cursor-pointer opacity-100 hover:bg-slate-500"}`}
          >
            취소
          </button>
          <button
            onClick={handleDonate}
            disabled={
              isDonating ||
              !donateAmount ||
              isNaN(parseInt(donateAmount, 10)) ||
              parseInt(donateAmount, 10) <= 0 ||
              parseInt(donateAmount, 10) > currentCoupons
            }
            style={{
              backgroundColor:
                isDonating ||
                !donateAmount ||
                isNaN(parseInt(donateAmount, 10)) ||
                parseInt(donateAmount, 10) <= 0 ||
                parseInt(donateAmount, 10) > currentCoupons
                  ? "#4b5563"
                  : "#4f46e5",
            }}
            className={`px-4 py-2 text-white border-0 rounded-md font-medium ${
              isDonating ||
              !donateAmount ||
              isNaN(parseInt(donateAmount, 10)) ||
              parseInt(donateAmount, 10) <= 0 ||
              parseInt(donateAmount, 10) > currentCoupons
                ? "cursor-not-allowed"
                : "cursor-pointer"
            }`}
          >
            {isDonating ? "응모 중..." : "응모하기"}
          </button>
        </div>
      </div>
    </div>
  );
});

export default DonateCouponModal;
