// src/pages/admin/JobApplicationsPanel.js
// 직업 신청 승인 패널 — 학생이 신청한 직업을 선생님이 하나씩 허가/거절한다.
//
// 쿼리는 데이터 계층(src/firebase/db/jobApplications.js)에 가둔다 — 화면이 Firestore 를
// 직접 부르지 않는다는 저장소 규약(`npm run debt` 천장). 그 파일에 인덱스 제약도 적어 뒀다:
// 복합 인덱스가 없어서 orderBy 를 못 쓰므로 **정렬은 여기서** 한다(대기 목록은 작다).
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { functions } from "../../firebase";
import { subscribeToJobApplications } from "../../firebase/db/jobApplications";
import { httpsCallable } from "firebase/functions";
import { CheckCircle, XCircle, Clock, Briefcase } from "lucide-react";
import { logger } from "../../utils/logger";
import { toast } from "../../utils/toast";

const FILTERS = [
  { key: "pending", label: "대기중", icon: Clock },
  { key: "approved", label: "허가함", icon: CheckCircle },
  { key: "rejected", label: "거절함", icon: XCircle },
];

const JobApplicationsPanel = () => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;
  const myUid = userDoc?.id;

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processingId, setProcessingId] = useState(null);

  const processJobApplication = useMemo(
    () => httpsCallable(functions, "processJobApplication"),
    [],
  );

  useEffect(() => {
    if (!classCode) return undefined;

    setLoading(true);
    const unsubscribe = subscribeToJobApplications(
      classCode,
      filter,
      (items) => {
        // 최신순 정렬은 여기서 — 쿼리에 orderBy 를 넣으면 복합 인덱스가 필요해진다.
        const sorted = [...items].sort((a, b) => {
          const ta = a.requestedAt?.toMillis?.() ?? 0;
          const tb = b.requestedAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setApplications(sorted);
        setLoading(false);
      },
      () => {
        setApplications([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [classCode, filter]);

  const handleAction = useCallback(
    async (applicationId, action) => {
      if (processingId) return;
      setProcessingId(applicationId);
      try {
        const result = await processJobApplication({ applicationId, action });
        if (result?.data?.success) {
          toast.success(result.data.message || "처리했습니다.");
        }
      } catch (error) {
        logger.error("[JobApplicationsPanel] 처리 실패:", error);
        toast.error(`처리 실패: ${error.message}`);
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, processJobApplication],
  );

  // 학생별로 묶어 보여준다 — 학기 초에 한꺼번에 몰리면 같은 학생 신청이 흩어져 보이면
  // 선생님이 "이 아이에게 몇 개를 주는 중인지" 판단할 수 없다.
  const grouped = useMemo(() => {
    const byStudent = new Map();
    for (const a of applications) {
      const key = a.studentId || "(알 수 없음)";
      if (!byStudent.has(key)) {
        byStudent.set(key, { studentId: key, studentName: a.studentName || "학생", items: [] });
      }
      byStudent.get(key).items.push(a);
    }
    return [...byStudent.values()];
  }, [applications]);

  if (!classCode) {
    return <p className="text-sm text-slate-500 px-1">학급 정보가 없습니다.</p>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: filter === key ? "rgba(99, 102, 241, 0.15)" : "#ffffff",
              border: `1px solid ${filter === key ? "rgba(99, 102, 241, 0.4)" : "#e2e8f0"}`,
              color: filter === key ? "#4f46e5" : "#64748b",
              cursor: "pointer",
            }}
          >
            <Icon size={14} />
            {label}
            {key === "pending" && applications.length > 0 && filter === "pending" && (
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#b45309" }}
              >
                {applications.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500 px-1">불러오는 중...</p>}

      {!loading && applications.length === 0 && (
        <div
          className="rounded-xl p-6 text-center text-sm"
          style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", color: "#64748b" }}
        >
          {filter === "pending"
            ? "기다리는 직업 신청이 없어요."
            : "해당하는 신청이 없어요."}
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <div
            key={g.studentId}
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
          >
            <div
              className="px-4 py-2.5 text-sm font-bold flex items-center gap-2"
              style={{ borderBottom: "1px solid #f1f5f9", color: "#334155" }}
            >
              <Briefcase size={15} style={{ color: "#6366f1" }} />
              {g.studentName}
              <span className="text-xs font-normal" style={{ color: "#94a3b8" }}>
                {g.items.length}개
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "#f1f5f9" }}>
              {g.items.map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="text-sm flex-1" style={{ color: "#334155" }}>
                    {a.jobTitle || "직업"}
                    {/* 🏷️ 권한이 붙는 자리(대통령·판사·경찰청장·국세청 직원 등)는 눈에 띄게 —
                        허가 한 번이 합의금·세금 징수 권한을 준다. 표시는 신청 시점 값이고,
                        실제 부여 판정은 서버가 승인 순간에 직업 문서를 다시 읽어서 한다.
                        ⚠️ 배지 문구는 '임명'이었다(2026-08-29 변경). 이제 모든 직업이
                           신청→허가라 '임명'은 구분이 아니고, 여기서 알려야 할 것은
                           **이 허가가 권한을 준다**는 사실 하나다. */}
                    {a.appointedOnly === true && (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded text-[11px] font-bold align-middle"
                        style={{ backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#b45309" }}
                      >
                        권한
                      </span>
                    )}
                  </span>
                  {filter === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(a.id, "approve")}
                        disabled={processingId === a.id || a.studentId === myUid}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                        style={{
                          backgroundColor: "rgba(34, 197, 94, 0.12)",
                          color: "#15803d",
                          cursor: processingId === a.id ? "wait" : "pointer",
                        }}
                      >
                        허가
                      </button>
                      <button
                        onClick={() => handleAction(a.id, "reject")}
                        disabled={processingId === a.id || a.studentId === myUid}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                        style={{
                          backgroundColor: "rgba(239, 68, 68, 0.10)",
                          color: "#b91c1c",
                          cursor: processingId === a.id ? "wait" : "pointer",
                        }}
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: "#94a3b8" }}>
                      {filter === "approved" ? "허가함" : "거절함"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default JobApplicationsPanel;
