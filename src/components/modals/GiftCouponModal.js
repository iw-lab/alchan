// 🔥 성능 최적화: React.memo 적용
import React, { memo } from "react";

const GiftCouponModal = memo(function GiftCouponModal({
  showGiftCouponModal,
  setShowGiftCouponModal,
  recipients,
  giftRecipient,
  setGiftRecipient, // 이 함수는 Dashboard에서 전달되어야 함
  giftAmount,
  setGiftAmount, // 이 함수가 Dashboard에서 올바르게 전달되어야 함
  handleGiftCoupon,
  currentCoupons,
  userId,
}) {
  if (!showGiftCouponModal) {
    return null;
  }

  const validRecipients = recipients ?? [];

  const closeModal = () => {
    setShowGiftCouponModal(false);
    // --- 오류 발생 지점 ---
    // setGiftAmount와 setGiftRecipient가 함수 형태로 올바르게 전달되었는지 확인 필요
    if (typeof setGiftAmount === "function") {
      setGiftAmount(""); // 모달 닫을 때 상태 초기화
    } else {
      console.error("setGiftAmount prop is not a function!", setGiftAmount); // 디버깅 로그 추가
    }
    if (typeof setGiftRecipient === "function") {
      setGiftRecipient("");
    } else {
      console.error(
        "setGiftRecipient prop is not a function!",
        setGiftRecipient
      ); // 디버깅 로그 추가
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 bg-black/50 flex justify-center items-center z-[1000]"
      onClick={closeModal} // 배경 클릭 시 닫기
    >
      <div
        className="gift-coupon-modal bg-white rounded-xl p-6 w-[90%] max-w-[400px] shadow-xl"
        onClick={(e) => e.stopPropagation()} // 모달 내부 클릭 시 닫힘 방지
      >
        <h3 className="mt-0 text-gray-700">쿠폰 선물하기</h3>
        <div className="mb-4 text-gray-500">
          <p>
            현재 보유 쿠폰: <strong>{currentCoupons}개</strong>
          </p>
        </div>
        <div className="form-group mb-4">
          <label className="block mb-2 font-medium text-gray-600">
            받는 사람
          </label>
          <select
            value={giftRecipient}
            // onChange 핸들러에서 setGiftRecipient가 함수인지 확인
            onChange={(e) =>
              typeof setGiftRecipient === "function"
                ? setGiftRecipient(e.target.value)
                : console.error("setGiftRecipient is not a function")
            }
            className="w-full p-2.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">받는 분을 선택하세요</option>
            {validRecipients
              .filter((recipient) => recipient.id !== userId)
              .map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.name} ({recipient.id})
                </option>
              ))}
          </select>
        </div>
        <div className="form-group mb-6">
          <label className="block mb-2 font-medium text-gray-600">
            선물할 쿠폰 수량
          </label>
          <input
            type="number"
            value={giftAmount}
            // onChange 핸들러에서 setGiftAmount가 함수인지 확인
            onChange={(e) =>
              typeof setGiftAmount === "function"
                ? setGiftAmount(e.target.value)
                : console.error("setGiftAmount is not a function")
            }
            placeholder="선물할 쿠폰 수량을 입력하세요"
            className="w-full p-2.5 border border-gray-300 rounded-md text-sm"
            max={currentCoupons}
            min="1"
          />
        </div>
        <div className="modal-actions flex justify-end gap-2.5">
          <button
            className="cancel-button px-4 py-2 bg-gray-100 text-gray-600 border-0 rounded-md cursor-pointer font-medium"
            onClick={closeModal}
          >
            취소
          </button>
          <button
            className="confirm-button px-4 py-2 bg-emerald-500 text-white border-0 rounded-md text-sm font-medium"
            onClick={handleGiftCoupon}
            disabled={
              !giftRecipient ||
              !giftAmount ||
              parseInt(giftAmount) <= 0 ||
              parseInt(giftAmount) > currentCoupons
            }
            style={{
              cursor:
                !giftRecipient ||
                !giftAmount ||
                parseInt(giftAmount) <= 0 ||
                parseInt(giftAmount) > currentCoupons
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !giftRecipient ||
                !giftAmount ||
                parseInt(giftAmount) <= 0 ||
                parseInt(giftAmount) > currentCoupons
                  ? 0.7
                  : 1,
            }}
          >
            선물하기
          </button>
        </div>
      </div>
    </div>
  );
});

export default GiftCouponModal;
