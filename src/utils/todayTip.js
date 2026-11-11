// src/utils/todayTip.js — 「오늘의 제안」(학생 대시보드)와 「시작 도우미」(교사)의 판정(순수 함수).
// 2026-11-11 실사용 집계: 부동산(월 1건)·예금(9명)·대출 같은 기능이 거의 안 쓰였다 —
// 아이가 지금 가진 것에서 «다음에 해 볼 한 가지»를 골라 그 기능으로 데려간다.

/**
 * @param {object} st { cash, parkingBalance, depositCount, stockValue, propertyCount, loanCount, goalSet, known }
 *   known=false 면 자산 상세를 모른다(캐시 없음) — 누구에게나 맞는 제안만 낸다.
 * @param {number} seed 날짜 등으로 만든 수(같은 날에는 같은 제안)
 * @return {{id, text, to, label}|null}
 */
export function suggestNext(st, seed = 0) {
  const s = st && typeof st === "object" ? st : {};
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const out = [];
  if (s.known) {
    if (n(s.loanCount) > 0) out.push({ id: "repay", text: "갚을 대출이 있어요. 이자가 더 붙기 전에 조금이라도 갚아 볼까요?", to: "/banking", label: "은행 가기" });
    if (n(s.parkingBalance) <= 0 && n(s.cash) > 0) out.push({ id: "parking", text: "현금을 파킹통장에 넣어 두면 매일 이자가 붙어요.", to: "/banking", label: "통장에 넣기" });
    if (!s.goalSet) out.push({ id: "goal", text: "갖고 싶은 것을 «저축 목표»로 정해 보세요. 얼마나 모았는지 보여 줘요.", to: "/my-assets", label: "목표 정하기" });
    if (n(s.depositCount) <= 0 && n(s.parkingBalance) > 0) out.push({ id: "deposit", text: "한동안 안 쓸 돈은 예금에 넣으면 파킹통장보다 이자가 커요.", to: "/banking", label: "예금 알아보기" });
    if (n(s.stockValue) <= 0) out.push({ id: "stock", text: "주식을 한 주만 사 보세요. 값이 오르내리는 걸 직접 보는 게 공부예요.", to: "/stock-trading", label: "주식 거래소" });
    if (n(s.propertyCount) <= 0) out.push({ id: "estate", text: "교실 자리(부동산)를 사면 월세를 받을 수 있어요.", to: "/real-estate", label: "부동산 보기" });
  } else {
    out.push({ id: "assets", text: "내 돈이 어디에 얼마나 있는지 «나의 자산»에서 살펴보세요.", to: "/my-assets", label: "나의 자산" });
    out.push({ id: "book", text: "이번 주에 번 돈과 쓴 돈을 «가계부»로 확인해 보세요.", to: "/my-assets", label: "가계부 보기" });
  }
  if (!out.length) return null;
  // 급한 것(대출·통장)은 늘 먼저. 나머지는 날마다 돌아가며.
  const urgent = out.find((o) => o.id === "repay" || o.id === "parking");
  if (urgent) return urgent;
  const k = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return out[k % out.length];
}

/**
 * 교사 시작 도우미 — 할 일 목록.
 * @param {object} p { studentCount, jobCount, flags:{cards, report} }
 * @return {Array<{id, label, hint, to, done}>}
 */
export function guideSteps(p) {
  const s = p && typeof p === "object" ? p : {};
  const f = s.flags || {};
  return [
    { id: "students", label: "학생 계정 만들기", hint: "번호만 넣으면 한 번에 만들어져요", to: "/admin/students", done: Number(s.studentCount) > 0 },
    { id: "cards", label: "로그인 카드 인쇄해 나눠 주기", hint: "아이디·학급코드·접속 QR이 한 장에 8명씩", to: "/admin/students", done: !!f.cards },
    { id: "jobs", label: "직업과 할 일 정하기", hint: "주급은 금요일마다 자동으로 나가요", to: "/admin/job-settings", done: Number(s.jobCount) > 0 },
    { id: "report", label: "학급 경제 리포트 보기", hint: "우리 반 돈이 어디에, 누구에게 있는지", to: "/admin/economy-report", done: !!f.report },
  ];
}

const flagKey = (classCode) => `alchan_guide_${String(classCode || "").toUpperCase()}`;

/** 이 기기에서 한 일 표시(카드 인쇄·리포트 열람·닫기). 저장소가 막혀 있어도 던지지 않는다. */
export function readGuideFlags(classCode, storage) {
  try {
    // 저장소 조회 자체가 던지는 환경(보안 설정)이 있다 — 기본값도 try 안에서 꺼낸다.
    const st = storage === undefined ? globalThis.localStorage : storage;
    const v = JSON.parse(st?.getItem(flagKey(classCode)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function markGuideFlag(classCode, key, storage) {
  try {
    const st = storage === undefined ? globalThis.localStorage : storage;
    const next = { ...readGuideFlags(classCode, st), [key]: true };
    st?.setItem(flagKey(classCode), JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
}
