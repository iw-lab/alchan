// src/ReportStatus.js
import React, { useState, useEffect } from "react";

import { logger } from "../../utils/logger";
const ReportStatus = ({
  reports,
  onProcessReport,
  onSettlement,
  reportReasons,
  formatDate,
  onAcceptReport,
  onDismissReport,
  isAdminView,
}) => {
  // 탭 상태 추가
  const [activeTab, setActiveTab] = useState("submitted"); // "submitted" 또는 "accepted"

  // 처리 모달 상태 (벌금 처리 전용)
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [processingAmount, setProcessingAmount] = useState("");
  const [processingReason, setProcessingReason] = useState("");

  // 처리 모달 열기
  const openProcessModal = (report) => {
    // 먼저 report 객체가 유효한지 확인
    if (!report) {
      return;
    }

    // 기본값 설정
    let defaultAmount = "";
    if (Array.isArray(reportReasons) && reportReasons.length > 0) {
      const reasonInfo = reportReasons.find((r) => r.reason === report.reason);
      if (reasonInfo && typeof reasonInfo.amount === 'number') {
        defaultAmount = reasonInfo.amount.toString();
      }
    }

    // 상태 업데이트
    setSelectedReport(report);
    setProcessingAmount(defaultAmount);
    setProcessingReason("");
    setShowProcessModal(true);
  };

  // 합의 처리 버튼 핸들러
  const handleSettlementClick = (report) => {

    if (!onSettlement) {
      console.error("onSettlement 함수가 전달되지 않았습니다");
      alert("합의 처리 기능을 사용할 수 없습니다. 관리자에게 문의하세요.");
      return;
    }

    if (!report) {
      console.error("handleSettlementClick: report가 없습니다");
      return;
    }

    try {
      onSettlement(report);
    } catch (error) {
      console.error("합의 처리 중 오류:", error);
      alert("합의 처리 중 오류가 발생했습니다.");
    }
  };

  // 신고 사유의 기본 금액 조회
  const getDefaultAmount = (reason) => {
    if (!Array.isArray(reportReasons)) return null;
    const reasonInfo = reportReasons.find((r) => r.reason === reason);
    return reasonInfo ? reasonInfo.amount : null;
  };

  // 모달 필드 변경 핸들러
  const handleProcessingAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setProcessingAmount(value);
  };

  // 처리 제출 핸들러
  const handleProcessSubmit = () => {
    if (!selectedReport) {
      return;
    }

    if (!onProcessReport) {
      alert("벌금 처리 기능을 사용할 수 없습니다.");
      return;
    }

    const amount = processingAmount ? parseInt(processingAmount, 10) : 0;

    try {
      onProcessReport(selectedReport.id, amount, processingReason);
      closeModals();
    } catch (error) {
      console.error("벌금 처리 중 오류:", error);
      alert("벌금 처리 중 오류가 발생했습니다.");
    }
  };

  // 모달 닫기
  const closeModals = () => {
    setShowProcessModal(false);
    setSelectedReport(null);
    setProcessingAmount("");
    setProcessingReason("");
  };

  // 필터링: '접수됨' 상태와 '제출됨' 상태 분리
  const acceptedReports = reports.filter((r) => r.status === "accepted");
  const submittedReports = reports.filter((r) => r.status === "submitted");

  // 법안 이름 강조 함수
  const highlightLawName = (reason) => {
    if (reason && reason.startsWith("[법안]")) {
      return <span className="law-reason-highlight">{reason}</span>;
    }
    return reason;
  };

  // 벌금 처리 모달 컴포넌트 (Portal 대신 직접 렌더링)
  const ProcessReportModal = React.useMemo(() => {
    if (!showProcessModal || !selectedReport) return null;

    return () => (
      <div
        className="process-modal-overlay"
        onClick={(e) => {
          if (e.target.className === "process-modal-overlay") {
            closeModals();
          }
        }}
      >
        <div
          className="process-modal-container"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="process-modal-header">
            <h2>
              벌금 처리 (사건번호: {selectedReport?.id?.slice(-6) || '없음'})
            </h2>
            <button
              className="close-button"
              onClick={closeModals}
            >
              &times;
            </button>
          </div>

          <div className="process-modal-content">
            <div className="report-summary">
              <p>
                <strong>사건번호:</strong> {selectedReport?.id?.slice(-6) || '없음'}
              </p>
              <p>
                <strong>대상자:</strong> {selectedReport?.reportedUserName || '알 수 없음'}
              </p>
              <p className="report-reason">
                <strong>신고 사유:</strong> {selectedReport?.reason || '알 수 없음'}
              </p>
              {selectedReport?.description && (
                <p className="law-description">
                  <strong>설명:</strong> {selectedReport.description}
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="processingAmount">
                벌금 금액 (원)
              </label>
              <input
                type="text"
                id="processingAmount"
                value={processingAmount}
                onChange={handleProcessingAmountChange}
                placeholder="벌금 금액을 입력하세요 (0원은 경고)"
                className="form-input"
              />
              {getDefaultAmount(selectedReport?.reason) !== null && (
                <p className="form-hint">
                  기본 금액: {getDefaultAmount(selectedReport?.reason)?.toLocaleString()}원
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="processingReason">
                처리 사유 (선택)
              </label>
              <textarea
                id="processingReason"
                value={processingReason}
                onChange={(e) => setProcessingReason(e.target.value)}
                placeholder="처리 사유를 입력하세요 (선택사항)"
                className="form-textarea"
                rows="3"
              />
            </div>

            {reportReasons && reportReasons.length > 0 && (
              <div className="quick-reasons-container">
                <p className="quick-reasons-label">빠른 선택:</p>
                <div className="quick-reasons-buttons">
                  {reportReasons.map((reasonItem, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setProcessingAmount(reasonItem.amount.toString());
                        setProcessingReason(reasonItem.reason);
                      }}
                      className="quick-reason-btn"
                    >
                      {reasonItem.reason} ({reasonItem.amount.toLocaleString()}원)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="process-modal-footer">
            <button
              className="modal-button cancel"
              onClick={closeModals}
            >
              취소
            </button>
            <button
              className="modal-button process"
              onClick={handleProcessSubmit}
            >
              처리 완료
            </button>
          </div>
        </div>
      </div>
    );
  }, [showProcessModal, selectedReport, processingAmount, processingReason, reportReasons]);

  return (
    <div className="report-status-container">
      <h2 className="section-title">신고 처리 현황</h2>

      {/* 탭 버튼 */}
      <div className="tabs-container">
        <button
          onClick={() => setActiveTab("submitted")}
          className={`tab-button ${activeTab === "submitted" ? "active" : ""}`}
        >
          제출된 신고 ({submittedReports.length})
        </button>
        <button
          onClick={() => setActiveTab("accepted")}
          className={`tab-button ${activeTab === "accepted" ? "active" : ""}`}
        >
          접수된 신고 ({acceptedReports.length})
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">처리 중인 신고가 없습니다.</div>
      ) : (
        <>
          {/* 접수된 신고 탭 */}
          {activeTab === "accepted" && (
            <div className="status-section">
              <div className="report-list">
                {acceptedReports.length === 0 ? (
                  <div className="empty-state">접수된 신고가 없습니다.</div>
                ) : (
                  acceptedReports.map((report) => (
                    <div
                      key={report.id}
                      className={`report-item ${report.isLawReport ? "law-report" : ""
                        }`}
                    >
                      <div className="report-header">
                        <span className="report-id">
                          사건번호: {report.id.slice(-6)}
                        </span>
                        <span className="report-date">
                          접수일: {formatDate(report.acceptanceDate)}
                        </span>
                      </div>
                      <div className="report-content">
                        <p>
                          <strong>신고자:</strong> {report.reporterName}
                        </p>
                        <p>
                          <strong>대상:</strong> {report.reportedUserName}
                        </p>
                        <p className="report-reason">
                          <strong>사유:</strong> {highlightLawName(report.reason)}
                        </p>
                        {report.description && (
                          <p className="report-description">
                            <strong>설명:</strong> {report.description}
                          </p>
                        )}
                        {report.details && (
                          <p>
                            <strong>상세:</strong> {report.details}
                          </p>
                        )}
                      </div>

                      {isAdminView && (
                        <div className="report-actions">
                          <button
                            onClick={() => {
                              logger.log("벌금 처리 버튼 클릭됨:", report);
                              openProcessModal(report);
                            }}
                            className="action-button process-button fine-button"
                          >
                            벌금 처리
                          </button>
                          <button
                            onClick={() => {
                              logger.log("합의 처리 버튼 클릭됨:", report);
                              handleSettlementClick(report);
                            }}
                            className="action-button settlement-button"
                          >
                            합의 처리
                          </button>
                          <button
                            onClick={() => {
                              logger.log("반려 버튼 클릭됨:", report.id);
                              if (onDismissReport) {
                                onDismissReport(report.id);
                              } else {
                                console.error("onDismissReport 함수가 없습니다");
                              }
                            }}
                            className="action-button dismiss-button"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 제출된 신고 탭 */}
          {activeTab === "submitted" && (
            <div className="status-section">
              <div className="report-list">
                {submittedReports.length === 0 ? (
                  <div className="empty-state">제출된 신고가 없습니다.</div>
                ) : (
                  submittedReports.map((report) => (
                    <div
                      key={report.id}
                      className={`report-item ${report.isLawReport ? "law-report" : ""
                        }`}
                    >
                      <div className="report-header">
                        <span className="report-id">
                          사건번호: {report.id.slice(-6)}
                        </span>
                        <span className="report-date">
                          제출일: {formatDate(report.submitDate)}
                        </span>
                      </div>
                      <div className="report-content">
                        <p>
                          <strong>신고자:</strong> {report.reporterName}
                        </p>
                        <p>
                          <strong>대상:</strong> {report.reportedUserName}
                        </p>
                        <p className="report-reason">
                          <strong>사유:</strong> {highlightLawName(report.reason)}
                        </p>
                        {report.description && (
                          <p className="report-description">
                            <strong>설명:</strong> {report.description}
                          </p>
                        )}
                        {report.details && (
                          <p>
                            <strong>상세:</strong> {report.details}
                          </p>
                        )}
                      </div>

                      {isAdminView && (
                        <div className="report-actions">
                          <button
                            onClick={() => {
                              logger.log("접수 버튼 클릭됨:", report.id);
                              if (onAcceptReport) {
                                onAcceptReport(report.id);
                              } else {
                                console.error("onAcceptReport 함수가 없습니다");
                              }
                            }}
                            className="action-button accept-button"
                          >
                            접수
                          </button>
                          <button
                            onClick={() => {
                              logger.log("반려 버튼 클릭됨:", report.id);
                              if (onDismissReport) {
                                onDismissReport(report.id);
                              } else {
                                console.error("onDismissReport 함수가 없습니다");
                              }
                            }}
                            className="action-button dismiss-button"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 벌금 처리 모달 - Portal 제거하고 직접 렌더링 */}
      {ProcessReportModal && ProcessReportModal()}
    </div>
  );
};

export default ReportStatus;