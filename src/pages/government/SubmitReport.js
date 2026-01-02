// src/SubmitReport.js
import React, { useState } from "react";

const SubmitReport = ({
  onSubmitReport,
  reportReasons,
  users,
  currentUser,
}) => {
  const [reportData, setReportData] = useState({
    reportedUserId: "",
    reason: "",
    details: "",
  });

  // 법안 기반 신고 사유와 일반 신고 사유 분리
  const lawReasons = reportReasons.filter((reason) => reason.isLaw);
  const standardReasons = reportReasons.filter((reason) => !reason.isLaw);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setReportData({ ...reportData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reportData.reportedUserId || !reportData.reason) {
      alert("신고 대상과 사유를 모두 선택해주세요.");
      return;
    }
    onSubmitReport(reportData);
    // 폼 초기화
    setReportData({
      reportedUserId: "",
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
