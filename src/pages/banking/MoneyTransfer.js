// src/MoneyTransfer.js - 서버 응답 기반 상태 업데이트 수정 버전

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { functions, httpsCallable } from "../../firebase";
import "./MoneyTransfer.css";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { logger } from "../../utils/logger";

function MoneyTransfer() {
  // AuthContext에서 필요한 데이터와 함수를 가져옵니다.
  const {
    user,
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
  // 기본 세금 10% (보내기 시 학생은 90% 수령). 마이너스 학생 보충 시 부족분만큼만
  // 보내면 10%가 빠져 1/10이 마이너스로 남으니, 그때는 세금 칸을 0으로 두고 보낼 것.
  const [taxRate, setTaxRate] = useState(10);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // 동기 재진입 가드(더블클릭 이중지급/회수 차단 — isProcessing 상태 반영 갭 보완)
  const submittingRef = useRef(false);
  // 제출 시도별 고정 멱등키: 실패 후 "다시 보내기" 시 같은 키를 재사용해 이미 처리된 학생의
  // 중복 지급/회수를 차단(대상별 서브키 `${key}_${id}`가 서버에서 already-exists로 skip).
  // 성공 시에만 새 키로 교체(다음 별개 작업). 매 제출 새 UUID면 이 보호가 무력화됨.
  const idemKeyRef = useRef(null);

  // 위임 학생인 경우 실제 관리자 정보 사용
  const isDelegated = !userDoc?.isAdmin && !userDoc?.isSuperAdmin && userDoc?.delegatedPermissions?.moneyTransfer;
  const classAdmin = isDelegated
    ? allClassMembers?.find(m => m.isAdmin || m.isSuperAdmin)
    : null;
  // effectiveAdminId(국고 대상)는 서버 CF가 auth·delegatedPermissions에서 파생한다(클라 미신뢰).
  const adminName = isDelegated ? classAdmin?.name : userDoc?.name;
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

  // 🔥 [버그픽스] 학생 목록 새로고침은 학급당 1회만.
  // refreshAllUsers(=refreshClassmates)는 force=true로 전교생을 캐시 무시하고 읽는데,
  // 그 identity가 매 fetch마다 바뀌어(AuthContext의 fetchClassmatesFromFirestore가
  // 자신이 set하는 users/classmates/allClassMembers를 deps로 가짐) effect가 무한 재실행 →
  // 송금 페이지를 켜둔 탭이 전교생 읽기를 끝없이 반복(밤중 읽기 폭주의 정체)했다.
  // ref 가드로 같은 학급은 1회만 새로고침하여 루프를 차단한다.
  const lastRefreshedClassCodeRef = useRef(null);
  useEffect(() => {
    if (!adminClassCode || typeof refreshAllUsers !== "function") return;
    if (lastRefreshedClassCodeRef.current === adminClassCode) return;
    lastRefreshedClassCodeRef.current = adminClassCode;

    refreshAllUsers().catch((refreshError) => {
      logger.warn("[MoneyTransfer] 학생 목록 새로고침 실패:", refreshError);
    });
  }, [adminClassCode, refreshAllUsers]);

  // 금액 타입(고정/퍼센트)이 변경될 때만 선택 초기화 (보내기↔가져오기 전환 시 유지)
  useEffect(() => {
    setSelectedUsers([]);
    setSelectAll(false);
  }, [amountType]);

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

    if (submittingRef.current) return;
    submittingRef.current = true;
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

      // ✨ 서버 CF로 지급/회수 실행(권한·국고 대상은 서버가 auth에서 파생 — adminId/classCode 미신뢰).
      // 멱등키는 이 제출 시도에 고정(실패 재시도 시 재사용해 이미 처리분 중복 방지).
      if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
      const adminCashActionFn = httpsCallable(functions, "adminCashAction");
      const { count, totalProcessed, updatedUsers, failures } = (
        await adminCashActionFn({
          targetUserIds: targetUsersData.map((u) => u.id),
          action,
          takeMode: action === "take" ? takeMode : undefined,
          amountType,
          amount: inputValue,
          taxRate,
          idempotencyKey: idemKeyRef.current,
        })
      ).data;

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

        // 2. 관리자 본인의 잔액 업데이트 (위임 학생이면 본인 잔액은 변경 없음)
        //    ⚠️ send는 학급경제 민팅 모델이라 서버가 관리자 cash를 차감하지 않는다(원본·CF 동일).
        //    과거엔 여기서 -totalProcessed로 낙관 차감했으나, 서버가 관리자 문서를 write하지 않아
        //    onSnapshot이 안 울려 새로고침 전까지 잘못된 값이 남았다(민팅 모델과 모순) → 제거.
        //    take/toMe만 국고(관리자)에 +totalProcessed 적립(서버 increment과 수렴).
        if (!isDelegated && action === "take" && takeMode === "toMe") {
          setUserDoc((currentAdminDoc) => {
            const currentAdminCash = Number(currentAdminDoc.cash || 0);
            return { ...currentAdminDoc, cash: currentAdminCash + totalProcessed };
          });
        }
      }

      // 성공 메시지 설정
      const actionText =
        action === "send"
          ? "보내기"
          : takeMode === "toMe"
            ? "가져오기"
            : "없애기";
      const failCount = Array.isArray(failures) ? failures.length : 0;
      setMessage(
        `${count}명에게 ${amountType === "percentage" ? `${inputValue}%` : `${inputValue.toLocaleString()}${currencyUnit}`} ${actionText} 완료! (총 ${totalProcessed.toLocaleString()}${currencyUnit} 처리${action === "send" && taxRate > 0 ? `, 세금 ${taxRate}% 적용` : ""})${failCount > 0 ? ` · ⚠️ ${failCount}명 처리 실패(다시 시도 시 실패분만 재처리)` : ""}`,
      );

      // 완전 성공일 때만 멱등키를 비우고(다음 별개 작업) 폼을 초기화한다.
      // 부분 성공이면 같은 키·같은 대상 선택을 유지해, "다시 보내기" 시 이미 성공한 대상은
      // 서버 서브키(`${key}_${id}`)의 already-exists로 skip되고 실패분만 재처리된다
      // (키를 매번 리셋하면 재시도 시 성공분까지 이중 지급/회수됨 — 교차검증 지적).
      if (failCount === 0) {
        idemKeyRef.current = null;
        setAmount("");
        setSelectedUsers([]);
        setSelectAll(false);
      }

      setTimeout(() => setMessage(""), failCount > 0 ? 6000 : 3000);
    } catch (err) {
      logger.error("처리 중 오류 발생:", err);
      setError(`오류가 발생했습니다: ${err.message}`);
      // 오류 발생 시에는 데이터를 다시 불러오는 것이 가장 정확하지만,
      // Firestore 사용 최소화를 위해 여기서는 에러 메시지만 표시합니다.
      setTimeout(() => setError(""), 5000);
    } finally {
      setIsProcessing(false);
      submittingRef.current = false;
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

  // 관리자 또는 위임된 학생이 아닌 경우 접근 제한
  const isAdminUser = userDoc?.isAdmin || userDoc?.isSuperAdmin;
  const hasDelegatedMoneyPermission = userDoc?.delegatedPermissions?.moneyTransfer === true;
  if (!isAdminUser && !hasDelegatedMoneyPermission) {
    return (
      <div className="money-transfer-container">
        <div style={{padding:'40px',textAlign:'center',color:'#f87171'}}>
          권한이 없습니다. 관리자 또는 위임된 학생만 사용할 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="money-transfer-container">
      <div className="header">
        <div className="admin-info">
          <span className="admin-label">{isDelegated ? "위임 실행" : "관리자"}</span>
          <span className="admin-name">{isDelegated ? `${userDoc?.name} (위임: ${adminName})` : (adminName || "로딩 중...")}</span>
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

        {/* 상단 실행 버튼 */}
        <button
          type="submit"
          className={`submit-btn ${action}`}
          disabled={authLoading || isProcessing}
          style={{ marginBottom: '16px' }}
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

        {/* 금액 + 세금 한 줄 배치 — 외곽 카드 제거(카드 안에 카드 방지), 간격으로만 구분 */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
          {/* 금액 설정 */}
          <div style={{ flex: '1 1 260px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="amount-type-selector" style={{ margin: 0, justifyContent: 'flex-start' }}>
              <label className={`type-option ${amountType === "fixed" ? "active" : ""}`}>
                <input type="radio" name="amountType" value="fixed" checked={amountType === "fixed"} onChange={(e) => setAmountType(e.target.value)} />
                <span className="radio-custom"></span> 고정 금액
              </label>
              <label className={`type-option ${amountType === "percentage" ? "active" : ""}`}>
                <input type="radio" name="amountType" value="percentage" checked={amountType === "percentage"} onChange={(e) => setAmountType(e.target.value)} />
                <span className="radio-custom"></span> 퍼센트 (%)
              </label>
            </div>
            <div className="amount-input-group">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={amountType === "fixed" ? "금액 입력" : "퍼센트 입력"} min="1" max={amountType === "percentage" ? "100" : undefined} required className="amount-input" />
              <span className="amount-unit">{amountType === "fixed" ? currencyUnit : "%"}</span>
            </div>
          </div>

          {/* 세금 설정 (보내기일 때만) */}
          {action === "send" && (
            <div style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="taxRate" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>💸 세금</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #e0e7ff', borderRadius: '10px', padding: '0 12px', height: '44px' }}>
                <input type="number" id="taxRate" value={taxRate} onChange={(e) => setTaxRate(Math.max(0, Math.min(100, Number(e.target.value))))} min="0" max="100" className="tax-input" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '15px', fontWeight: 600 }} />
                <span style={{ fontWeight: 600, color: '#64748b' }}>%</span>
              </div>
            </div>
          )}
        </div>

        {/* 세금 미리보기 */}
        {action === "send" && amount && (
          <div className="tax-preview" style={{ marginBottom: '16px', padding: '10px 14px', background: 'var(--accent-bg)', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border-accent)' }}>
            {amountType === "fixed" ? (
              <>
                실제 지급액: {calculatePreviewAmount(0, amount, true).toLocaleString()}{currencyUnit}
                (세금 {Math.floor((Number(amount) * taxRate) / 100).toLocaleString()}{currencyUnit} 제외)
              </>
            ) : (
              `각 학생 잔액의 ${amount}%에서 세금 ${taxRate}%가 추가로 차감됩니다.`
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

      </form>
    </div>
  );
}

export default MoneyTransfer;
