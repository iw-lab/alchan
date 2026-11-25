// src/utils/salaryCalculator.js
// 급여 관련 순수 계산 로직 (Firebase 의존성 없음 - 테스트 가능)

/**
 * 급여 상수 — **클라이언트 표시 전용 사본**.
 *
 * 실제 지급 금액은 서버(`functions/salaryUtils.js` SALARY)가 결정한다. 클라는 별도 빌드라
 * functions/ 를 import 할 수 없어 값을 복제할 수밖에 없는데, 그 복제가 드리프트를 낳았다:
 *   · 2026-07-01 국무총리 보너스가 서버 한쪽만 수정돼 과다지급(bd77e49)
 *   · 2026-07-27 같은 화면 안에서 "계산 예시"와 "현재 기본급"이 다른 숫자를 보임
 *     — 수정이 한 곳만 되고 인라인 복제본은 남았다
 *
 * 그래서 ① 클라 값은 여기 한 곳에만 두고 ② 서버 값과 어긋나면
 * `src/test/utils/salaryConstantsSync.test.js` 가 실패한다. 한쪽만 바꾸면 CI 가 잡는다.
 */
export const CLIENT_SALARY = {
  BASE: 2000000, // 기본 주급(인상 배수 적용 전)
  ADDITIONAL: 500000, // 추가 직업당 가산(첫 직업 제외)
  PRESIDENT_BONUS: 2000000, // 대통령 추가 주급(교사 지정 직업에서만)
  DEFAULT_MAX_JOBS: 5, // 학생당 급여 계산 직업 상한 기본값
  MAX_BASE: 1e12, // 실효 기본급 상한(복리 폭주·오버플로 방지)
};

/**
 * 인상 배수를 반영한 '실효 기본급' — 서버 computeEffectiveBase 와 **같은 식**.
 * 화면 세 곳이 각자 `Math.round(2000000 * (multiplier || 1))` 을 인라인하고 있었다.
 *
 * MAX_BASE 클램프까지 그대로 옮긴 이유: 서버 nextBaseMultiplier 가 배수를 항상 상한 이하로
 * 묶으므로 정상 흐름에선 갈릴 일이 없지만, "같은 식"이라고 적어 놓고 다르면 그 주석이 거짓이 된다.
 * 동기화 테스트가 두 함수의 출력을 직접 비교하므로 이제 어긋나면 실패한다.
 * @param {number} baseMultiplier 누적 인상 배수(1 = 인상 없음)
 * @returns {number} 실효 기본급(정수)
 */
export const computeClientEffectiveBase = (baseMultiplier) => {
  const m = Number(baseMultiplier) > 0 ? Number(baseMultiplier) : 1;
  return Math.min(Math.round(CLIENT_SALARY.BASE * m), CLIENT_SALARY.MAX_BASE);
};
