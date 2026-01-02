// src/ReportResults.js
import React, { useState } from "react";

const ReportResults = ({
  reports,
  formatDate,
  isAdminView,
  onEditReport,
  onDeleteReport,
}) => {
  const [filter, setFilter] = useState("all"); // 'all', 'fine', 'settlement', 'dismissed'

  // 필터링된 보고서
  const filteredReports = reports.filter((report) => {
    if (filter === "all") return true;
    if (filter === "fine") return report.status === "resolved_fine";
    if (filter === "settlement") return report.status === "resolved_settlement";
    if (filter === "dismissed") return report.status === "dismissed";
    return true;
  });

  // 법안 이름 강조 함수
  const highlightLawName = (reason) => {
    if (reason.startsWith("[법안]")) {
      return <span className="law-reason-highlight">{reason}</span>;
    }
    return reason;
  };

  return (
    <div className="report-results-container">
      <h2 className="section-title">처리 결과</h2>

      {/* 필터 컨트롤 */}
      <div className="filter-controls">
        <span className="filter-label">필터:</span>
        <div className="filter-buttons">
          <button
            className={`filter-button ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            전체 ({reports.length})
          </button>
          <button
            className={`filter-button ${filter === "fine" ? "active" : ""}`}
            onClick={() => setFilter("fine")}
          >
            벌금 처리
          </button>
          <button
            className={`filter-button ${
              filter === "settlement" ? "active" : ""
            }`}
            onClick={() => setFilter("settlement")}
          >
            합의 처리
          </button>
          <button
            className={`filter-button ${
              filter === "dismissed" ? "active" : ""
            }`}
            onClick={() => setFilter("dismissed")}
          >
            반려
          </button>
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <div className="empty-state">처리된 신고가 없습니다.</div>
      ) : (
        <div className="results-list">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className={`result-item ${
                report.isLawReport ? "law-report" : ""
              } status-${report.status}`}
            >
              <div className="result-header">
                <span className="report-id">
                  사건번호: {report.id.slice(-6)}
                </span>
                <span className="result-status">
                  {report.status === "resolved_fine" && "벌금 처리"}
                  {report.status === "resolved_settlement" && "합의 처리"}
                  {report.status === "dismissed" && "반려"}
                </span>
                <span className="result-date">
                  처리일:{" "}
                  {formatDate(report.resolutionDate || report.submitDate)}
                </span>
              </div>

              <div className="result-content">
                <div className="result-parties">
                  <p>
                    <strong>신고자:</strong> {report.reporterName}
                  </p>
                  <p>
                    <strong>대상자:</strong> {report.reportedUserName}
                  </p>
                </div>

                <div className="result-details">
                  <p className="report-reason">
                    <strong>신고 사유:</strong>{" "}
                    {highlightLawName(report.reason)}
                  </p>
                  {report.description && (
                    <p className="report-description">
                      <strong>설명:</strong> {report.description}
                    </p>
                  )}
                  {report.details && (
                    <p>
                      <strong>상세내용:</strong> {report.details}
                    </p>
                  )}
                  {report.resolution && (
                    <p className="resolution">
                      <strong>처리결과:</strong> {report.resolution}
                    </p>
                  )}
                  {report.amount > 0 && (
                    <p className="amount">
                      <strong>금액:</strong> {report.amount.toLocaleString()}원
                      {report.status === "resolved_settlement" && " (합의금)"}
                      {report.status === "resolved_fine" && " (벌금)"}
                    </p>
                  )}
                </div>

                <div className="processed-by">
                  <p>
                    <strong>처리자:</strong>{" "}
                    {report.processedByName || "시스템"}
                  </p>
                </div>
              </div>

              {isAdminView && (
                <div className="admin-actions">
                  <button
                    onClick={() => onEditReport(report.id)}
                    className="admin-button edit-button"
                    title="편집"
                  >
                    편집
                  </button>
                  <button
                    onClick={() => onDeleteReport(report.id)}
                    className="admin-button delete-button"
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportResults;
