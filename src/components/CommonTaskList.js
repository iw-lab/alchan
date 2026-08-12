import React from "react";
import TaskItem from "./TaskItem";

// Dashboard에서 헤더를 관리하므로 여기서는 할일 목록만 렌더링
export default function CommonTaskList({
  tasks,
  isAdmin,
  onEditTask,
  onDeleteTask,
  onEarnCoupon,
  onRequestApproval,
}) {
  // tasks가 배열이 아니거나 비어있는 경우 표시할 내용
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return (
      <div className="p-5 text-center" style={{ color: "#6b7280" }}>
        {isAdmin
          ? "등록된 공통 할일이 없습니다. 관리자 설정에서 추가해주세요."
          : "현재 수행할 수 있는 공통 할일이 없습니다."}
      </div>
    );
  }

  // 모바일 감지
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div className="grid" style={{
      gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
      gap: isMobile ? "8px" : "10px",
    }}>
      {/* JobList 와 같은 규약: 핸들러는 그대로 넘기고 인자는 TaskItem 이 붙인다.
          공통 할일은 jobId 가 없으므로 TaskItem 이 (task, null) 로 부른다. */}
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          taskId={task.id}
          onEarnCoupon={onEarnCoupon}
          onRequestApproval={onRequestApproval}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
          isAdmin={isAdmin}
          isJobTask={false}
        />
      ))}
    </div>
  );
}
