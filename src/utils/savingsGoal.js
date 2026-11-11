// src/utils/savingsGoal.js — 저축 목표(순수 함수). 목표는 표시용이고 돈을 움직이지 않는다.

export const GOAL_NAME_MAX = 20;
export const GOAL_AMOUNT_MAX = 1_000_000_000_000; // 1조 — 학급 화폐 인플레이션을 넉넉히 덮는다

/** 입력 검사. 통과하면 { ok:true, goal }, 아니면 { ok:false, error }. */
export function validateGoal(name, amount) {
  if (typeof name !== "string") return { ok: false, error: "무엇을 위해 모을지 적어 주세요." };
  const n = name.trim();
  if (!n) return { ok: false, error: "무엇을 위해 모을지 적어 주세요." };
  if (n.length > GOAL_NAME_MAX) return { ok: false, error: `이름은 ${GOAL_NAME_MAX}자까지예요.` };
  // 문자열·숫자만 받는다 — 문서에 객체가 들어 있으면 String() 이 던질 수 있다(교차검증 codex).
  if (typeof amount !== "string" && typeof amount !== "number") return { ok: false, error: "목표 금액을 숫자로 적어 주세요." };
  const a = Number(String(amount).replace(/[,\s]/g, ""));
  if (!Number.isFinite(a) || !Number.isInteger(a) || a <= 0) return { ok: false, error: "목표 금액을 숫자로 적어 주세요." };
  if (a > GOAL_AMOUNT_MAX) return { ok: false, error: "목표 금액이 너무 커요." };
  return { ok: true, goal: { name: n, amount: a } };
}

/** 저장된 값이 믿을 만한 목표인가(문서에 이상한 값이 들어 있어도 화면이 깨지지 않게). */
export function readGoal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const v = validateGoal(raw.name, raw.amount);
  return v.ok ? v.goal : null;
}

/** 진행률. saved = 통장·예금·적금에 모아 둔 돈(현금은 뺀다 — «모았다»는 건 따로 떼어 둔 돈이다). */
export function goalProgress(goal, saved) {
  if (!goal) return null;
  const s = Math.max(0, Number(saved) || 0);
  const ratio = Math.min(1, s / goal.amount);
  return { saved: s, ratio, percent: Math.floor(ratio * 100), left: Math.max(0, goal.amount - s), done: s >= goal.amount };
}
