// src/DonationHistoryModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { useState, useEffect, memo } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { logger } from "../../utils/logger";
const DonationHistoryModal = memo(function DonationHistoryModal({
  showDonationHistoryModal,
  setShowDonationHistoryModal,
  students = [],
  classCode,
  donations = [],
}) {
  const { user, userDoc } = useAuth();
  const userId = user?.uid;
  const userClassCode = userDoc?.classCode || classCode;

  const [studentDonationSummary, setStudentDonationSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalDonationForThisClassGoal, setTotalDonationForThisClassGoal] = useState(0);

  // 스타일은 Tailwind 클래스로 변환됨

  const tableStyles = {
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "14px",
      borderRadius: "8px",
      overflow: "hidden",
      border: "1px solid #e5e7eb",
    },
    thead: {
      backgroundColor: "#f3f4f6",
    },
    th: {
      padding: "12px 16px",
      textAlign: "left",
      fontWeight: "600",
      color: "#374151",
      borderBottom: "1px solid #d1d5db",
      position: "sticky",
      top: 0,
      backgroundColor: "#f3f4f6",
      zIndex: 1,
    },
    td: {
      padding: "12px 16px",
      borderBottom: "1px solid #e5e7eb",
      color: "#4b5563",
    },
    tr: {
      transition: "background-color 0.2s",
    },
    emptyContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      backgroundColor: "#f9fafb",
      borderRadius: "8px",
      border: "1px dashed #d1d5db",
      textAlign: "center",
      color: "#6b7280",
    },
    emptyIcon: {
      fontSize: "36px",
      marginBottom: "16px",
      color: "#9ca3af",
    },
  };

  useEffect(() => {
    if (showDonationHistoryModal) {
      const processDonationData = () => {
        setLoading(true);
        setError(null);
        setStudentDonationSummary([]);
        setTotalDonationForThisClassGoal(0);

        logger.log("[DonationHistoryModal] 데이터 처리 시작:", {
          userClassCode,
          studentsCount: students.length,
          donationsCount: donations.length,
          students: students.map(s => ({ 
            id: s.id || s.uid, 
            name: s.name || s.nickname,
            classCode: s.classCode 
          })),
          donations: donations
        });

        if (!userClassCode) {
          setError("학급 정보를 확인할 수 없어 기부 내역을 처리할 수 없습니다.");
          setLoading(false);
          return;
        }

        try {
          const classDonations = donations || [];
          const validStudents = Array.isArray(students) ? students : [];

          const donationsByStudent = {};
          let currentClassGoalTotal = 0;

          // 모든 기부 기록을 처리하여 학생별 기부액과 총 기부액을 계산
          classDonations.forEach((donation) => {
            const amount = Number(donation.amount) || 0;
            const donorId = donation.userId;
            const donorName = donation.userName || donation.name || "알 수 없는 사용자";

            if (donorId) {
              if (!donationsByStudent[donorId]) {
                donationsByStudent[donorId] = {
                  amount: 0,
                  name: donorName
                };
              }
              donationsByStudent[donorId].amount += amount;
              // 이름 업데이트 (가장 최신 이름 사용)
              if (donorName && donorName !== "알 수 없는 사용자") {
                donationsByStudent[donorId].name = donorName;
              }
            }
            currentClassGoalTotal += amount;
          });

          setTotalDonationForThisClassGoal(currentClassGoalTotal);

          logger.log("[DonationHistoryModal] 기부 집계:", {
            donationsByStudent,
            totalAmount: currentClassGoalTotal,
            uniqueDonors: Object.keys(donationsByStudent).length
          });

          // 🔥 수정: students 배열의 모든 학생 포함 + donations에만 있는 사용자도 포함
          const allStudentIds = new Set();

          // students 배열의 모든 학생 추가
          validStudents.forEach(student => {
            const studentId = student.id || student.uid || student.userId;
            if (studentId) {
              allStudentIds.add(studentId);
            }
          });

          // donations에만 있는 사용자 추가
          Object.keys(donationsByStudent).forEach(donorId => {
            allStudentIds.add(donorId);
          });

          // 학생 정보를 담을 Map 생성
          const studentInfoMap = new Map();

          // students 배열에서 학생 정보 추가
          validStudents.forEach(student => {
            const studentId = student.id || student.uid || student.userId;
            const studentName = student.name || student.nickname || "알 수 없는 학생";
            if (studentId) {
              studentInfoMap.set(studentId, studentName);
            }
          });

          // donations에서 이름 정보 추가 (우선순위: donations의 userName)
          Object.keys(donationsByStudent).forEach(donorId => {
            if (!studentInfoMap.has(donorId) || donationsByStudent[donorId].name !== "알 수 없는 사용자") {
              studentInfoMap.set(donorId, donationsByStudent[donorId].name);
            }
          });

          // 모든 학생 목록 생성 (기부 0원 학생 포함)
          const summary = Array.from(allStudentIds)
            .map((studentId) => {
              const studentName = studentInfoMap.get(studentId) || "알 수 없는 학생";
              const donationAmount = donationsByStudent[studentId]?.amount || 0;
              const isCurrentUser = userId && studentId === userId;

              return {
                id: studentId,
                name: studentName,
                cumulativeAmount: donationAmount,
                isCurrentUser: isCurrentUser,
              };
            })
            // 이름 기준으로 가나다순 정렬 (ㄱ, ㄴ, ㄷ 순)
            .sort((a, b) => a.name.localeCompare(b.name, "ko"));

          logger.log("[DonationHistoryModal] 최종 학생 목록:", {
            totalStudents: summary.length,
            studentsWithDonations: summary.filter(s => s.cumulativeAmount > 0).length,
            summary
          });

          setStudentDonationSummary(summary);
        } catch (err) {
          logger.error("[DonationHistoryModal] 기부 내역 처리 중 오류:", err);
          setError("기부 내역을 처리하는 중 오류가 발생했습니다.");
        } finally {
          setLoading(false);
        }
      };

      processDonationData();
    }
  }, [showDonationHistoryModal, students, userId, userClassCode, donations]);

  const handleClose = () => {
    setShowDonationHistoryModal(false);
  };

  const formatAmount = (amount) => {
    if (typeof amount !== "number" || isNaN(amount)) return "0";
    return amount.toLocaleString();
  };

  const myTotalDonation =
    studentDonationSummary.find((s) => s.isCurrentUser)?.cumulativeAmount || 0;

  return (
    <div className={`${showDonationHistoryModal ? 'flex' : 'hidden'} fixed inset-0 bg-black/50 items-center justify-center z-[1000] p-5`} onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="m-0 text-lg font-semibold text-gray-800">
            우리 학급 기부 현황
            {userClassCode && (
              <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-xl font-medium">
                {userClassCode}
              </span>
            )}
          </h3>
          <button
            onClick={handleClose}
            className="bg-transparent border-0 cursor-pointer text-xl text-gray-400 p-0 leading-none"
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)]">
          <div className="bg-indigo-50 px-4 py-3 rounded-lg mb-5 border border-indigo-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-indigo-700">
                내 누적 기부액
              </span>
              <span className="text-base font-semibold text-indigo-600">
                {formatAmount(myTotalDonation)} 쿠폰
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-indigo-700">
                우리 학급 총 기부액
              </span>
              <span className="text-base font-semibold text-indigo-600">
                {formatAmount(totalDonationForThisClassGoal)} 쿠폰
              </span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-500">
              기부 현황을 불러오는 중...
            </div>
          ) : error ? (
            <div className="text-red-500 text-center py-10">
              {error}
            </div>
          ) : (
            <>
              {studentDonationSummary.length > 0 ? (
                <table style={tableStyles.table}>
                  <thead style={tableStyles.thead}>
                    <tr>
                      <th style={tableStyles.th}>학생 이름</th>
                      <th style={{ ...tableStyles.th, width: "150px", textAlign: "right" }}>
                        누적 기부 쿠폰
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentDonationSummary.map((student, index) => (
                      <tr
                        key={student.id || index}
                        style={{
                          ...tableStyles.tr,
                          backgroundColor: student.isCurrentUser
                            ? "#e0e7ff"
                            : index % 2 === 0
                            ? "#f9fafb"
                            : "#ffffff",
                        }}
                        onMouseOver={(e) => {
                          if (!student.isCurrentUser) {
                            e.currentTarget.style.backgroundColor = "#eef2ff";
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!student.isCurrentUser) {
                            e.currentTarget.style.backgroundColor = 
                              index % 2 === 0 ? "#f9fafb" : "#ffffff";
                          }
                        }}
                      >
                        <td style={tableStyles.td}>
                          {student.name}
                          {student.isCurrentUser && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-lg font-semibold align-middle">
                              나
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            ...tableStyles.td,
                            textAlign: "right",
                            color: student.cumulativeAmount > 0 ? "#4f46e5" : "#6b7280",
                            fontWeight: student.cumulativeAmount > 0 ? "600" : "normal"
                          }}
                        >
                          {formatAmount(student.cumulativeAmount)} 쿠폰
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={tableStyles.emptyContainer}>
                  <div style={tableStyles.emptyIcon}>👥</div>
                  <p className="m-0 mb-2 text-base font-medium">
                    학급 학생 정보를 불러올 수 없거나 등록된 학생이 없습니다
                  </p>
                  <p className="m-0 text-sm">
                    관리자에게 문의하여 학급 설정을 확인해주세요.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 border-0 rounded-md cursor-pointer font-medium transition-all duration-200 hover:bg-gray-300 hover:text-gray-800"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
});

export default DonationHistoryModal;