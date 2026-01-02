import React, { useState, useEffect } from "react";

const PoliceAdminSettings = ({
  reportReasons,
  onUpdateReasons,
  onDeleteAllReports,
}) => {
  const [reasons, setReasons] = useState([]);

  useEffect(() => {
    setReasons(JSON.parse(JSON.stringify(reportReasons || [])));
  }, [reportReasons]);

  const handleReasonChange = (index, field, value) => {
    const updatedReasons = [...reasons];
    if (field === "amount") {
      updatedReasons[index][field] = value === "" ? 0 : parseInt(value, 10);
    } else {
      updatedReasons[index][field] = value;
    }
    setReasons(updatedReasons);
  };

  const handleAddReason = () => {
    setReasons([
      ...reasons,
      { reason: "새로운 사유", amount: 10000, isLaw: false },
    ]);
  };

  const handleDeleteReason = (indexToDelete) => {
    if (window.confirm("이 사유를 정말 삭제하시겠습니까?")) {
      setReasons(reasons.filter((_, index) => index !== indexToDelete));
    }
  };

  const handleSaveChanges = () => {
    if (reasons.some((r) => !r.reason.trim())) {
      alert("사유 이름은 비워둘 수 없습니다.");
      return;
    }
    onUpdateReasons(reasons);
  };

  const handleDeleteAllClick = () => {
    if (
      window.confirm(
        "정말로 모든 신고 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
      )
    ) {
      onDeleteAllReports();
    }
  };

  return (
    <div className="admin-settings-container">
      <h2 className="admin-settings-h2">관리자 설정</h2>

      {/* --- 사용자 정의 신고 사유 관리 섹션 --- */}
      <div className="admin-section">
        <h3 className="admin-section-title">사용자 정의 신고 사유 관리</h3>
        <p className="admin-section-desc">
          법안 기반이 아닌, 사용자가 직접 추가하는 신고 사유 목록입니다.
          벌금액을 0으로 설정하면 벌금 없이 처리할 수 있습니다.
        </p>
        <div className="reasons-list">
          {reasons.map((reason, index) => (
            <div key={index} className="reason-item-editor">
              <input
                type="text"
                value={reason.reason}
                onChange={(e) =>
                  handleReasonChange(index, "reason", e.target.value)
                }
                placeholder="신고 사유"
                className="reason-input"
              />
              <div className="reason-amount-wrapper">
                <input
                  type="number"
                  value={reason.amount}
                  onChange={(e) =>
                    handleReasonChange(index, "amount", e.target.value)
                  }
                  placeholder="벌금액"
                  className="reason-amount-input"
                  min="0"
                  step="1000"
                />
                <span>원</span>
              </div>
              <button
                onClick={() => handleDeleteReason(index)}
                className="reason-delete-button"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <div className="reason-actions">
          <button onClick={handleAddReason} className="reason-add-button">
            사유 추가
          </button>
          <button onClick={handleSaveChanges} className="reason-save-button">
            변경사항 저장
          </button>
        </div>
      </div>

      {/* --- 위험 구역 섹션 --- */}
      <div className="admin-section danger-zone">
        <h3 className="admin-section-title danger-zone-title">위험 구역</h3>
        <p className="admin-section-desc">
          주의: 이 작업은 되돌릴 수 없으므로 신중하게 진행해주세요.
        </p>
        <div className="danger-zone-actions">
          <p className="danger-zone-p">
            <strong>모든 신고 기록 삭제</strong>
            <br />
            현재 학급에 제출, 처리, 완료된 모든 신고 내역을 영구적으로
            삭제합니다.
          </p>
          <button
            onClick={handleDeleteAllClick}
            className="danger-zone-button"
          >
            모든 기록 삭제
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoliceAdminSettings;