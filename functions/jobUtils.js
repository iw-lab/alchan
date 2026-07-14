/* eslint-disable */
/**
 * 직업(jobs) 판정 공용 헬퍼 — 서버가 유일한 진실원.
 *
 * 배경(2026-07-13 FULL 교차검증):
 *   학생은 자기 users 문서를 직접 write 할 수 있어서, 클라이언트의 "지정 전용 직업 제외"
 *   필터는 보안 경계가 아니었다(devtools로 우회 가능). 실제로 selectedJobIds에 대통령
 *   직업 id를 넣으면 주급 보너스·할일 승인 권한까지 자가 획득됐다.
 *
 * 해결(B안):
 *   - appointedJobIds = 교사가 지정한 직업(지정 전용). rules상 관리자만 write.
 *   - selectedJobIds  = 학생이 고른 직업. saveSelectedJobs callable 경유로만 write.
 *   서버는 저장값을 신뢰하지 않고 매번 아래 규칙으로 재검증한다:
 *     · 존재하지 않는 직업 id(유령) 무시
 *     · 중복 id 제거 (중복으로 상한·보너스를 부풀리던 결함 차단)
 *     · selectedJobIds에 섞인 지정 전용 직업은 무효 (자가임명 차단)
 *     · appointedJobIds에 섞인 일반 직업은 무효 (경로 오염 차단)
 */

// appointedOnly 플래그가 없는 구버전 직업 문서용 fallback (클라 Dashboard.js와 동일 목록 유지)
const APPOINTED_FALLBACK_TITLES = ["대통령", "국무총리"];

const isAppointedJob = (jobData) =>
  !!jobData &&
  (jobData.appointedOnly === true ||
    APPOINTED_FALLBACK_TITLES.includes(jobData.title));

/** 어떤 형태로 저장돼 있든 문자열 id 배열로 정규화 (구버전 데이터·타입 오염 방어) */
const toJobIdArray = (raw) => {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.keys(raw)
      : [];
  return arr.filter((id) => typeof id === "string" && id.length > 0);
};

const dedupe = (ids) => [...new Set(ids)];

/** jobs 스냅샷 → Map<jobId, jobData> (해당 classCode 직업만) */
const buildJobMap = (jobsSnap) => {
  const map = new Map();
  jobsSnap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
};

/**
 * 학생의 유효 직업을 재계산한다. 저장값이 오염돼 있어도 여기서 전부 걸러진다.
 *
 * 개수 상한은 '지정 + 선택 합계'에 적용한다(기존 경제와 동일 — 대통령도 슬롯을 차지했다).
 * 교사 지정 직업이 우선 슬롯을 갖고, 남는 슬롯만큼만 학생 선택 직업이 인정된다.
 *
 * @param {object} userData users 문서 데이터
 * @param {Map<string, object>} jobMap 같은 학급 직업 맵
 * @param {number} maxJobsPerStudent 직업 개수 상한(지정 + 선택 합계 기준)
 * @returns {{selected: string[], appointed: string[], all: string[]}}
 */
const resolveStudentJobs = (userData, jobMap, maxJobsPerStudent) => {
  const cap =
    Number.isInteger(maxJobsPerStudent) && maxJobsPerStudent >= 1
      ? maxJobsPerStudent
      : 5;

  const appointed = dedupe(toJobIdArray(userData?.appointedJobIds)).filter(
    (id) => jobMap.has(id) && isAppointedJob(jobMap.get(id)),
  );

  // 지정 직업이 슬롯을 먼저 차지하고, 남은 슬롯만큼만 학생 선택분을 인정
  const remainingSlots = Math.max(0, cap - appointed.length);
  const selected = dedupe(toJobIdArray(userData?.selectedJobIds))
    .filter((id) => jobMap.has(id) && !isAppointedJob(jobMap.get(id)))
    .slice(0, remainingSlots);

  return { selected, appointed, all: [...appointed, ...selected] };
};

/**
 * 유효 직업 중 해당 직함(title)을 가진 직업이 있는지 — 권한 판정용.
 *
 * ⚠️ 권한 판정에는 개수 상한을 적용하지 않는다. 상한은 급여(farming 방지) 장치이지
 *    권한 장치가 아니며, 상한 때문에 잘린 직업의 권한을 부당하게 거부하면 안 된다
 *    (예: 교사가 상한을 6으로 올린 학급에서 6번째로 고른 경찰청장).
 *    자가임명 차단은 상한이 아니라 appointedJobIds 분리 + rules가 담당한다.
 */
const hasJobTitle = (userData, jobMap, title) => {
  const appointed = dedupe(toJobIdArray(userData?.appointedJobIds)).filter(
    (id) => jobMap.has(id) && isAppointedJob(jobMap.get(id)),
  );
  const selected = dedupe(toJobIdArray(userData?.selectedJobIds)).filter(
    (id) => jobMap.has(id) && !isAppointedJob(jobMap.get(id)),
  );
  return [...appointed, ...selected].some(
    (id) => jobMap.get(id)?.title === title,
  );
};

module.exports = {
  APPOINTED_FALLBACK_TITLES,
  isAppointedJob,
  toJobIdArray,
  buildJobMap,
  resolveStudentJobs,
  hasJobTitle,
};
