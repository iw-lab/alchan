// src/ComplaintStatus.js (가이드 - 실제 코드는 다를 수 있음)
import React from "react";

// 필요한 props들을 받습니다 (complaints, users, isAdmin, currentUserId, onVote, onStartTrial, onOpenJudgment 등)
const ComplaintStatus = ({
  complaints,
  users,
  isAdmin,
  currentUserId,
  onVote,
  onStartTrial,
  onOpenJudgment,
  onEditComplaint, // 기존 편집 핸들러
  onDeleteComplaint, // 기존 삭제 핸들러
  onIndictComplaint, // 기소 핸들러 (필요시)
  onDismissComplaint, // 기각 핸들러 (필요시)
}) => {
  const getUserNameById = (userId) =>
    users.find((u) => u.id === userId)?.name || "알 수 없음";

  // 상태별로 카드를 그룹화하거나 정렬할 수 있습니다.
  // const pending = complaints.filter(c => c.status === 'pending');
  // const indicted = complaints.filter(c => c.status === 'indicted');
  // ... etc

  return (
    <div className="complaint-list-container">
      {/* complaints 배열을 map으로 순회하며 각 카드를 렌더링 */}
      <ul className="complaint-list">
        {" "}
        {/* ul 대신 div나 다른 grid 컨테이너 사용 가능 */}
        {complaints.length === 0 ? (
          <li className="empty-state">해당 상태의 사건이 없습니다.</li>
        ) : (
          complaints.map((complaint) => {
            const likedByCount = complaint.likedBy?.length || 0;
            const dislikedByCount = complaint.dislikedBy?.length || 0;
            const didCurrentUserLike =
              complaint.likedBy?.includes(currentUserId);
            const didCurrentUserDislike =
              complaint.dislikedBy?.includes(currentUserId);

            // 카드 클래스 조건부 적용
            let cardClass = "complaint-card";
            if (complaint.status === "indicted") cardClass += " indicted-card";
            else if (complaint.status === "on_trial")
              cardClass += " on-trial-card";
            else if (complaint.status === "dismissed")
              cardClass += " dismissed-card";
            // 'pending' 등 다른 상태에 대한 클래스 추가 가능

            return (
              <li key={complaint.id} className={cardClass}>
                {" "}
                {/* li 대신 div 등 사용 가능 */}
                {/* 카드 헤더: 사건번호, 상태, 고소인*피고소인 */}
                <div className="complaint-card-header">
                  <span className="case-id">ID: {complaint.id.slice(-6)}</span>
                  {/* 고소인 * 피고소인 표시 */}
                  <span className="parties-display">
                    {getUserNameById(complaint.complainantId)} *{" "}
                    {getUserNameById(complaint.defendantId)}
                  </span>
                  {/* 상태 표시 뱃지 */}
                  <span className={`case-status status-${complaint.status}`}>
                    {complaint.status === "pending"
                      ? "검토대기"
                      : complaint.status === "indicted"
                      ? "기소됨"
                      : complaint.status === "on_trial"
                      ? "재판중"
                      : complaint.status === "dismissed"
                      ? "기각/불기소"
                      : complaint.status === "resolved"
                      ? "재판완료"
                      : complaint.status}
                  </span>
                </div>
                {/* 카드 본문: 고소 사유, 원하는 결과 */}
                <div className="complaint-card-content">
                  <h4>고소 사유</h4>
                  <p>{complaint.reason}</p>
                  {complaint.desiredResolution && (
                    <>
                      <h4>원하는 결과</h4>
                      <p>{complaint.desiredResolution}</p>
                    </>
                  )}
                </div>
                {/* 좋아요/싫어요 버튼 (pending 상태에만 표시하거나, 다른 조건 추가 가능) */}
                {complaint.status === "pending" && (
                  <div className="complaint-voting">
                    <button
                      className={`vote-button like-button ${
                        didCurrentUserLike ? "voted" : ""
                      }`}
                      onClick={() => onVote(complaint.id, "like")}
                      disabled={!currentUserId}
                      title="좋아요"
                    >
                      👍 <span className="vote-count">{likedByCount}</span>
                    </button>
                    <button
                      className={`vote-button dislike-button ${
                        didCurrentUserDislike ? "voted" : ""
                      }`}
                      onClick={() => onVote(complaint.id, "dislike")}
                      disabled={!currentUserId}
                      title="싫어요"
                    >
                      👎 <span className="vote-count">{dislikedByCount}</span>
                    </button>
                  </div>
                )}
                {/* 관리자/판사 액션 버튼 (조건부 렌더링) */}
                {isAdmin && (
                  <div className="complaint-card-actions">
                    {/* 상태별 버튼 표시 */}
                    {complaint.status === "pending" && (
                      <>
                        <button
                          onClick={() => onIndictComplaint(complaint.id)}
                          className="indict-button"
                        >
                          기소
                        </button>
                        <button
                          onClick={() => onDismissComplaint(complaint.id)}
                          className="dismiss-button"
                        >
                          기각
                        </button>
                        <button
                          onClick={() => onEditComplaint(complaint)}
                          className="edit-button"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => onDeleteComplaint(complaint.id)}
                          className="delete-button"
                        >
                          삭제
                        </button>
                      </>
                    )}
                    {complaint.status === "indicted" && (
                      <>
                        {/* "재판하기" 버튼 추가 */}
                        <button
                          onClick={() => onStartTrial(complaint.id)}
                          className="start-trial-button"
                        >
                          재판하기
                        </button>
                        <button
                          onClick={() => onEditComplaint(complaint)}
                          className="edit-button"
                        >
                          정보 수정
                        </button>{" "}
                        {/* 기소 후에도 정보 수정 가능? */}
                        <button
                          onClick={() => onDeleteComplaint(complaint.id)}
                          className="delete-button"
                        >
                          기소 취소/삭제
                        </button>{" "}
                        {/* 필요시 */}
                      </>
                    )}
                    {complaint.status === "on_trial" && (
                      <>
                        {/* "판결문 쓰기" 버튼 추가 */}
                        <button
                          onClick={() => onOpenJudgment(complaint)}
                          className="write-judgment-button"
                        >
                          판결문 쓰기
                        </button>
                        {/* 재판 중 정보 수정/삭제는 정책에 따라 결정 */}
                      </>
                    )}
                    {/* 기각/완료된 사건에 대한 버튼 (예: 기록 삭제) */}
                    {(complaint.status === "dismissed" ||
                      complaint.status === "resolved") && (
                      <button
                        onClick={() => onDeleteComplaint(complaint.id)}
                        className="delete-button"
                      >
                        기록 삭제
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};

export default ComplaintStatus;
