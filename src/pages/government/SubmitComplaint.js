// src/SubmitComplaint.js
import React, { useState, useEffect } from "react";

// users: 사용자 목록 배열 (예: [{id: 'user1', name: '김민준'}, ...])
// currentUserId: 현재 로그인한 사용자 ID
// onSubmitComplaint: 부모 컴포넌트(Court.js)의 handleAddComplaint 함수
// isAdmin: 현재 사용자가 관리자 권한을 가지고 있는지 여부
const SubmitComplaint = ({
  onSubmitComplaint,
  users = [],
  currentUserId,
  isAdmin = false,
}) => {
  const [complainantName, setComplainantName] = useState(""); // 직접 입력받거나, 로그인 정보 사용
  const [defendantId, setDefendantId] = useState(""); // 선택된 피고소인 ID 상태
  const [reason, setReason] = useState("");
  const [desiredResolution, setDesiredResolution] = useState("");

  // 고소 사유 선택 관련 상태
  const [selectedReasonType, setSelectedReasonType] = useState("custom"); // 'custom', 'predefined', 'law'
  const [predefinedReasons, setPredefinedReasons] = useState([]);
  const [selectedPredefinedReason, setSelectedPredefinedReason] = useState("");
  const [approvedLaws, setApprovedLaws] = useState([]);
  const [selectedLaw, setSelectedLaw] = useState("");

  // 관리자용 새 고소 사유 추가 상태
  const [newReason, setNewReason] = useState("");
  const [showAddReasonModal, setShowAddReasonModal] = useState(false);

  // 초기 데이터 로드 (고소 사유 목록, 가결된 법안 목록)
  useEffect(() => {
    // 로컬 스토리지에서 고소 사유 목록 로드
    const savedReasons = localStorage.getItem("predefinedComplaintReasons");
    if (savedReasons) {
      try { setPredefinedReasons(JSON.parse(savedReasons)); } catch { /* corrupted data, use defaults */ }
    } else {
      // 기본 고소 사유
      const initialReasons = [
        "수업 중 소란 행위",
        "재산 손괴",
        "집단 따돌림",
        "욕설 사용",
        "급식질서 위반",
      ];
      setPredefinedReasons(initialReasons);
      localStorage.setItem(
        "predefinedComplaintReasons",
        JSON.stringify(initialReasons)
      );
    }

    // 로컬 스토리지에서 가결된 법안 로드
    const savedLaws = localStorage.getItem("nationalAssemblyLaws");
    if (savedLaws) {
      let parsedLaws;
      try { parsedLaws = JSON.parse(savedLaws); } catch { parsedLaws = []; }
      // 가결된 법안만 필터링 (approved, veto_overridden, final_approved 상태)
      const lawsFiltered = parsedLaws.filter(
        (law) =>
          law.status === "approved" ||
          law.status === "veto_overridden" ||
          law.finalStatus === "final_approved"
      );
      setApprovedLaws(lawsFiltered);
    }
  }, []);

  // 고소 사유 목록 변경시 저장
  useEffect(() => {
    if (predefinedReasons.length > 0) {
      localStorage.setItem(
        "predefinedComplaintReasons",
        JSON.stringify(predefinedReasons)
      );
    }
  }, [predefinedReasons]);

  // 관리자가 새 고소 사유 추가
  const handleAddPredefinedReason = () => {
    if (!newReason.trim()) {
      alert("고소 사유를 입력해주세요.");
      return;
    }

    const updatedReasons = [...predefinedReasons, newReason.trim()];
    setPredefinedReasons(updatedReasons);
    setNewReason("");
    setShowAddReasonModal(false);
  };

  // 고소 사유 삭제
  const handleDeleteReason = (index) => {
    if (window.confirm("이 고소 사유를 삭제하시겠습니까?")) {
      const updatedReasons = [...predefinedReasons];
      updatedReasons.splice(index, 1);
      setPredefinedReasons(updatedReasons);
    }
  };

  // 고소 사유 타입 변경 처리
  const handleReasonTypeChange = (type) => {
    setSelectedReasonType(type);

    // 선택된 고소 사유 타입에 따라 실제 사유 텍스트 설정
    if (type === "custom") {
      setReason(""); // 직접 입력 모드일 때는 내용 초기화
    } else if (type === "predefined") {
      setSelectedPredefinedReason("");
      setReason("");
    } else if (type === "law") {
      setSelectedLaw("");
      setReason("");
    }
  };

  // 선택된 고소 사유(미리 정의된 사유 또는 법안)가 변경될 때 처리
  useEffect(() => {
    if (selectedReasonType === "predefined" && selectedPredefinedReason) {
      setReason(selectedPredefinedReason);
    } else if (selectedReasonType === "law" && selectedLaw) {
      const selectedLawObj = approvedLaws.find(
        (law) => law.id === parseInt(selectedLaw)
      );
      if (selectedLawObj) {
        setReason(
          `법안 위반: ${selectedLawObj.title} - ${selectedLawObj.description}`
        );
      }
    }
  }, [selectedPredefinedReason, selectedLaw, approvedLaws, selectedReasonType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!defendantId) {
      alert("피고소인을 선택해주세요.");
      return;
    }
    if (!reason.trim()) {
      alert("고소 사유를 입력해주세요.");
      return;
    }
    onSubmitComplaint({
      complainantName, // 고소인 이름 (로그인 정보로 대체 가능)
      defendantId, // 선택된 피고소인 ID
      reason,
      desiredResolution,
      // 법안 위반인 경우 추가 정보 저장
      lawViolation:
        selectedReasonType === "law"
          ? {
              lawId: parseInt(selectedLaw),
              lawTitle:
                approvedLaws.find((law) => law.id === parseInt(selectedLaw))
                  ?.title || "",
            }
          : null,
    });
    // 폼 초기화
    setDefendantId("");
    setReason("");
    setDesiredResolution("");
    setSelectedReasonType("custom");
    setSelectedPredefinedReason("");
    setSelectedLaw("");
  };

  // 드롭다운 옵션 생성 (자기 자신 제외)
  const defendantOptions = users
    .filter((user) => user.id !== currentUserId) // 본인 제외
    .map((user) => (
      <option key={user.id} value={user.id}>
        {user.name} {/* 필요시 ID도 같이 표시: {user.name} ({user.id}) */}
      </option>
    ));

  return (
    <div className="complaint-submission-container">
      <h2 className="section-title">고소장 제출</h2>

      <form onSubmit={handleSubmit} className="submit-complaint-form">
        {/* 피고소인 선택 드롭다운 */}
        <div className="form-group">
          <label htmlFor="defendantSelect" className="form-label">
            피고소인 선택
          </label>
          <select
            id="defendantSelect"
            className="form-select"
            value={defendantId}
            onChange={(e) => setDefendantId(e.target.value)}
            required
          >
            <option value="">-- 피고소인을 선택하세요 --</option>
            {defendantOptions}
          </select>
        </div>

        {/* 고소 사유 타입 선택 */}
        <div className="form-group">
          <label className="form-label">고소 사유 선택 방법</label>
          <div className="reason-type-selection">
            <div className="reason-type-option">
              <input
                type="radio"
                id="reasonTypeCustom"
                name="reasonType"
                value="custom"
                checked={selectedReasonType === "custom"}
                onChange={() => handleReasonTypeChange("custom")}
              />
              <label htmlFor="reasonTypeCustom">직접 입력</label>
            </div>

            <div className="reason-type-option">
              <input
                type="radio"
                id="reasonTypePredefined"
                name="reasonType"
                value="predefined"
                checked={selectedReasonType === "predefined"}
                onChange={() => handleReasonTypeChange("predefined")}
              />
              <label htmlFor="reasonTypePredefined">일반 고소 사유</label>
            </div>

            <div className="reason-type-option">
              <input
                type="radio"
                id="reasonTypeLaw"
                name="reasonType"
                value="law"
                checked={selectedReasonType === "law"}
                onChange={() => handleReasonTypeChange("law")}
              />
              <label htmlFor="reasonTypeLaw">법안 위반</label>
            </div>
          </div>
        </div>

        {/* 선택된 방법에 따른 고소 사유 입력/선택 UI */}
        {selectedReasonType === "custom" && (
          <div className="form-group">
            <label htmlFor="reason" className="form-label">
              고소 사유
            </label>
            <textarea
              id="reason"
              className="form-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="고소 사유를 직접 입력하세요"
              required
            />
          </div>
        )}

        {selectedReasonType === "predefined" && (
          <div className="form-group">
            <label htmlFor="predefinedReason" className="form-label">
              고소 사유 선택
            </label>
            <div className="predefined-reason-container">
              <select
                id="predefinedReason"
                className="form-select"
                value={selectedPredefinedReason}
                onChange={(e) => setSelectedPredefinedReason(e.target.value)}
                required
              >
                <option value="">-- 고소 사유를 선택하세요 --</option>
                {predefinedReasons.map((reason, index) => (
                  <option key={index} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>

              {/* 관리자만 볼 수 있는 버튼들 */}
              {isAdmin && (
                <button
                  type="button"
                  className="add-reason-button"
                  onClick={() => setShowAddReasonModal(true)}
                >
                  + 고소 사유 추가
                </button>
              )}
            </div>

            {/* 선택된 고소 사유 표시 */}
            {selectedPredefinedReason && (
              <div className="selected-reason-display">
                <p>선택된 고소 사유: {selectedPredefinedReason}</p>
              </div>
            )}
          </div>
        )}

        {selectedReasonType === "law" && (
          <div className="form-group">
            <label htmlFor="lawViolation" className="form-label">
              위반 법안 선택
            </label>
            <select
              id="lawViolation"
              className="form-select"
              value={selectedLaw}
              onChange={(e) => setSelectedLaw(e.target.value)}
              required
            >
              <option value="">-- 위반한 법안을 선택하세요 --</option>
              {approvedLaws.map((law) => (
                <option key={law.id} value={law.id}>
                  {law.title} (벌금: {law.fine})
                </option>
              ))}
            </select>

            {/* 선택된 법안 세부정보 표시 */}
            {selectedLaw && (
              <div className="selected-law-display">
                {approvedLaws.find(
                  (law) => law.id === parseInt(selectedLaw)
                ) && (
                  <>
                    <p>
                      <strong>법안 취지:</strong>{" "}
                      {
                        approvedLaws.find(
                          (law) => law.id === parseInt(selectedLaw)
                        ).purpose
                      }
                    </p>
                    <p>
                      <strong>법안 설명:</strong>{" "}
                      {
                        approvedLaws.find(
                          (law) => law.id === parseInt(selectedLaw)
                        ).description
                      }
                    </p>
                    <p>
                      <strong>벌금:</strong>{" "}
                      {
                        approvedLaws.find(
                          (law) => law.id === parseInt(selectedLaw)
                        ).fine
                      }
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 원하는 결과 */}
        <div className="form-group">
          <label htmlFor="desiredResolution" className="form-label">
            원하는 결과
          </label>
          <textarea
            id="desiredResolution"
            className="form-textarea"
            value={desiredResolution}
            onChange={(e) => setDesiredResolution(e.target.value)}
            placeholder="원하는 처벌이나 결과를 입력하세요 (선택사항)"
          />
        </div>

        <button type="submit" className="submit-button">
          고소장 제출
        </button>
      </form>

      {/* 관리자용 고소 사유 추가 모달 */}
      {showAddReasonModal && (
        <div className="modal-overlay">
          <div className="modal-container small">
            <div className="modal-header">
              <h3 className="modal-title">새 고소 사유 추가</h3>
            </div>

            <div className="modal-content">
              <div className="form-group">
                <label htmlFor="newReason" className="form-label">
                  고소 사유
                </label>
                <input
                  type="text"
                  id="newReason"
                  className="form-input"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="새로운 고소 사유를 입력하세요"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-button cancel"
                onClick={() => {
                  setShowAddReasonModal(false);
                  setNewReason("");
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="modal-button submit"
                onClick={handleAddPredefinedReason}
                disabled={!newReason.trim()}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자용 고소 사유 관리 섹션 */}
      {isAdmin &&
        selectedReasonType === "predefined" &&
        predefinedReasons.length > 0 && (
          <div className="admin-reasons-management">
            <h3>고소 사유 관리</h3>
            <div className="reasons-list">
              {predefinedReasons.map((reason, index) => (
                <div key={index} className="reason-item">
                  <span className="reason-text">{reason}</span>
                  <button
                    type="button"
                    className="delete-reason-button"
                    onClick={() => handleDeleteReason(index)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};

export default SubmitComplaint;
