// src/pages/admin/AdminPermissionManager.js
// 학생 권한 위임 관리 - 선생님이 학생에게 관리 기능을 부여
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { Shield, CheckCircle, Search, Users } from "lucide-react";
import { logger } from "../../utils/logger";

// 위임 가능한 권한 목록
const PERMISSION_TYPES = [
  {
    key: "taskApproval",
    label: "할일 승인",
    description: "학생들의 보너스 할일 완료 요청을 승인/거절할 수 있습니다.",
  },
  {
    key: "moneyTransfer",
    label: "돈 보내기/가져오기",
    description: "학생들에게 돈을 보내거나 가져올 수 있습니다.",
  },
  {
    key: "couponTransfer",
    label: "쿠폰 보내기/가져오기",
    description: "학생들에게 쿠폰을 보내거나 가져올 수 있습니다.",
  },
];

const AdminPermissionManager = () => {
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // saving studentId
  const [searchTerm, setSearchTerm] = useState("");

  // 학생 목록 로드
  const fetchStudents = useCallback(async () => {
    if (!classCode) return;
    setLoading(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("classCode", "==", classCode),
        where("isAdmin", "==", false),
      );
      const snapshot = await getDocs(q);
      const studentList = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !u.isSuperAdmin)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setStudents(studentList);
    } catch (error) {
      logger.error("[AdminPermissionManager] 학생 목록 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  }, [classCode]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // 권한 토글
  const togglePermission = useCallback(
    async (studentId, permKey, currentValue) => {
      setSaving(studentId);
      try {
        const userRef = doc(db, "users", studentId);
        await updateDoc(userRef, {
          [`delegatedPermissions.${permKey}`]: !currentValue,
        });
        // 로컬 상태 업데이트
        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  delegatedPermissions: {
                    ...s.delegatedPermissions,
                    [permKey]: !currentValue,
                  },
                }
              : s,
          ),
        );
      } catch (error) {
        logger.error("[AdminPermissionManager] 권한 변경 실패:", error);
        alert("권한 변경에 실패했습니다.");
      } finally {
        setSaving(null);
      }
    },
    [],
  );

  // 검색 필터
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.number?.toString() || "").includes(term),
    );
  }, [students, searchTerm]);

  // 위임된 학생 수
  const delegatedCount = useMemo(
    () =>
      students.filter((s) =>
        PERMISSION_TYPES.some((p) => s.delegatedPermissions?.[p.key] === true),
      ).length,
    [students],
  );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* 헤더 - 컴팩트 */}
      <div className="mb-4 px-1">
        <h1 className="text-lg font-bold flex items-center gap-2 text-slate-800">
          <Shield size={18} />
          권한 위임 관리
          {delegatedCount > 0 && (
            <span className="text-xs font-medium text-indigo-600">
              · 위임 {delegatedCount}명
            </span>
          )}
        </h1>
      </div>

      {/* 검색 */}
      <div
        className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <Search size={16} className="text-slate-400" />
        <input
          type="text"
          placeholder="학생 이름 또는 번호 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none text-sm flex-1 text-slate-800 placeholder:text-slate-400"
        />
      </div>

      {/* 권한 설명 */}
      <div
        className="mb-4 p-3 rounded-xl"
        style={{
          backgroundColor: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
        }}
      >
        {PERMISSION_TYPES.map((perm) => (
          <div key={perm.key} className="flex items-start gap-2">
            <CheckCircle
              size={14}
              className="mt-0.5 flex-shrink-0 text-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">
                {perm.label}
              </span>
              <span className="text-xs ml-2 text-slate-500">
                — {perm.description}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 학생 리스트 */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">
          학생 목록을 불러오는 중...
        </div>
      ) : filteredStudents.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl text-slate-500"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <Users size={32} className="mx-auto mb-2 opacity-50" />
          {searchTerm ? "검색 결과가 없습니다." : "학생이 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStudents.map((student) => {
            const hasDelegation = PERMISSION_TYPES.some(
              (p) => student.delegatedPermissions?.[p.key] === true,
            );
            return (
              <div
                key={student.id}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "#ffffff",
                  border: `1px solid ${
                    hasDelegation
                      ? "rgba(99, 102, 241, 0.35)"
                      : "#e2e8f0"
                  }`,
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div className="p-3 flex items-center gap-3">
                  {/* 학생 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">
                        {student.number ? `${student.number}번 ` : ""}
                        {student.name || "이름 없음"}
                      </span>
                      {student.job && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#b45309",
                          }}
                        >
                          {student.job}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 권한 토글 */}
                  {PERMISSION_TYPES.map((perm) => {
                    const isEnabled =
                      student.delegatedPermissions?.[perm.key] === true;
                    const isSavingThis = saving === student.id;
                    return (
                      <button
                        key={perm.key}
                        onClick={() =>
                          togglePermission(student.id, perm.key, isEnabled)
                        }
                        disabled={isSavingThis}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                        style={{
                          backgroundColor: isEnabled
                            ? "rgba(34, 197, 94, 0.12)"
                            : "#f8fafc",
                          border: `1px solid ${
                            isEnabled
                              ? "rgba(34, 197, 94, 0.45)"
                              : "#e2e8f0"
                          }`,
                          color: isEnabled ? "#15803d" : "#64748b",
                          opacity: isSavingThis ? 0.5 : 1,
                        }}
                      >
                        <CheckCircle size={14} />
                        {perm.label}
                        {isEnabled ? " ON" : " OFF"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPermissionManager;
