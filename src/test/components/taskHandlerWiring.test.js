/**
 * 할일 수정/삭제 배선 — **부모가 기대하는 인자를 자식이 실제로 넘기는가**.
 *
 * 이 배선은 조용히 틀려 있었다. Dashboard 는
 *   `onEditTask={(task) => handleEditTask(task, job.id)}`
 * 로 task **객체**를 기대했는데, JobList 는
 *   `onEditTask={() => onEditTask(task.id, job.id)}`
 * 로 **문자열 id** 를 넘겼다. `handleEditTask` 는 `taskToEdit.name`·`.reward`·`.maxClicks` 를
 * 읽으므로, 문자열이 들어오면 전부 undefined 가 되고 — 문자열은 truthy 라 `else` 분기의
 * "수정할 할일을 찾을 수 없습니다" 도 안 뜬다. **직업 카드에서 할일을 수정하면 폼이 빈 채로 열렸다.**
 * (같은 화면의 CommonTaskList 는 `commonTasks.find(...)` 로 객체를 만들어 넘겨 정상이었다 —
 *  한쪽만 빠진 형태라 더 안 보였다.)
 *
 * 지금은 TaskItem 이 자기 props 로 인자를 붙인다. 그 계약을 여기서 못 박는다:
 *   onEditTask(task 객체, jobId) · onDeleteTask(taskId 문자열, jobId)
 * 부수적으로 이 구조가 memo 도 되살린다 — 부모가 렌더마다 새 클로저를 만들지 않기 때문이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskItem from "../../components/TaskItem";

afterEach(cleanup);

const task = {
  id: "task_1",
  name: "칠판 지우기",
  reward: 5000,
  maxClicks: 5,
  clicks: 0,
};

function renderTaskItem(overrides = {}) {
  const onEditTask = vi.fn();
  const onDeleteTask = vi.fn();
  render(
    <TaskItem
      task={task}
      taskId={task.id}
      jobId="job_9"
      isAdmin={true}
      isJobTask={true}
      onEarnCoupon={vi.fn()}
      onRequestApproval={vi.fn()}
      onEditTask={onEditTask}
      onDeleteTask={onDeleteTask}
      {...overrides}
    />,
  );
  return { onEditTask, onDeleteTask };
}

describe("TaskItem 이 부모 핸들러에 넘기는 인자", () => {
  it("수정은 task **객체**를 넘긴다 (문자열 id 를 넘기면 수정 폼이 빈 채로 열린다)", async () => {
    const { onEditTask } = renderTaskItem();
    await userEvent.click(screen.getByLabelText("할일 수정"));

    expect(onEditTask).toHaveBeenCalledTimes(1);
    const [first, second] = onEditTask.mock.calls[0];
    expect(typeof first).toBe("object");
    expect(first).toMatchObject({
      id: "task_1",
      name: "칠판 지우기",
      reward: 5000,
      maxClicks: 5,
    });
    expect(second).toBe("job_9");
  });

  it("삭제는 taskId **문자열**을 넘긴다 (handleDeleteTask 시그니처)", async () => {
    const { onDeleteTask } = renderTaskItem();
    await userEvent.click(screen.getByLabelText("할일 삭제"));

    expect(onDeleteTask).toHaveBeenCalledWith("task_1", "job_9");
  });

  it("공통 할일(jobId 없음)은 두 번째 인자가 null 이다", async () => {
    const { onEditTask, onDeleteTask } = renderTaskItem({
      jobId: null,
      isJobTask: false,
    });
    await userEvent.click(screen.getByLabelText("할일 수정"));
    await userEvent.click(screen.getByLabelText("할일 삭제"));

    expect(onEditTask.mock.calls[0][1]).toBe(null);
    expect(onDeleteTask.mock.calls[0][1]).toBe(null);
  });

  it("학생(비관리자)에겐 수정·삭제 버튼이 없다", () => {
    renderTaskItem({ isAdmin: false });
    expect(screen.queryByLabelText("할일 수정")).toBeNull();
    expect(screen.queryByLabelText("할일 삭제")).toBeNull();
  });
});
