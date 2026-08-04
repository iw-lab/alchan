/**
 * 토스트 — `alert()` 의 대체재.
 *
 * 왜 alert 을 걷어내나: 탭 전체를 얼린다. 학생이 태블릿에서 확인을 누르기 전까지
 * 화면을 못 보고, 뒤에 있던 금액·잔액을 가리고, 여러 개가 겹치면 순서대로 다 눌러야 한다.
 * 되돌릴 수도 없다.
 *
 * ## 왜 훅이 아니라 모듈 수준 싱글턴인가
 * 이 앱의 호출 지점이 589곳이다. 훅(`useToast()`)으로 만들면 컴포넌트 40여 개마다
 * 훅 호출을 새로 넣어야 하고, 컴포넌트가 아닌 곳(AuthContext 의 콜백 등)에서는 아예
 * 못 쓴다. 싱글턴이면 호출 지점 변경이 `alert(x)` → `toast.error(x)` 한 줄로 끝난다.
 * 화면 그리기는 여전히 React 가 한다(ToastHost 가 구독한다).
 *
 * ## 설계에서 신경 쓴 것
 *  · **실패는 자동으로 안 사라진다.** 성공이야 흘려보내도 되지만, 실패를 3초 뒤 지우면
 *    학생은 "돈을 냈는데 아무 일도 안 일어났다"로만 기억한다. 돈을 다루는 앱이라 특히.
 *  · 같은 메시지가 연달아 오면 쌓지 않는다 — 재시도 루프가 화면을 덮는 걸 막는다.
 *  · **호스트가 붙기 전 호출도 잃지 않는다.** 앱 초기화 중 뜨는 오류가 가장 중요한데,
 *    그때는 아직 React 가 안 그려졌다. 큐에 담아 두었다가 붙는 즉시 흘려보낸다.
 */

/** 성공·안내만 자동으로 사라진다(ms). null = 사용자가 닫아야 함 */
export const AUTO_DISMISS_MS = {
  success: 3500,
  info: 4500,
  error: null,
};

const listeners = new Set();

/**
 * 호스트가 붙기 전에 들어온 것들. 붙는 순간 비운다.
 * 상한을 두는 이유: 호스트가 영영 안 붙는 상황(초기화 실패)에서 무한히 쌓이면
 * 메모리만 먹고 아무도 못 본다.
 */
let pending = [];
const MAX_PENDING = 20;

function emit(kind, message) {
  // 문자열이 아닌 것이 들어와도 죽지 않게 한다 — alert 은 뭐든 받아줬다.
  const text =
    typeof message === "string" ? message : String(message ?? "");
  if (!text) return;

  const event = { kind, message: text };
  if (listeners.size === 0) {
    if (pending.length < MAX_PENDING) pending.push(event);
    return;
  }
  for (const fn of listeners) fn(event);
}

/** ToastHost 전용. 구독하면 밀린 것부터 받는다. */
export function subscribeToast(fn) {
  listeners.add(fn);
  if (pending.length > 0) {
    const backlog = pending;
    pending = [];
    for (const event of backlog) fn(event);
  }
  return () => listeners.delete(fn);
}

/** 테스트 전용 — 큐와 구독자를 비운다. */
export function __resetToast() {
  listeners.clear();
  pending = [];
}

export const toast = {
  /** 작업이 성공했다 (예: "저장했습니다") */
  success: (message) => emit("success", message),
  /** 실패했거나 못 하게 막았다 (예: "권한이 없습니다") — 자동으로 안 사라진다 */
  error: (message) => emit("error", message),
  /** 정보 전달 (예: "곧 시작합니다") */
  info: (message) => emit("info", message),
};

export default toast;
