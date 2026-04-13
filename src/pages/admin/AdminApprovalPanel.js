// src/pages/admin/AdminApprovalPanel.js
// 할일 승인 관리 패널 - 사이버펑크 테마
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db, functions } from "../../firebase";
import {
  collection as firestoreCollection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { CheckCircle, XCircle, Clock, Filter, CheckSquare, Square } from "lucide-react";
import { logger } from "../../utils/logger";

const AdminApprovalPanel = () => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending, approved, rejected, all
  const [processingId, setProcessingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const processTaskApproval = useMemo(
    () => httpsCallable(functions, "processTaskApproval"),
    []
  );

  // 실시간 구독
  useEffect(() => {
    if (!classCode) return;

    const approvalsRef = firestoreCollection(db, "pendingApprovals");
    let q;

    if (filter === "all") {
      q = query(
        approvalsRef,
        where("classCode", "==", classCode),
        orderBy("requestedAt", "desc")
      );
    } else {
      q = query(
        approvalsRef,
        where("classCode", "==", classCode),
        where("status", "==", filter),
        orderBy("requestedAt", "desc")
      );
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setApprovals(items);
        setLoading(false);
      },
      (error) => {
        logger.error("[AdminApprovalPanel] 구독 오류:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [classCode, filter]);

  const handleAction = useCallback(
    async (approvalId, action) => {
      if (processingId) return;
      setProcessingId(approvalId);

      try {
        const result = await processTaskApproval({ approvalId, action });
        if (result.data.success) {
          alert(result.data.message);
        }
      } catch (error) {
        logger.error("[AdminApprovalPanel] 처리 실패:", error);
        alert(`처리 실패: ${error.message}`);
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, processTaskApproval]
  );

  // 선택 관련
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals]
  );
  const pendingCount = pendingApprovals.length;
  const allPendingSelected =
    pendingCount > 0 && pendingApprovals.every((a) => selectedIds.has(a.id));

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApprovals.map((a) => a.id)));
    }
  }, [allPendingSelected, pendingApprovals]);

  // 필터 변경 시 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  const handleBulkAction = useCallback(
    async (action) => {
      if (bulkProcessing || selectedIds.size === 0) return;
      const label = action === "approve" ? "승인" : "거절";
      if (!window.confirm(`선택한 ${selectedIds.size}건을 일괄 ${label}하시겠습니까?`)) return;

      setBulkProcessing(true);
      let success = 0;
      let fail = 0;

      for (const id of selectedIds) {
        try {
          const result = await processTaskApproval({ approvalId: id, action });
          if (result.data.success) success++;
          else fail++;
        } catch (error) {
          logger.error(`[AdminApprovalPanel] 일괄 ${label} 실패 (${id}):`, error);
          fail++;
        }
      }

      setSelectedIds(new Set());
      setBulkProcessing(false);
      alert(`일괄 ${label} 완료: 성공 ${success}건${fail > 0 ? `, 실패 ${fail}건` : ""}`);
    },
    [bulkProcessing, selectedIds, processTaskApproval]
  );

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filterButtons = [
    { key: "pending", label: "대기중", icon: Clock },
    { key: "approved", label: "승인됨", icon: CheckCircle },
    { key: "rejected", label: "거절됨", icon: XCircle },
    { key: "all", label: "전체", icon: Filter },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* 헤더 - 컴팩트 */}
      <h1
        className="text-lg font-bold mb-4 px-1"
        style={{ color: "var(--text-primary)" }}
      >
        할일 승인 관리
      </h1>

      {/* 필터 버튼 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filterButtons.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor:
                filter === key
                  ? "rgba(99, 102, 241, 0.3)"
                  : "rgba(30, 41, 59, 0.6)",
              border: `1px solid ${filter === key ? "rgba(99, 102, 241, 0.5)" : "rgba(100, 116, 139, 0.2)"}`,
              color: filter === key ? "#818cf8" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            <Icon size={14} />
            {label}
            {key === "pending" && pendingCount > 0 && (
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.3)",
                  color: "#fbbf24",
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 일괄 액션 바 */}
      {filter === "pending" && pendingCount > 0 && (
        <div
          className="flex items-center gap-3 mb-4 p-3 rounded-xl flex-wrap"
          style={{
            backgroundColor: "rgba(30, 41, 59, 0.8)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
          }}
        >
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
            style={{ color: allPendingSelected ? "#818cf8" : "#94a3b8" }}
          >
            {allPendingSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            전체 선택 ({selectedIds.size}/{pendingCount})
          </button>
          <div className="flex-1" />
          <button
            onClick={() => handleBulkAction("approve")}
            disabled={bulkProcessing || selectedIds.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
            style={{
              backgroundColor:
                selectedIds.size > 0
                  ? "rgba(34, 197, 94, 0.25)"
                  : "rgba(34, 197, 94, 0.08)",
              border: `1px solid ${selectedIds.size > 0 ? "rgba(34, 197, 94, 0.5)" : "rgba(34, 197, 94, 0.15)"}`,
              color: selectedIds.size > 0 ? "#4ade80" : "#4ade8066",
              opacity: bulkProcessing ? 0.5 : 1,
            }}
          >
            <CheckCircle size={16} />
            일괄 승인{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
          <button
            onClick={() => handleBulkAction("reject")}
            disabled={bulkProcessing || selectedIds.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
            style={{
              backgroundColor:
                selectedIds.size > 0
                  ? "rgba(239, 68, 68, 0.25)"
                  : "rgba(239, 68, 68, 0.08)",
              border: `1px solid ${selectedIds.size > 0 ? "rgba(239, 68, 68, 0.5)" : "rgba(239, 68, 68, 0.15)"}`,
              color: selectedIds.size > 0 ? "#f87171" : "#f8717166",
              opacity: bulkProcessing ? 0.5 : 1,
            }}
          >
            <XCircle size={16} />
            일괄 거절{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
        </div>
      )}

      {/* 일괄 처리 진행 표시 */}
      {bulkProcessing && (
        <div
          className="mb-4 p-3 rounded-xl text-center text-sm"
          style={{
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            color: "#818cf8",
          }}
        >
          일괄 처리 중... 잠시만 기다려주세요.
        </div>
      )}

      {/* 카드 리스트 */}
      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
          로딩 중...
        </div>
      ) : approvals.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl"
          style={{
            backgroundColor: "rgba(30, 41, 59, 0.6)",
            border: "1px solid rgba(100, 116, 139, 0.15)",
            color: "var(--text-secondary)",
          }}
        >
          {filter === "pending"
            ? "대기 중인 승인 요청이 없습니다."
            : "해당하는 요청이 없습니다."}
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: "rgba(30, 41, 59, 0.6)",
                border: `1px solid ${
                  approval.status === "pending"
                    ? "rgba(245, 158, 11, 0.3)"
                    : approval.status === "approved"
                      ? "rgba(34, 197, 94, 0.2)"
                      : "rgba(239, 68, 68, 0.2)"
                }`,
              }}
            >
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                {/* 체크박스 (대기중만) */}
                {approval.status === "pending" && (
                  <button
                    onClick={() => toggleSelect(approval.id)}
                    className="flex-shrink-0 cursor-pointer"
                    style={{
                      color: selectedIds.has(approval.id)
                        ? "#818cf8"
                        : "#64748b",
                    }}
                  >
                    {selectedIds.has(approval.id) ? (
                      <CheckSquare size={20} />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>
                )}
                {/* 정보 영역 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="font-bold text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {approval.studentName}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor:
                          approval.status === "pending"
                            ? "rgba(245, 158, 11, 0.2)"
                            : approval.status === "approved"
                              ? "rgba(34, 197, 94, 0.2)"
                              : "rgba(239, 68, 68, 0.2)",
                        color:
                          approval.status === "pending"
                            ? "#fbbf24"
                            : approval.status === "approved"
                              ? "#4ade80"
                              : "#f87171",
                      }}
                    >
                      {approval.status === "pending"
                        ? "대기중"
                        : approval.status === "approved"
                          ? "승인됨"
                          : "거절됨"}
                    </span>
                  </div>
                  <p
                    className="text-sm mb-1 truncate"
                    style={{ color: "#c0c0e0" }}
                  >
                    {approval.isJobTask && approval.jobTitle
                      ? `[${approval.jobTitle}] `
                      : ""}
                    {approval.taskName}
                  </p>
                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span>
                      {approval.cardType === "cash"
                        ? `💰 ${approval.rewardAmount?.toLocaleString()}원`
                        : `🎫 ${approval.rewardAmount}쿠폰`}
                    </span>
                    <span>{formatDate(approval.requestedAt)}</span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                {approval.status === "pending" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAction(approval.id, "approve")}
                      disabled={processingId === approval.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                      style={{
                        backgroundColor: "rgba(34, 197, 94, 0.2)",
                        border: "1px solid rgba(34, 197, 94, 0.4)",
                        color: "#4ade80",
                        opacity: processingId === approval.id ? 0.5 : 1,
                      }}
                    >
                      <CheckCircle size={16} />
                      승인
                    </button>
                    <button
                      onClick={() => handleAction(approval.id, "reject")}
                      disabled={processingId === approval.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.2)",
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        color: "#f87171",
                        opacity: processingId === approval.id ? 0.5 : 1,
                      }}
                    >
                      <XCircle size={16} />
                      거절
                    </button>
                  </div>
                )}

                {/* 처리 완료 정보 */}
                {approval.status !== "pending" && approval.processedAt && (
                  <div
                    className="text-xs flex-shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    처리: {formatDate(approval.processedAt)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminApprovalPanel;
