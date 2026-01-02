// AdminGoalSettings.js (취소 버튼 제거됨)
import React from "react";

export default function AdminGoalSettings({
  newGoalAmount,
  setNewGoalAmount,
  // === 관리자 쿠폰 교환비 관련 props 추가 ===
  adminCouponValue,
  setAdminCouponValue,
  // ========================================
  handleSaveAdminSettings, // 이 함수는 목표 설정과 쿠폰 교환비 저장을 모두 처리합니다.
  // setShowAdminSettingsModal, // 취소 버튼이 없으므로 더 이상 필요하지 않을 수 있습니다.
  // setAdminSelectedMenu,      // 필요에 따라 유지하거나 제거할 수 있습니다.
}) {
  return (
    <div>
      <div className="form-group" style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontWeight: "500",
            color: "#4b5563",
          }}
        >
          새로운 쿠폰 목표 수량
        </label>
        <input
          type="number"
          value={newGoalAmount}
          onChange={(e) => setNewGoalAmount(e.target.value)}
          placeholder="새로운 목표 수량을 입력하세요"
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "16px",
          }}
          min="1"
        />
      </div>

      {/* === 쿠폰 교환비 입력 필드 추가 === */}
      <div className="form-group" style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontWeight: "500",
            color: "#4b5563",
          }}
        >
          1 쿠폰당 가격 (원)
        </label>
        <input
          type="number"
          value={adminCouponValue}
          onChange={(e) => setAdminCouponValue(e.target.value)}
          placeholder="쿠폰 1개당 가격을 입력하세요"
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "16px",
          }}
          min="0" // 0 이상의 값 허용
        />
      </div>
      {/* ================================ */}

      {/* 목표 및 쿠폰 교환비 저장 버튼 */}
      <div
        className="modal-actions"
        style={{
          display: "flex",
          justifyContent: "flex-end", // 버튼이 하나이므로 flex-end 유지 또는 제거 가능
          gap: "10px", // 버튼이 하나이므로 필요 없음
          marginTop: "20px",
        }}
      >
        {/* --- 취소 버튼 제거됨 --- */}
        {/*
        <button
          className="cancel-button"
          onClick={() => {
            // setShowAdminSettingsModal(false); // 필요 시 상위 컴포넌트에서 처리
          }}
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
        */}
        <button
          className="confirm-button"
          onClick={handleSaveAdminSettings} // 이 함수가 목표와 쿠폰 교환비 저장을 모두 시도합니다.
          // 저장할 내용이 하나라도 있을 때 버튼 활성화 (간단한 유효성 검사)
          disabled={
            (newGoalAmount === "" ||
              parseInt(newGoalAmount) <= 0 ||
              isNaN(parseInt(newGoalAmount))) &&
            (adminCouponValue === "" ||
              parseInt(adminCouponValue) < 0 ||
              isNaN(parseInt(adminCouponValue)))
          }
          style={{
            padding: "8px 16px",
            backgroundColor: "#6366f1",
            color: "white",
            border: "none",
            borderRadius: "6px",
            // 비활성화 조건
            cursor:
              (newGoalAmount === "" ||
                parseInt(newGoalAmount) <= 0 ||
                isNaN(parseInt(newGoalAmount))) &&
              (adminCouponValue === "" ||
                parseInt(adminCouponValue) < 0 ||
                isNaN(parseInt(adminCouponValue)))
                ? "not-allowed"
                : "pointer",
            // 비활성화 시 투명도
            opacity:
              (newGoalAmount === "" ||
                parseInt(newGoalAmount) <= 0 ||
                isNaN(parseInt(newGoalAmount))) &&
              (adminCouponValue === "" ||
                parseInt(adminCouponValue) < 0 ||
                isNaN(parseInt(adminCouponValue)))
                ? "0.7"
                : "1",
            fontWeight: "500",
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
