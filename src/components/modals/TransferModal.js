// src/TransferModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { memo, useMemo } from "react";

const TransferModal = memo(function TransferModal({
  showTransferModal,
  setShowTransferModal,
  recipients = [],
  transferRecipient,
  setTransferRecipient,
  transferAmount,
  setTransferAmount,
  handleTransfer,
  userId,
  userCash = 0,
}) {
  // 모달 스타일
  const modalOverlayStyle = {
    display: showTransferModal ? "flex" : "none",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  };

  const modalContentStyle = {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "30px",
    maxWidth: "450px",
    width: "100%",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    position: "relative",
  };

  const closeButtonStyle = {
    position: "absolute",
    top: "15px",
    right: "15px",
    background: "none",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
    color: "#6b7280",
    padding: "0",
    width: "30px",
    height: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    backgroundColor: "white",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
  };

  const buttonStyle = {
    padding: "10px 20px",
    borderRadius: "6px",
    border: "none",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#4f46e5",
    color: "white",
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#e5e7eb",
    color: "#374151",
    marginRight: "10px",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleTransfer();
  };

  // 유효한 수신자 목록 필터링 (본인 제외) 및 가나다순 정렬
  const validRecipients = recipients
    .filter(r => r && r.id && r.id !== userId)
    .sort((a, b) => {
      const nameA = a.name || a.nickname || `사용자 ${a.id.substring(0, 6)}`;
      const nameB = b.name || b.nickname || `사용자 ${b.id.substring(0, 6)}`;
      return nameA.localeCompare(nameB, 'ko');
    });

  return (
    <div style={modalOverlayStyle} onClick={() => setShowTransferModal(false)}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowTransferModal(false)}
          style={closeButtonStyle}
          aria-label="닫기"
        >
          ×
        </button>

        <h2 style={{ 
          fontSize: "20px", 
          fontWeight: "600", 
          marginBottom: "25px", 
          color: "#1f2937" 
        }}>
          💸 송금하기
        </h2>

        <div style={{ 
          backgroundColor: "#f3f4f6", 
          borderRadius: "8px", 
          padding: "12px", 
          marginBottom: "20px" 
        }}>
          <p style={{ 
            fontSize: "14px", 
            color: "#4b5563", 
            margin: "0" 
          }}>
            현재 보유 현금: <strong style={{ color: "#1f2937" }}>
              {userCash.toLocaleString()}원
            </strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>
              받는 사람
            </label>
            <select
              value={transferRecipient}
              onChange={(e) => setTransferRecipient(e.target.value)}
              style={selectStyle}
              required
            >
              <option value="">받는 분을 선택하세요</option>
              {validRecipients.length > 0 ? (
                validRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name || recipient.nickname || `사용자 ${recipient.id.substring(0, 6)}`}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  송금 가능한 학급 친구가 없습니다
                </option>
              )}
            </select>
            {validRecipients.length === 0 && (
              <p style={{ 
                marginTop: "8px", 
                fontSize: "12px", 
                color: "#ef4444" 
              }}>
                ⚠️ 같은 학급의 다른 사용자가 없거나 데이터를 불러오는 중입니다.
              </p>
            )}
          </div>

          <div style={{ marginBottom: "25px" }}>
            <label style={labelStyle}>
              송금 금액
            </label>
            <input
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="송금할 금액을 입력하세요"
              style={inputStyle}
              min="1"
              max={userCash}
              required
            />
            {transferAmount && parseInt(transferAmount) > userCash && (
              <p style={{ 
                marginTop: "8px", 
                fontSize: "12px", 
                color: "#ef4444" 
              }}>
                보유 현금보다 많은 금액은 송금할 수 없습니다.
              </p>
            )}
          </div>

          <div style={{ 
            display: "flex", 
            justifyContent: "flex-end", 
            paddingTop: "10px", 
            borderTop: "1px solid #e5e7eb" 
          }}>
            <button
              type="button"
              onClick={() => setShowTransferModal(false)}
              style={secondaryButtonStyle}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = "#d1d5db";
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = "#e5e7eb";
              }}
            >
              취소
            </button>
            <button
              type="submit"
              style={primaryButtonStyle}
              disabled={!transferRecipient || !transferAmount || parseInt(transferAmount) > userCash || validRecipients.length === 0}
              onMouseOver={(e) => {
                if (!e.target.disabled) {
                  e.target.style.backgroundColor = "#4338ca";
                }
              }}
              onMouseOut={(e) => {
                if (!e.target.disabled) {
                  e.target.style.backgroundColor = "#4f46e5";
                }
              }}
            >
              송금
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default TransferModal;