import React, { memo } from "react";
import TaskItem from "./TaskItem"; // TaskItem 컴포넌트 임포트 필요

// props로 jobs 배열 대신 job 객체를 받도록 수정
const JobList = memo(function JobList({
  job, // 직업 객체 데이터 (상위 컴포넌트에서 prop으로 전달)
  isAdmin, // 관리자 여부 (상위 컴포넌트에서 prop으로 전달)
  onEditJob, // 직업 수정 핸들러 (관리자 모드)
  onDeleteJob, // 직업 삭제 핸들러 (관리자 모드) <-- 누락된 prop 추가
  onAddTask, // 해당 직업에 할일 추가 핸들러 (관리자 모드)
  onEditTask, // 할일 수정 핸들러
  onDeleteTask, // 할일 삭제 핸들러
  onEarnCoupon, // 쿠폰 획득 핸들러
  onRequestApproval, // 승인 요청 핸들러
  addJobTaskButtonStyle, // Dashboard에서 전달받는 버튼 스타일 <-- 스타일 prop 추가
}) {
  // job 객체가 유효하지 않으면 아무것도 렌더링하지 않음 (오류 방지)
  if (!job) {
    return null;
  }

  const isMobile = window.innerWidth <= 768;

  return (
    <div
      key={job.id} // 상위에서 map을 사용하므로 여기서 key는 필수 X, 식별용으로 유지
      className="flex flex-col h-full rounded-lg overflow-hidden mb-4"
      style={{
        backgroundColor: "rgba(20, 20, 35, 0.6)",
        border: "1px solid rgba(0, 255, 242, 0.2)",
        boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
        backdropFilter: "blur(5px)",
      }}
    >
      {/* 직업 헤더 - 시인성 개선 */}
      <div
        className="job-header-container flex justify-between items-center"
        style={{
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)",
          padding: isMobile ? "12px 14px" : "14px 16px",
          borderBottom: "1px solid rgba(0, 255, 242, 0.2)",
        }}
      >
        <div
          className="job-title-text font-bold"
          style={{
            fontSize: isMobile ? "15px" : "18px",
            textShadow: "0 0 10px rgba(0, 255, 242, 0.3)",
            letterSpacing: "-0.01em",
            color: "#e8e8ff", // 밝은 텍스트
          }}
        >
          {job.title}
        </div>
        {/* 관리자 모드에서 직업 수정/삭제 버튼 */}
        {isAdmin && (
          <div>
            <button
              onClick={() => onEditJob(job.id)} // job.id 전달 확인
              className="cursor-pointer p-0 mr-2"
              style={{
                background: "none",
                border: "none",
                color: "rgba(255, 255, 255, 0.7)",
              }}
              aria-label={`${job.title} 직업 수정`}
            >
              ✏️
            </button>
            <button
              onClick={() => onDeleteJob(job.id)} // job.id 전달 확인
              className="cursor-pointer p-0"
              style={{
                background: "none",
                border: "none",
                color: "rgba(255, 255, 255, 0.7)",
              }}
              aria-label={`${job.title} 직업 삭제`}
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* 직업 할일 목록 (flex-grow로 남은 공간 채우기) */}
      <div className="flex-grow overflow-y-auto" style={{ padding: isMobile ? "8px" : "10px" }}>
        {job.tasks && job.tasks.length > 0 ? (
          job.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              taskId={task.id}
              jobId={job.id}
              // 핸들러에 task.id 전달 확인
              onEarnCoupon={onEarnCoupon}
              onRequestApproval={onRequestApproval}
              onEditTask={() => onEditTask(task.id, job.id)} // Dashboard 핸들러 형식에 맞게 job.id 전달
              onDeleteTask={() => onDeleteTask(task.id, job.id)} // Dashboard 핸들러 형식에 맞게 job.id 전달
              isAdmin={isAdmin}
              isJobTask={true}
            />
          ))
        ) : (
          <p
            className="text-center my-2.5"
            style={{
              fontSize: "13px",
              color: "#9999bb",
            }}
          >
            등록된 할일이 없습니다.
          </p>
        )}
      </div>

      {/* 관리자 모드에서 할일 추가 버튼 (하단 고정 영역) */}
      {isAdmin && (
        <div style={{ padding: isMobile ? "8px" : "10px", borderTop: "1px solid rgba(0, 255, 242, 0.1)" }}>
          <button
            onClick={onAddTask} // Dashboard에서 job.id 포함하여 생성된 핸들러 전달
            // --- 인라인 스타일 대신 전달받은 스타일 적용 ---
            className="w-full cursor-pointer rounded-md mt-0 transition-all"
            style={
              addJobTaskButtonStyle || {
                /* 기본 스타일 (선택 사항) */
                padding: isMobile ? "6px" : "8px",
                backgroundColor: "rgba(0, 255, 242, 0.1)",
                border: "1px solid rgba(0, 255, 242, 0.3)",
                color: "#00fff2",
                fontSize: isMobile ? "12px" : "13px",
                fontWeight: "500",
              }
            }
          >
            + 이 직업에 할일 추가
          </button>
        </div>
      )}
    </div>
  );
});

export default JobList;
