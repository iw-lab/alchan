// functions/salaryUtils.js
// 주급(급여) 계산 단일 진실원(single source of truth).
//
// ⚠️ 과거 이 계산 로직이 functions/index.js(batchPaySalaries 수동 지급)와
//    functions/scheduler-http.js(금요일 주간 자동 지급) 두 곳에 그대로 복제돼 있었고,
//    한쪽만 수정되는 드리프트로 과다지급 버그(국무총리 보너스, 커밋 bd77e49)가 발생했다.
//    → 순수 계산 함수로 추출해 양쪽이 동일 함수를 호출하도록 봉인(P7 공식 단일화, 2026-07-19).
//
// 클라이언트(src/components/modals/AdminSettingsModal.js)는 별도 빌드(functions/ import 불가)라
// 여전히 자체 상수를 갖지만 표시/미리보기 전용이며, 실제 지급은 서버(이 모듈)가 결정한다.
// 클라 상수를 바꿀 땐 이 파일도 함께 갱신할 것(역도 동일).

const SALARY = {
  BASE: 2000000, // 기본 주급(인상 배수 적용 전 기준값)
  ADDITIONAL: 500000, // 추가 직업당 가산(첫 직업 제외) — 인상 대상 아님(고정)
  PRESIDENT_BONUS: 2000000, // 대통령 추가 주급(교사 지정 appointed 직업에서만) — 인상 대상 아님(고정)
  DEFAULT_MAX_JOBS: 5, // 학생당 급여 계산 직업 상한 기본값(관리자 조절 가능)
  // ── 주간 기본급 복리 인상(2026-07-21) ──
  //   교사 설정 salaryIncreaseRate(settings/salarySettings_{classCode})만큼
  //   매주 기본급이 복리로 오른다.
  //   인상 대상은 '기본급'만 — 직업가산·보너스는 고정(사용자 결정 2026-07-21).
  DEFAULT_RAISE_RATE: 0.05, // 기본 인상률 5%/주
  MAX_RAISE_RATE: 1, // 인상률 상한 100%/주 (오설정 폭주 방지)
  MAX_BASE: 1e12, // 실효 기본급 상한 (복리 폭주·오버플로 방지)
};

/**
 * 복리 인상 배수를 적용한 '실효 기본급'.
 * 배수가 없거나 이상하면 원래 기본급으로 폴백.
 * @param {number} baseMultiplier 누적 인상 배수(1.0 = 인상 없음)
 * @return {number} 실효 기본급(정수)
 */
function computeEffectiveBase(baseMultiplier) {
  const m =
    Number.isFinite(baseMultiplier) && baseMultiplier > 0 ? baseMultiplier : 1;
  return Math.min(Math.round(SALARY.BASE * m), SALARY.MAX_BASE);
}

/**
 * 다음 주에 쓸 인상 배수 = 현재 배수 × (1 + 인상률).
 * 이상값은 안전하게 클램프.
 * @param {number} current 현재 누적 배수
 * @param {number} rate 이번 주 적용 인상률(교사 설정)
 * @return {number} 다음 배수
 */
function nextBaseMultiplier(current, rate) {
  const m = Number.isFinite(current) && current > 0 ? current : 1;
  const r = Number.isFinite(rate) ?
    Math.min(Math.max(rate, 0), SALARY.MAX_RAISE_RATE) :
    SALARY.DEFAULT_RAISE_RATE;
  const next = m * (1 + r);
  // 실효 기본급이 상한을 넘지 않는 선에서만 증가(무한 복리 방지)
  const cap = SALARY.MAX_BASE / SALARY.BASE;
  return Number.isFinite(next) ? Math.min(next, cap) : m;
}

/**
 * 학생 1명의 세전총액·세금·세후 급여 계산(순수 함수, 부수효과 없음).
 * validJobCount/appointed는 호출자가 resolveStudentJobs(functions/jobUtils.js)로
 * 재검증한 결과를 넘긴다(유령 id 제외·중복 제거·상한 적용·임명전용 규약 반영 완료).
 *
 * ⚠️ 이 계산식은 batchPaySalaries·주간 스케줄러와 반드시 동일해야 하므로 절대 인라인 복제하지 말 것.
 *
 * @param {number} validJobCount 재검증된 유효 직업 수
 * @param {string[]} appointed 교사 지정(appointed) 직업 id 목록(대통령 보너스 판정용)
 * @param {Map} jobMap jobId -> {title, ...} 맵(buildJobMap 결과)
 * @param {number} taxRate 세율(호출자가 이미 sanitize한 유한수)
 * @param {number} [baseSalary] 실효 기본급(복리 인상 반영값). 생략 시 인상 없는 기본급.
 *   ⚠️ 인상은 기본급에만 적용 — ADDITIONAL(직업가산)·PRESIDENT_BONUS는 고정이다.
 * @return {{grossSalary:number, bonus:number, totalGross:number,
 *   tax:number, netSalary:number}}
 */
