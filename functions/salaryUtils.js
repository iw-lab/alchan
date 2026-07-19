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
  BASE: 2000000, // 기본 주급
  ADDITIONAL: 500000, // 추가 직업당 가산(첫 직업 제외)
  PRESIDENT_BONUS: 2000000, // 대통령 추가 주급(교사 지정 appointed 직업에서만)
  DEFAULT_MAX_JOBS: 5, // 학생당 급여 계산 직업 상한 기본값(관리자 조절 가능)
};

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
 * @returns {{grossSalary:number, bonus:number, totalGross:number, tax:number, netSalary:number}}
 */
function computeSalaryAmounts(validJobCount, appointed, jobMap, taxRate) {
  const grossSalary =
    SALARY.BASE + Math.max(0, validJobCount - 1) * SALARY.ADDITIONAL;
  // 대통령 보너스는 '교사가 지정한' 직업(appointed)에서만, 중복 제거된 id 기준으로 지급.
  // 학생이 selectedJobIds에 대통령 id를 넣거나 같은 id를 여러 번 넣어도 가산되지 않는다.
  let bonus = 0;
  for (const jobId of appointed) {
    if (jobMap.get(jobId)?.title === "대통령") bonus += SALARY.PRESIDENT_BONUS;
  }
  const totalGross = grossSalary + bonus;
  const tax = Math.floor(totalGross * taxRate);
  const netSalary = totalGross - tax;
  return { grossSalary, bonus, totalGross, tax, netSalary };
}

module.exports = { SALARY, computeSalaryAmounts };
