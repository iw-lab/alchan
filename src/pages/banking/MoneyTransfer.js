// src/MoneyTransfer.js - 서버 응답 기반 상태 업데이트 수정 버전

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { adminCashAction } from "../../services/database";
import "./MoneyTransfer.css";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { logger } from "../../utils/logger";

function MoneyTransfer() {
  // AuthContext에서 필요한 데이터와 함수를 가져옵니다.
  const {
    userDoc,
    allClassMembers,
    loading: authLoading,
    setUserDoc,
    setAllClassMembers,
    refreshAllUsers,
  } = useAuth();
  const { currencyUnit } = useCurrency();

  // 컴포넌트 내부 상태 관리
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [amount, setAmount] = useState("");
  const [amountType, setAmountType] = useState("fixed");
  const [action, setAction] = useState("send");
  const [takeMode, setTakeMode] = useState("toMe"); // "toMe" 또는 "remove"
  const [taxRate, setTaxRate] = useState(10);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 관리자 정보 추출
  const adminName = userDoc?.name;
  const adminClassCode = userDoc?.classCode;

  // 전체 사용자 목록을 가나다순으로 정렬
  const users = useMemo(() => {
    if (!allClassMembers || allClassMembers.length === 0) return [];
    return [...allClassMembers].sort((a, b) => {
      const nameA = a.name || a.nickname || "";
      const nameB = b.name || b.nickname || "";
      return nameA.localeCompare(nameB, "ko");
    });
  }, [allClassMembers]);

  const duplicateNameCounts = useMemo(
    () =>
      users.reduce((acc, member) => {
        const key = member.name || member.nickname || "이름없음";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    [users],
  );

  const getUserIdentityText = useCallback((member) => {
    if (member.studentNumber) {
      return `학번 ${member.studentNumber}`;
    }

    if (member.email) {
      return member.email;
    }

    return `ID ${String(member.id || "").slice(0, 6)}`;
  }, []);

  useEffect(() => {
    if (!adminClassCode || typeof refreshAllUsers !== "function") return;

    refreshAllUsers().catch((refreshError) => {
      logger.warn("[MoneyTransfer] 학생 목록 새로고침 실패:", refreshError);
    });
  }, [adminClassCode, refreshAllUsers]);

  // 액션 타입이 변경되면 선택 초기화
  useEffect(() => {
    setSelectedUsers([]);
    setSelectAll(false);
  }, [action, amountType]);

  // 사용자 선택 핸들러
  const handleUserSelection = (userId) => {
    setSelectedUsers((prevSelected) =>
      prevSelected.includes(userId)
        ? prevSelected.filter((id) => id !== userId)
        : [...prevSelected, userId],
    );
  };

  // 전체 선택 핸들러
  const handleSelectAll = () => {
    setSelectAll((prev) => {
      const newSelectAll = !prev;
      setSelectedUsers(newSelectAll ? users.map((user) => user.id) : []);
      return newSelectAll;
    });
  };

  // 미리보기 금액 계산 함수
  const calculatePreviewAmount = useCallback(
    (userCash, inputValue, applyTax = false) => {
      let baseAmount;
      if (amountType === "percentage") {
        baseAmount = Math.floor((userCash * Number(inputValue)) / 100);
      } else {
        baseAmount = Number(inputValue);
      }

      if (applyTax && action === "send") {
        const taxAmount = Math.floor((baseAmount * taxRate) / 100);
        return baseAmount - taxAmount;
      }

      return baseAmount;
    },
    [amountType, action, taxRate],
  );

  // 폼 제출 (보내기/가져오기 실행) 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedUsers.length === 0 || !amount || isNaN(Number(amount))) {
      setError("사용자를 선택하고 유효한 값을 입력하세요.");
      return;
    }

    const inputValue = Number(amount);
    if (inputValue <= 0) {
      setError(
        `${amountType === "percentage" ? "퍼센트" : "금액"}은 0보다 커야 합니다.`,
      );
      return;
    }
    if (amountType === "percentage" && (inputValue > 100 || inputValue < 0)) {
      setError("퍼센트는 0과 100 사이의 값이어야 합니다.");
      return;
    }

    setIsProcessing(true);
    setMessage("");
    setError("");

    try {
      const refreshedUsers =
        typeof refreshAllUsers === "function"
          ? await refreshAllUsers()
          : allClassMembers;
      const latestUsers = Array.isArray(refreshedUsers)
        ? refreshedUsers
        : allClassMembers;

      if (latestUsers.length > 0) {
        setAllClassMembers(latestUsers);
      }

      const latestUsersById = new Map(
        latestUsers.map((member) => [member.id, member]),
      );
      const targetUsersData = selectedUsers
        .map((userId) => latestUsersById.get(userId))
        .filter(Boolean);

      if (targetUsersData.length !== selectedUsers.length) {
        throw new Error(
          "학생 목록이 변경되었습니다. 대상 학생을 다시 선택한 뒤 다시 시도해주세요.",
        );
      }

      // ✨ DB 작업 실행하고 서버로부터 실제 결과 받기
      const { count, totalProcessed, updatedUsers } = await adminCashAction({
        adminName,
        adminClassCode,
        targetUsers: targetUsersData,
        action,
        takeMode: action === "take" ? takeMode : undefined, // 가져오기 모드 전달
        amountType,
        amount: inputValue,
        taxRate,
      });

      // ✨ 서버에서 받은 '진짜' 데이터로 로컬 상태 업데이트
      if (updatedUsers && updatedUsers.length > 0) {
        // 1. 대상 사용자들의 잔액 업데이트
        setAllClassMembers((currentMembers) =>
          currentMembers.map((member) => {
            const updatedInfo = updatedUsers.find((u) => u.id === member.id);
            return updatedInfo
              ? { ...member, cash: updatedInfo.newCash }
              : member;
          }),
        );

        // 2. 관리자 본인의 잔액 업데이트
        setUserDoc((currentAdminDoc) => {
          const currentAdminCash = Number(currentAdminDoc.cash || 0);
          let newAdminCash;
          if (action === "send") {
            // 보냈을 때는 처리된 총액만큼 차감 (세금 포함된 금액이 totalProcessed)
            newAdminCash = currentAdminCash - totalProcessed;
          } else if (action === "take" && takeMode === "toMe") {
            // 나에게 가져올 때는 처리된 총액만큼 증가
            newAdminCash = currentAdminCash + totalProcessed;
          } else {
            // 돈 없애기 모드는 관리자 잔액 변화 없음
            newAdminCash = currentAdminCash;
          }
          return { ...currentAdminDoc, cash: newAdminCash };
        });
      }

      // 성공 메시지 설정
      const actionText =
        action === "send"
          ? "보내기"
          : takeMode === "toMe"
            ? "가져오기"
            : "없애기";
      setMessage(
        `${count}명에게 ${amountType === "percentage" ? `${inputValue}%` : `${inputValue.toLocaleString()}${currencyUnit}`} ${actionText} 완료! (총 ${totalProcessed.toLocaleString()}${currencyUnit} 처리${action === "send" && taxRate > 0 ? `, 세금 ${taxRate}% 적용` : ""})`,
      );

      setAmount("");
      setSelectedUsers([]);
      setSelectAll(false);

      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      logger.error("처리 중 오류 발생:", err);
      setError(`오류가 발생했습니다: ${err.message}`);
      // 오류 발생 시에는 데이터를 다시 불러오는 것이 가장 정확하지만,
      // Firestore 사용 최소화를 위해 여기서는 에러 메시지만 표시합니다.
      setTimeout(() => setError(""), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  const previewAmounts = useMemo(() => {
    if (!amount || selectedUsers.length === 0) return {};
    const preview = {};
    selectedUsers.forEach((userId) => {
      const user = users.find((u) => u.id === userId);
      if (user) {
        const userCash = Number(user.cash || 0);
        const applyTax = action === "send";
        preview[userId] = calculatePreviewAmount(userCash, amount, applyTax);
      }
    });
    return preview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUsers, amount, action, users, calculatePreviewAmount]); // amountType과 taxRate는 calculatePreviewAmount 내부에서 사용됨

  return (
    <div className="money-transfer-container">
      <div className="header">
        <div className="admin-info">
          <span className="admin-label">관리자</span>
          <span className="admin-name">{adminName || "로딩 중..."}</span>
          <span className="admin-cash">
            현금: {(userDoc?.cash || 0).toLocaleString()}
            {currencyUnit}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={handleSubmit} className="transfer-form">
        <div className="action-selector">
          <button
            type="button"
            className={`action-btn ${action === "send" ? "active send" : ""}`}
            onClick={() => setAction("send")}
          >
            <span className="icon">📤</span> 보내기
          </button>
          <button
            type="button"
            className={`action-btn ${action === "take" ? "active take" : ""}`}
            onClick={() => setAction("take")}
          >
            <span className="icon">📥</span> 가져오기
          </button>
        </div>

        {action === "take" && (
          <div className="take-mode-section">
            <h4>가져오기 옵션</h4>
            <div className="take-mode-selector">
              <label
                className={`mode-option ${takeMode === "toMe" ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="takeMode"
                  value="toMe"
                  checked={takeMode === "toMe"}
                  onChange={(e) => setTakeMode(e.target.value)}
                />
                <span className="radio-custom"></span>
                <span className="mode-text">
                  <strong>💰 나에게 가져오기</strong>
                  <small>선택한 학생들의 돈을 내 계좌로 가져옵니다</small>
                </span>
              </label>
              <label
                className={`mode-option ${takeMode === "remove" ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="takeMode"
                  value="remove"
                  checked={takeMode === "remove"}
                  onChange={(e) => setTakeMode(e.target.value)}
                />
                <span className="radio-custom"></span>
                <span className="mode-text">
                  <strong>🗑️ 돈 없애기</strong>
                  <small>선택한 학생들의 돈을 영구적으로 제거합니다</small>
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="amount-section">
          <div className="amount-type-selector">
            <label
              className={`type-option ${amountType === "fixed" ? "active" : ""}`}
            >
              <input
                type="radio"
                name="amountType"
                value="fixed"
                checked={amountType === "fixed"}
                onChange={(e) => setAmountType(e.target.value)}
              />
              <span className="radio-custom"></span> 고정 금액
            </label>
            <label
              className={`type-option ${amountType === "percentage" ? "active" : ""}`}
            >
              <input
                type="radio"
                name="amountType"
                value="percentage"
                checked={amountType === "percentage"}
                onChange={(e) => setAmountType(e.target.value)}
              />
              <span className="radio-custom"></span> 퍼센트 (%)
            </label>
          </div>
          <div className="amount-input-group">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={amountType === "fixed" ? "금액 입력" : "퍼센트 입력"}
              min="1"
              max={amountType === "percentage" ? "100" : undefined}
              required
              className="amount-input"
            />
            <span className="amount-unit">
              {amountType === "fixed" ? currencyUnit : "%"}
            </span>
          </div>
        </div>

        {action === "send" && (
          <div className="tax-section">
            <div className="tax-header">
              <h4>💸 세금 설정</h4>
              <span className="tax-description">
                보내는 금액에서 세금을 제외하고 지급됩니다.
              </span>
            </div>
            <div className="tax-input-group">
              <label htmlFor="taxRate">세금율:</label>
              <input
                type="number"
                id="taxRate"
                value={taxRate}
                onChange={(e) =>
                  setTaxRate(Math.max(0, Math.min(100, Number(e.target.value))))
                }
                min="0"
                max="100"
                className="tax-input"
              />
              <span className="tax-unit">%</span>
            </div>
            {amount && (
              <div className="tax-preview">
                {amountType === "fixed" ? (
                  <>
                    실제 지급액:{" "}
                    {calculatePreviewAmount(0, amount, true).toLocaleString()}
                    {currencyUnit}
                    (세금{" "}
                    {Math.floor(
                      (Number(amount) * taxRate) / 100,
                    ).toLocaleString()}
                    {currencyUnit} 제외)
                  </>
                ) : (
                  `각 학생 잔액의 ${amount}%에서 세금 ${taxRate}%가 추가로 차감됩니다.`
                )}
              </div>
            )}
          </div>
        )}

        <div className="user-selection-section">
          <div className="section-header">
            <h3>대상 선택</h3>
            <label className="select-all-label">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
                className="checkbox-custom"
              />
              <span className="checkmark"></span> 전체 선택
            </label>
          </div>

          {authLoading && users.length === 0 ? (
            <div className="loading">사용자 목록을 불러오는 중입니다...</div>
          ) : (
            <div className="user-list">
              {users.map((user) => {
                const previewAmount = previewAmounts[user.id];
                return (
                  <div key={user.id} className="user-item">
                    <label className="user-label">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelection(user.id)}
                        className="checkbox-custom"
                      />
                      <span className="checkmark"></span>
                      <div className="user-info">
                        <span className="user-name">
                          {user.name}
                          {duplicateNameCounts[user.name] > 1
                            ? ` (${getUserIdentityText(user)})`
                            : ""}
                        </span>
                        <span className="user-balance">
                          {getUserIdentityText(user)}
                        </span>
                        <span className="user-balance">
                          잔액: {user.cash?.toLocaleString() || 0}
                          {currencyUnit}
                        </span>
                        {previewAmount !== undefined && (
                          <span className={`preview-amount ${action}`}>
                            {action === "send" ? "+" : "−"}
                            {previewAmount.toLocaleString()}
                            {currencyUnit}
                          </span>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="submit"
          className={`submit-btn ${action}`}
          disabled={authLoading || isProcessing}
        >
          {isProcessing ? (
            <>
              <span className="spinner"></span> 처리 중...
            </>
          ) : (
            <>
              <span className="icon">{action === "send" ? "📤" : "📥"}</span>{" "}
              {action === "send" ? "보내기" : "가져오기"} 실행
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default MoneyTransfer;