function computeSalaryAmounts(
    validJobCount, appointed, jobMap, taxRate, baseSalary,
) {
  const base =
    Number.isFinite(baseSalary) && baseSalary >= 0 ?
      Math.min(baseSalary, SALARY.MAX_BASE) :
      SALARY.BASE;
  const grossSalary =
    base + Math.max(0, validJobCount - 1) * SALARY.ADDITIONAL;
  // 대통령 보너스는 '교사가 지정한' 직업(appointed)에서만, 중복 제거된 id 기준으로 지급.
  // 학생이 selectedJobIds에 대통령 id를 넣거나 같은 id를 여러 번 넣어도 가산되지 않는다.
  let bonus = 0;
  for (const jobId of appointed) {
    if (jobMap.get(jobId)?.title === "대통령") bonus += SALARY.PRESIDENT_BONUS;
  }
  const totalGross = grossSalary + bonus;
  const tax = Math.floor(totalGross * taxRate);
  const netSalary = totalGross - tax;
  return {grossSalary, bonus, totalGross, tax, netSalary};
}

/**
 * 주차 키(KST 기준). 거래내역 라벨과 '이번 주 이미 지급했나' 판정에 함께 쓴다.
 *
 * ⚠️ ISO 8601 주차가 **아니다**. 1월 1일부터 7일씩 끊는 단순 주차라 연초에
 *    ISO 와 어긋난다. 그래도 이 공식을 그대로 두는 이유는, 이미 저장된
 *    activity_logs.weekKey 수천 건과 schedulerLocks/weeklySalary 가 이 값으로
 *    적혀 있어서 공식을 바꾸면 **과거 기록과 대조가 안 되기** 때문이다.
 *    바꾸려면 마이그레이션이 따로 필요하다.
 *
 * ⚠️ 원래 공식은 `new Date(y, 0, 1)` 과 `getFullYear()` 를 썼다 — 둘 다 **서버 로컬
 *    시간** 기준이라, 같은 순간이 환경에 따라 다른 주차가 됐다. 실측:
 *      2026-08-11T06:00:00.001Z → TZ=UTC 이면 2026-W32, TZ=Asia/Seoul 이면 2026-W33
 *    운영 Cloud Functions 는 UTC 라 지금까지 문제가 안 났을 뿐이고, 에뮬레이터·개발자
 *    기기·런타임 TZ 변경이면 저장된 weekKey 와 판정이 어긋난다.
 *    그래서 UTC 고정 함수(`Date.UTC`·`getUTC*`)로 바꿨다 —
 *    **운영(UTC)에서는 결과가 한 글자도 안 바뀌고**, 다른 환경에서만 운영과 같아진다.
 *
 * @param {Date} date 판정 기준 시각
 * @return {string} 예: "2026-W32"
 */
function computeWeekKey(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const days = (kst.getTime() - Date.UTC(year, 0, 1)) / 86400000;
  return `${year}-W${Math.ceil((days + 1) / 7)}`;
}

/**
 * 이번 급여 주(월요일 09:00 KST 자동 지급 기준)의 시작 = **그 주 월요일 00:00 KST**.
 *
 * ⚠️ 중복 판정에 `computeWeekKey` 를 쓰면 안 된다. 그 주차는 1월 1일부터 7일씩
 *    끊어서 **월요일에 시작하지 않는다** — 2026년 8월엔 수요일에 넘어간다(실측).
 *    주급 자동 지급은 월요일(`schedule: "0 0 * * 1,5"` = KST 월 09:00)이므로,
 *    월요일에 자동 지급된 뒤 교사가 **수·목·금**에 수동 지급하면 주차가 이미
 *    넘어가 "이미 줬다"를 못 잡는다. 교사가 말하는 "이번 주"와도 어긋난다.
 *    그래서 판정만큼은 월요일 기준으로 따로 계산한다.
 *    (`computeWeekKey` 는 거래내역 **라벨**과 스케줄러 잠금에 계속 쓴다 —
 *     이미 저장된 기록 수천 건이 그 값이라 바꾸려면 마이그레이션이 필요하다.)
 *
 * @param {Date} date 기준 시각
 * @return {number} 그 주 월요일 00:00 KST 의 epoch ms
 */
