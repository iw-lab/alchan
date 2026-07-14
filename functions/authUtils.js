/* eslint-disable */
/**
 * 권한 판정 순수 함수 (firebase-admin 의존 없음 → 단위 테스트 가능).
 *
 * 배경(2026-07-14 Gemini 교차검증):
 *   교사 회원가입은 공개돼 있고, 가입자가 자기 문서에 isAdmin:true를 넣을 수 있다
 *   (create 규칙은 isApproved:false이기만 하면 허용 — 슈퍼관리자 승인 대기 상태).
 *   그런데 rules와 서버 모두 승인 여부를 검사하지 않아서, 누구나 교사로 가입한 뒤
 *   classCode를 남의 학급으로 바꾸면(학급 참여는 정상 기능) 그 학급의 완전한 관리자가 됐다.
 *   → 관리자 권한은 '승인된' 계정에만 부여한다. 슈퍼관리자는 예외(운영 계정엔 isApproved 필드가 없다).
 */

/** 관리자 권한 보유 여부 — 승인된 교사 또는 슈퍼관리자만. */
const hasAdminPower = (userData) =>
  userData?.isSuperAdmin === true ||
  (userData?.isAdmin === true && userData?.isApproved === true);

/** 교사 특권(사용 한도·추첨 한도 면제 등) 보유 여부 — 승인된 교사/관리자만. */
const hasTeacherPower = (userData) =>
  hasAdminPower(userData) ||
  (userData?.isTeacher === true && userData?.isApproved === true);

module.exports = { hasAdminPower, hasTeacherPower };
