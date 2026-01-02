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
      className="modal-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={closeModal} // 배경 클릭 시 닫기
    >
      <div
        className="gift-coupon-modal"
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          width: "90%",
          maxWidth: "400px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()} // 모달 내부 클릭 시 닫힘 방지
      >
        <h3 style={{ marginTop: 0, color: "#374151" }}>쿠폰 선물하기</h3>
        <div style={{ marginBottom: "16px", color: "#6b7280" }}>
          <p>
            현재 보유 쿠폰: <strong>{currentCoupons}개</strong>
          </p>
        </div>
        <div className="form-group" style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#4b5563",
            }}
          >
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
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
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
        <div className="form-group" style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "500",
              color: "#4b5563",
            }}
          >
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
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
            max={currentCoupons}
            min="1"
          />
        </div>
        <div
          className="modal-actions"
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            className="cancel-button"
            onClick={closeModal}
            style={{
              padding: "8px 16px",
              backgroundColor: "#f3f4f6",
              color: "#4b5563",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            취소
          </button>
          <button
            className="confirm-button"
            onClick={handleGiftCoupon}
            disabled={
              !giftRecipient ||
              !giftAmount ||
              parseInt(giftAmount) <= 0 ||
              parseInt(giftAmount) > currentCoupons
            }
            style={{
              padding: "8px 16px",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
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
