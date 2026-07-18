// src/utils/jobPermissions.js
// 직업 판정 공용 헬퍼 (클라이언트 표시·UI 게이팅 전용).
//
// ⚠️ 여기 있는 함수는 "보여줄지 말지"만 결정한다. 실제 권한·급여는 서버가 다시 판정한다
//    (functions/jobUtils.js). 클라이언트 판정은 보안 경계가 아니다 — 2026-07-13 교차검증에서
//    학생이 users 문서를 직접 write 해 대통령을 자가임명하던 결함이 확인됐고, 그 뒤로
//    selectedJobIds·appointedJobIds는 rules에서 학생 write가 막혀 있다.
//
// 데이터 규약:
//   selectedJobIds  = 학생이 고른 일반 직업 (saveSelectedJobs callable 경유로만 저장)
//   appointedJobIds = 교사가 지정한 지정 전용 직업 (관리자만 write)

// appointedOnly 플래그가 없는 구버전 직업 문서용 fallback (functions/jobUtils.js와 동일 목록)
// 🔒 court-lock(2026-07-18, codex CRITICAL): 판사·경찰청장 추가(서버 functions/jobUtils.js와 동일 목록 유지).
//   합의금 CF에서 cash 권한을 갖는 역할이라 self-select 시 갈취 가능 → 대통령/국무총리처럼 임명 전용으로 강제.
//   클라 UI(Dashboard RESTRICTED_JOB_TITLES)에서도 학생 self-select 목록에서 제외됨(사용자 결정 2026-07-18).
export const APPOINTED_FALLBACK_TITLES = ["대통령", "국무총리", "판사", "경찰청장"];

export const isAppointedOnlyJob = (job) =>
  !!job &&
  (job.appointedOnly === true || APPOINTED_FALLBACK_TITLES.includes(job.title));

/** 어떤 형태로 저장돼 있든 문자열 id 배열로 정규화 (구버전 데이터 방어) */
export const toJobIdArray = (raw) => {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.keys(raw)
      : [];
  return arr.filter((id) => typeof id === "string" && id.length > 0);
};

/** 학생이 실제로 가진 직업 id 전체 = 교사 지정 + 본인 선택 (중복 제거) */
export const getEffectiveJobIds = (userDoc) => [
  ...new Set([
    ...toJobIdArray(userDoc?.appointedJobIds),
    ...toJobIdArray(userDoc?.selectedJobIds),
  ]),
];

/** 유효 직업 중 해당 직함이 있는지 — 화면 권한 표시용 */
export const hasJobTitle = (userDoc, jobs, title) => {
  if (!userDoc || !Array.isArray(jobs) || jobs.length === 0) return false;
  const ids = getEffectiveJobIds(userDoc);
  return jobs.some((job) => ids.includes(job.id) && job.title === title);
};
