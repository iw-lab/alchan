// src/SubmitReport.js
import React, { useState } from "react";

const SubmitReport = ({
  onSubmitReport,
  reportReasons,
  users,
  currentUser,
  canReport = true,
}) => {
  const [reportData, setReportData] = useState({
    reportedUserId: "",
    victimId: "",
    reason: "",
    details: "",
  });

  // 법안 기반 신고 사유와 일반 신고 사유 분리
  const lawReasons = reportReasons.filter((reason) => reason.isLaw);
  const standardReasons = reportReasons.filter((reason) => !reason.isLaw);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setReportData((prev) => {
      const next = { ...prev, [name]: value };
      // 신고 대상(가해자)을 이미 고른 피해자와 같은 사람으로 바꾸면 피해자 선택을 비운다.
      // (드롭다운에선 사라지지만 state엔 남아 제출 시 알림으로 막히던 UX 어색함 제거)
      if (name === "reportedUserId" && next.victimId === value) {
        next.victimId = "";
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reportData.reportedUserId || !reportData.reason) {
      alert("신고 대상과 사유를 모두 선택해주세요.");
      return;
    }
    if (reportData.victimId && reportData.victimId === reportData.reportedUserId) {
      alert("피해자와 신고 대상(가해자)은 같을 수 없습니다.");
      return;
    }
    onSubmitReport(reportData);
    // 폼 초기화
    setReportData({
      reportedUserId: "",
      victimId: "",
      reason: "",
      details: "",
    });
  };

  // 선택된 신고 사유에 따른 기본 벌금 조회
  const getDefaultAmount = () => {
    const selectedReason = reportReasons.find(
      (r) => r.reason === reportData.reason
    );
    return selectedReason ? selectedReason.amount : 0;
  };

  // 신고 설명 조회
  const getReasonDescription = () => {
    const selectedReason = reportReasons.find(
      (r) => r.reason === reportData.reason
    );
    return selectedReason?.description || "";
  };

  if (!currentUser) {
    return (
      <p className="login-required-message">신고하려면 로그인이 필요합니다.</p>
    );
  }

  // 🚔 경찰 직업이 아니면 신고 폼 대신 안내문 표시
  if (!canReport) {
    return (
      <div className="submit-report-container">
        <h2 className="section-title">신고 제출</h2>
        <div className="reason-description-box" style={{ textAlign: "center", lineHeight: 1.7 }}>
          <p style={{ fontSize: "1.05rem", fontWeight: 600 }}>
            🚔 경찰서 신고는 <strong>‘경찰’ 직업</strong>을 가진 학생만 할 수 있습니다.
          </p>
          <p style={{ color: "#475569" }}>
            신고하고 싶은 사건이 있다면 우리 반 <strong>경찰</strong>에게 알려서
            대신 신고해 달라고 요청하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-report-container">
      <h2 className="section-title">신고 제출</h2>
      <form onSubmit={handleSubmit} className="report-form">
        <div className="form-group">
          <label htmlFor="reportedUserId">신고 대상</label>
          <select
            id="reportedUserId"
            name="reportedUserId"
            value={reportData.reportedUserId}
            onChange={handleChange}
            required
            className="form-select"
          >
            <option value="">신고할 사람을 선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="victimId">
            피해자 <span style={{ color: "#64748b", fontWeight: 400 }}>(합의금을 받을 사람 · 선택)</span>
          </label>
          <select
            id="victimId"
            name="victimId"
            value={reportData.victimId}
            onChange={handleChange}
            className="form-select"
          >
            <option value="">피해자 없음 / 나중에 지정</option>
            {users
              .filter((user) => user.id !== reportData.reportedUserId)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="reason">신고 사유</label>
          <select
            id="reason"
            name="reason"
            value={reportData.reason}
            onChange={handleChange}
            required
            className="form-select"
          >
            <option value="">사유를 선택하세요</option>

            {/* 법안 기반 신고 사유 그룹 */}
            {lawReasons.length > 0 && (
              <>
                <option disabled className="reason-group-heading">
                  --- 법안 기반 신고 사유 ---
                </option>
                {lawReasons.map((reason, index) => (
                  <option
                    key={`law-${index}`}
                    value={reason.reason}
                    className="law-reason-option"
                  >
                    {reason.reason} (벌금: {reason.amount.toLocaleString()}원)
                  </option>
                ))}
              </>
            )}

            {/* 일반 신고 사유 그룹 */}
            <option disabled className="reason-group-heading">
              --- 일반 신고 사유 ---
            </option>
            {standardReasons.map((reason, index) => (
              <option key={`standard-${index}`} value={reason.reason}>
                {reason.reason}{" "}
                {reason.amount > 0
                  ? `(벌금: ${reason.amount.toLocaleString()}원)`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {/* 선택된 신고 사유에 설명이 있으면 표시 */}
        {reportData.reason && getReasonDescription() && (
          <div className="reason-description-box">
            <h3>법안 설명</h3>
            <p>{getReasonDescription()}</p>
            {getDefaultAmount() > 0 && (
              <p className="default-fine">
                기본 벌금: {getDefaultAmount().toLocaleString()}원
              </p>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="details">상세 내용 (선택사항)</label>
          <textarea
            id="details"
            name="details"
            value={reportData.details}
            onChange={handleChange}
            className="form-textarea"
            placeholder="신고에 대한 상세 내용을 작성하세요 (선택사항)"
            rows="4"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="submit-button">
            신고 제출
          </button>
        </div>
      </form>
    </div>
  );
};

export default SubmitReport;
