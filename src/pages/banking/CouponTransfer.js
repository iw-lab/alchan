// src/CouponTransfer.js - 로컬 상태 업데이트로 Firestore 사용량 최적화

import React, { useState, useEffect, useRef } from "react";
import { db, functions, httpsCallable } from "../../firebase";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import pageCss from "./CouponTransfer.css?inline";
import { usePageCss } from "../../hooks/usePageCss";
import { logger } from '../../utils/logger';
import { sortByStudentNumber, plainStudentName } from '../../utils/studentOrder';
import StudentNo from '../../components/ui/StudentNo';
import useAppointedJobTitle from '../../hooks/useAppointedJobTitle';

function CouponTransfer() {
  usePageCss(pageCss);
  // AuthContext에서 필요한 모든 데이터를 가져옵니다.
  const {
    userDoc,
    allClassMembers, // 전체 학급 구성원
    loading: authLoading,
    addCouponsToUserById,
    deductCouponsFromUserById,
    // 로컬 상태만 업데이트하는 함수 (있다면)
  } = useAuth();

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // 대량 작업 관련 상태 변수
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [couponAmount, setCouponAmount] = useState("");
  const [amountType, setAmountType] = useState("fixed");
  const [action, setAction] = useState("send");
  const [takeAction, setTakeAction] = useState("delete");
  const [selectAll, setSelectAll] = useState(false);
  
  // 로컬 사용자 데이터 상태 (실시간 업데이트용)
  const [localUsers, setLocalUsers] = useState([]);
  const [localUserDoc, setLocalUserDoc] = useState(null);

  const isAdmin = userDoc?.isAdmin || false;
  // 위임받은 학생 또는 교사가 임명한 대통령(2026-11-17) — 쿠폰은 rules 상 교사만 직접 쓸 수 있어 이 둘은 서버(adminCouponAction)로 처리한다
  const isAppointedPresident = useAppointedJobTitle(userDoc, "대통령");
  const isDelegated = !isAdmin && (userDoc?.delegatedPermissions?.couponTransfer === true || isAppointedPresident);
  const idemKeyRef = useRef(null); // 같은 요청을 두 번 눌러도 한 번만 — 성공하면 비운다
  const classAdmin = isDelegated
    ? allClassMembers?.find(m => m.isAdmin || m.isSuperAdmin)
    : null;
  const adminName = isDelegated ? classAdmin?.name : userDoc?.name;
  const adminId = isDelegated ? classAdmin?.id : userDoc?.uid;
  const adminClassCode = userDoc?.classCode;

  // 초기 데이터 설정 — 학번 순(utils/studentOrder)
  useEffect(() => {
    if (allClassMembers) {
      setLocalUsers(sortByStudentNumber(allClassMembers));
    }
  }, [allClassMembers]);

  // userDoc 변경 시 로컬 상태 업데이트
  useEffect(() => {
    if (userDoc) {
      setLocalUserDoc(userDoc);
    }
  }, [userDoc]);

  // 화면에 표시할 사용자 목록 (로컬 상태 우선 사용)
  const users = localUsers.length > 0 ? localUsers : sortByStudentNumber(allClassMembers);

  // 화면에 표시할 현재 사용자 정보 (로컬 상태 우선 사용)
  const displayUserDoc = localUserDoc || userDoc;

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    setSelectedUsers([]);
    setCouponAmount("");
    setMessage("");
    setError("");
    setSelectAll(false);
  }, []);

  // --- 대량 작업 관련 함수들 ---
  const handleUserSelection = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    setSelectAll(!selectAll);
    if (!selectAll) {
      setSelectedUsers(users.map((user) => user.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const calculateAmount = (userCoupons, inputValue) => {
    if (amountType === "percentage") {
      return Math.floor((userCoupons * Number(inputValue)) / 100);
    }
    return Number(inputValue);
  };

  const getPreviewAmounts = () => {
    if (!couponAmount || selectedUsers.length === 0) return {};
    const preview = {};
    selectedUsers.forEach((userId) => {
      const user = users.find((u) => u.id === userId);
      if (user) {
        const calculatedAmount = calculateAmount(
          Number(user.coupons || 0),
          couponAmount
        );
        preview[userId] = calculatedAmount;
      }
    });
    return preview;
  };

  // 로컬 상태 업데이트 함수
  const updateLocalState = (userId, couponChange) => {
    // 사용자 목록 업데이트
    setLocalUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === userId 
          ? { ...user, coupons: Math.max(0, (user.coupons || 0) + couponChange) }
          : user
      )
    );
    
    // 관리자 정보 업데이트 (필요한 경우)
    if (userId === adminId) {
      setLocalUserDoc(prev => ({
        ...prev,
        coupons: Math.max(0, (prev?.coupons || 0) + couponChange)
      }));
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUsers.length || !couponAmount || isNaN(Number(couponAmount))) {
      setError("사용자를 선택하고 유효한 값을 입력하세요.");
      return;
    }
    
    setIsProcessing(true);
    setMessage("");
    setError("");

    try {
      if (!isAdmin) { // 위임·대통령 — 서버가 권한·0개 바닥·멱등·기록을 맡는다
        const req = { targetUserIds: [...selectedUsers].sort(), action, takeMode: action === "take" ? (takeAction === "transfer" ? "toMe" : "remove") : undefined, amountType, amount: Number(couponAmount) };
        const sig = JSON.stringify(req); // 입력이 바뀌면 새 요청 번호 — 옛 번호를 쓰면 바뀐 요청의 학생이 «이미 처리됨»으로 빠진다(8way codex·gemini)
        if (!idemKeyRef.current || idemKeyRef.current.sig !== sig) idemKeyRef.current = { key: crypto.randomUUID(), sig };
        const r = await httpsCallable(functions, "adminCouponAction")({ ...req, idempotencyKey: idemKeyRef.current.key });
        const d = r.data || {};
        setLocalUsers((prev) => prev.map((u) => { const hit = (d.updatedUsers || []).find((x) => x.id === u.id); return hit ? { ...u, coupons: hit.newCoupons } : u; }));
        const extra = [d.alreadyCount ? `이미 처리됨 ${d.alreadyCount}명` : "", d.noBalanceCount ? `쿠폰이 없어 건너뜀 ${d.noBalanceCount}명` : "", d.clampedCount ? `가진 만큼만 ${d.clampedCount}명` : "", d.failures?.length ? `실패 ${d.failures.length}명(${d.failures.map((f) => f.reason).filter((v, i, a) => a.indexOf(v) === i).join(", ")})` : ""].filter(Boolean).join(" · ");
        if (!d.failures?.length) idemKeyRef.current = null; // 실패가 있으면 같은 요청 그대로 다시 눌러 실패한 학생만
        if (!d.count && !d.alreadyCount && d.failures?.length) { setError(`쿠폰을 처리하지 못했어요 — ${extra}`); setTimeout(() => setError(""), 6000); return; }
        setMessage(`${d.count || 0}명 쿠폰 처리 완료 (총 ${(d.totalProcessed || 0).toLocaleString()}개)${extra ? ` — ${extra}` : ""}`);
        if (!d.failures?.length) { setCouponAmount(""); setSelectedUsers([]); setSelectAll(false); }
        setTimeout(() => setMessage(""), 5000);
        return;
      }
      const batch = writeBatch(db);
      let successCount = 0;
      let totalAmount = 0;
      const updateQueue = []; // 로컬 업데이트를 위한 큐

      for (const userId of selectedUsers) {
        const userToUpdate = users.find((user) => user.id === userId);
        if (!userToUpdate) continue;

        const currentCoupons = Number(userToUpdate.coupons || 0);
        const transferAmount = calculateAmount(currentCoupons, couponAmount);
        totalAmount += transferAmount;

        try {
          if (action === "send") {
            // 쿠폰 지급
            await addCouponsToUserById(userId, transferAmount);
            updateQueue.push({ userId, change: transferAmount });
          } else { // 'take'
            if (takeAction === "transfer") {
              // 사용자에게서 차감하고 관리자에게 추가
              await deductCouponsFromUserById(userId, transferAmount);
              await addCouponsToUserById(adminId, transferAmount);
              updateQueue.push({ userId, change: -transferAmount });
              updateQueue.push({ userId: adminId, change: transferAmount });
            } else { // 'delete'
              // 사용자에게서만 차감
              await deductCouponsFromUserById(userId, transferAmount);
              updateQueue.push({ userId, change: -transferAmount });
            }
          }

          // 로그 기록
          const logRef = doc(collection(db, "activity_logs"));
          const logActionDetail = action === "send" 
            ? "대량 지급" 
            : takeAction === "transfer" 
              ? "대량 회수(관리자 이전)" 
              : "대량 삭제";
          
          const logDetails = `관리자(${adminName})가 ${userToUpdate.name}님에게 쿠폰 ${transferAmount.toLocaleString()}개를 ${logActionDetail}했습니다. (${amountType === 'percentage' ? `${couponAmount}% 적용` : '고정 개수'})`;
          
          batch.set(logRef, {
            userId,
            userName: userToUpdate.name,
            timestamp: serverTimestamp(),
            type: "couponAdminAction",
            description: logDetails,
            classCode: adminClassCode,
            adminId,
            adminName
          });

          successCount++;
        } catch (userError) {
          logger.error(`사용자 ${userId} 처리 중 오류:`, userError);
        }
      }

      await batch.commit();

      // 로컬 상태 즉시 업데이트 (Firestore 읽기 없이)
      updateQueue.forEach(({ userId, change }) => {
        updateLocalState(userId, change);
      });

      setMessage(`${successCount}명에게 쿠폰 처리가 완료되었습니다. (총 ${totalAmount.toLocaleString()}개)`);
      setCouponAmount("");
      setSelectedUsers([]);
      setSelectAll(false);
      
      // 성공 메시지를 3초 후 자동 제거
      setTimeout(() => setMessage(""), 3000);
      
    } catch (err) {
      logger.error("대량 처리 중 오류:", err);
      setError(`오류 발생: ${err.message}`);
      
      // 오류 메시지를 5초 후 자동 제거
      setTimeout(() => setError(""), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  // 관리자 또는 위임된 학생이 아닌 경우 접근 제한
  const hasDelegatedCouponPermission = userDoc?.delegatedPermissions?.couponTransfer === true || isAppointedPresident;
  if (!isAdmin && !hasDelegatedCouponPermission) {
    return (
      <div className="coupon-transfer-container">
        <div className="alert alert-error">
          권한이 없습니다. 관리자, 위임받은 학생, 임명된 대통령만 사용할 수 있습니다.
        </div>
      </div>
    );
  }

  if (authLoading && users.length === 0) {
    return (
      <div className="coupon-transfer-container">
        <div className="loading">데이터를 불러오는 중입니다...</div>
      </div>
    );
  }
  
  const previewAmounts = getPreviewAmounts();
  
  return (
    <div className="coupon-transfer-container">
      <div className="header">
        <h3>쿠폰 대량 관리</h3>
        <div className="admin-info">
          <span className="admin-label">{isDelegated ? `${userDoc?.name} (위임: ${adminName})` : (displayUserDoc?.name || "사용자")}</span>
        </div>
      </div>
      
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={handleBulkSubmit} className="transfer-form">
        <div className="action-selector">
          <button 
            type="button" 
            className={`action-btn ${action === "send" ? "active send" : ""}`} 
            onClick={() => setAction("send")}
          >
            📤 보내기
          </button>
          <button 
            type="button" 
            className={`action-btn ${action === "take" ? "active take" : ""}`} 
            onClick={() => setAction("take")}
          >
            📥 가져오기
          </button>
        </div>
        
        {action === 'take' && (
          <div className="amount-type-selector" style={{ margin: "10px 0" }}>
            <label className={`type-option ${takeAction === 'delete' ? 'active' : ''}`}>
              <input 
                type="radio" 
                value="delete" 
                checked={takeAction === 'delete'} 
                onChange={(e) => setTakeAction(e.target.value)} 
              /> 
              삭제하기
            </label>
            <label className={`type-option ${takeAction === 'transfer' ? 'active' : ''}`}>
              <input 
                type="radio" 
                value="transfer" 
                checked={takeAction === 'transfer'} 
                onChange={(e) => setTakeAction(e.target.value)} 
              /> 
              {isDelegated ? `국고(${adminName || "선생님"})로 가져오기` : "나에게 가져오기"}
            </label>
          </div>
        )}
        
        <div className="amount-section">
          <div className="amount-type-selector">
            <label className={`type-option ${amountType === 'fixed' ? 'active' : ''}`}>
              <input 
                type="radio" 
                value="fixed" 
                checked={amountType === 'fixed'} 
                onChange={(e) => setAmountType(e.target.value)} 
              /> 
              고정 개수
            </label>
            <label className={`type-option ${amountType === 'percentage' ? 'active' : ''}`}>
              <input 
                type="radio" 
                value="percentage" 
                checked={amountType === 'percentage'} 
                onChange={(e) => setAmountType(e.target.value)} 
              /> 
              퍼센트 (%)
            </label>
          </div>
          <div className="amount-input-group">
            <input 
              type="number" 
              value={couponAmount} 
              onChange={(e) => setCouponAmount(e.target.value)} 
              placeholder={amountType === 'fixed' ? '쿠폰 개수' : '퍼센트'} 
              min="1" 
              required 
              className="amount-input"
            />
            <span className="amount-unit">{amountType === 'fixed' ? '개' : '%'}</span>
          </div>
        </div>
        
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
              <span className="checkmark"></span>
              전체 선택
            </label>
          </div>
          <div className="user-list">
            {users.map(user => (
              <div key={user.id} className="user-item">
                <label className="user-label">
                  <input 
                    type="checkbox" 
                    className="checkbox-custom"
                    checked={selectedUsers.includes(user.id)} 
                    onChange={() => handleUserSelection(user.id)} 
                  />
                  <span className="checkmark"></span>
                  <StudentNo member={user} size="xl" />
                  <div className="user-info">
                    <span className="user-name">{plainStudentName(user)}</span>
                    <span className="user-balance">쿠폰: {user.coupons?.toLocaleString() || 0}개</span>
                    {previewAmounts[user.id] !== undefined && (
                      <span className={`preview-amount ${action}`}>
                        {action === 'send' ? '+' : '-'}{previewAmounts[user.id].toLocaleString()}개
                      </span>
                    )}
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
        <button 
          type="submit" 
          className={`submit-btn ${action}`} 
          disabled={isProcessing}
        >
          {isProcessing ? '처리 중...' : '실행'}
        </button>
      </form>

      {/* '학급 사용자 목록'을 여기서 한 번 더 그리고 있었다 — 바로 위 '대상 선택'이
          같은 학생을 같은 순서로 쿠폰 수까지 붙여 이미 보여준다. 21명 학급에서 화면이
          두 배로 길어지기만 했다(돈 보내기 페이지엔 원래 없다). 현금은 쿠폰 페이지에서
          쓰지 않는 정보라 함께 정리한다. */}
    </div>
  );
}

export default CouponTransfer;