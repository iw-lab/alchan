// src/utils/vetoDeadline.js
// 🏛️ 거부권 재의결 기한 — 거부 시각(서버가 찍은 vetoDate) + 7일. 기한이 지나면 그 법안은 **폐기**된다.
//
// 같은 기준이 세 곳에 있다(하나만 바꾸면 src/test/utils/vetoDeadline.test.js 가 빨개진다):
//   · 화면 — 이 파일(폐기 표시·투표 버튼 숨김)
//   · rules — firestore.rules naVetoOpen(기한 뒤 학생 표·재의결 거부)
//   · 서버 — functions/vetoExpiry.js(매일 0시 상태를 veto_expired 로 확정)
//
// 왜 vetoDeadline 필드가 아니라 vetoDate 인가: vetoDeadline 은 대통령 기기 시각 + 7일이라
//   기기 시계에 따라 흔들리고, 짧게 넣으면 재의결을 막을 수 있다. vetoDate 는 rules 가 서버 시각만 받는다.
//   vetoDate 가 없는 옛 문서는 기한 없음(rules 도 같은 판정).

export const VETO_OVERRIDE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** 재의결 마감 시각(Date) — vetoDate 가 없으면 null(기한 없음). */
export function vetoDeadlineOf(law) {
  const vetoDate = toDate(law?.vetoDate);
  return vetoDate ? new Date(vetoDate.getTime() + VETO_OVERRIDE_DAYS * DAY_MS) : null;
}

/** 폐기된 법안인가 — 서버가 확정했거나(veto_expired), 거부 상태인데 기한이 지났다(확정 전). */
export function isVetoDiscarded(law, now = new Date()) {
  if (law?.status === "veto_expired") return true;
  if (law?.status !== "vetoed") return false;
  const deadline = vetoDeadlineOf(law);
  return !!deadline && now.getTime() >= deadline.getTime();
}
