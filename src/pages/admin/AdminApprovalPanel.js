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
import { CheckCircle, XCircle, Clock, Filter } from "lucide-react";
import { logger } from "../../utils/logger";

const AdminApprovalPanel = () => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending, approved, rejected, all
  const [processingId, setProcessingId] = useState(null);

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

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

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
      {/* 헤더 */}
      <div className="mb-6">
        <h1
          className="text-2xl md:text-3xl font-bold mb-2"
          style={{ color: "#e8e8ff" }}
        >
          할일 승인 관리
        </h1>
        <p className="text-sm" style={{ color: "#9999bb" }}>
          학생들의 보너스 할일 완료 요청을 승인하거나 거절합니다.
        </p>
      </div>

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
                  : "rgba(30, 30, 50, 0.6)",
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

      {/* 카드 리스트 */}
      {loading ? (
        <div className="text-center py-12" style={{ color: "#9999bb" }}>
          로딩 중...
        </div>
      ) : approvals.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl"
          style={{
            backgroundColor: "rgba(20, 20, 35, 0.6)",
            border: "1px solid rgba(100, 116, 139, 0.15)",
            color: "#9999bb",
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
                backgroundColor: "rgba(20, 20, 35, 0.6)",
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
                {/* 정보 영역 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="font-bold text-sm"
                      style={{ color: "#e8e8ff" }}
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
                    style={{ color: "#9999bb" }}
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
                    style={{ color: "#9999bb" }}
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