function startOfPayWeek(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일 … 1=월
  const daysSinceMonday = (dow + 6) % 7; // 월=0, 화=1 … 일=6
  const mondayKstMidnight = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - daysSinceMonday,
  );
  return mondayKstMidnight - 9 * 60 * 60 * 1000; // 다시 실제 시각으로
}

/**
 * 이 학생이 **이번 급여 주**에 주급을 받았고 **아직 회수되지 않았는가**.
 *
 * 교사가 주급 버튼을 눌렀을 때 "이미 이번 주에 지급했습니다, 중복 지급할까요?"를
 * 물을지 결정하는 유일한 판정이다(사용자 결정 2026-08-06: 막지 말고 묻기).
 *
 * ⚠️ `lastSalaryDate` 만 보면 안 된다. reverseSalaryOnce 는 회수할 때
 *    lastNetSalary 만 0으로 만들고 **lastSalaryDate 는 그대로 둔다**.
 *    날짜만 보면 지급했다 회수한 학생까지 '받은 사람'으로 세어, 회수 직후
 *    재지급할 때 쓸데없이 경고가 뜬다. 두 필드를 함께 봐야 뜻이 맞는다.
 *
 * @param {object} student users 문서 데이터(lastNetSalary, lastSalaryDate)
 * @param {number} weekStartMs startOfPayWeek 결과
 * @return {boolean}
 */
function wasPaidInWeek(student, weekStartMs) {
  if (!student || !Number.isFinite(weekStartMs)) return false;
  // 0·null·undefined·문자열 모두 안전하게 걸러낸다(회수됐거나 미지급).
  if (!(Number(student.lastNetSalary) > 0)) return false;
  const raw = student.lastSalaryDate;
  if (!raw) return false;
  // Firestore Timestamp | Date | ISO 문자열 어느 쪽이 와도 Date 로.
  const paidAt = typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
  if (!(paidAt instanceof Date) || Number.isNaN(paidAt.getTime())) return false;
  return paidAt.getTime() >= weekStartMs;
}

/** 표식 문서 id 용 — 그 주 월요일의 KST 날짜("2026-08-10"). */
function payWeekId(date) {
  return new Date(startOfPayWeek(date) + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * 이 사용자가 **주급을 받을 대상**인가.
 *
 * ⚠️ batchPaySalaries 는 대상 목록을 두 경로로 만든다(payAll = classCode 쿼리 /
 *    studentIds = UID 직접 조회). 예전엔 payAll 쪽에만 학급·역할 필터가 있었고
 *    studentIds 쪽엔 **둘 다 없어서**, UID만 알면 남의 학급 학생에게 지급할 수 있었고
 *    교사·관리자 계정에도 주급이 나갔다(2026-08-10 교차검증). 지급은 발행이라
 *    호출자 잔액이 줄지 않아 억제력도 없다.
 *    분기마다 필터를 복붙하면 또 한쪽만 고치게 되므로 판정은 여기 한 곳에만 둔다.
 *
 * @param {object} student users 문서(+id)
 * @param {{classCode: string, isSuperAdmin: boolean}} caller 요청한 관리자
 * @return {{ok: boolean, reason?: string}} reason 은 로그용(사용자에게 노출 안 함)
 */
function isPayableTarget(student, caller) {
  if (!student) return {ok: false, reason: "빈 대상"};
  // 교사·관리자 계정은 학생이 아니다.
  if (student.isAdmin || student.isSuperAdmin || student.isTeacher) {
    return {ok: false, reason: "교사·관리자"};
  }
  // 슈퍼관리자는 학급 경계 없음 — 관리 화면이 전 학급 학생을 보여주는 기존 동작 유지.
  if (caller && caller.isSuperAdmin === true) return {ok: true};
  // 교사는 자기 학급만. classCode 가 비어 있는 문서도 통과시키지 않는다.
  if (!caller || !caller.classCode || student.classCode !== caller.classCode) {
    return {ok: false, reason: `다른 학급(${student.classCode || "미지정"})`};
  }
  return {ok: true};
}

module.exports = {
  SALARY,
  computeSalaryAmounts,
  computeEffectiveBase,
  nextBaseMultiplier,
  computeWeekKey,
  startOfPayWeek,
  payWeekId,
  wasPaidInWeek,
  isPayableTarget,
};
