/**
 * "학생 스냅샷에서 무엇을 학생으로 볼 것인가" — 단일 진실원.
 *
 * 배경: `users where isAdmin == false` 스냅샷에는 학생만 있는 게 아니다. 교사 계정 중
 *   isAdmin 이 아직 안 박힌 것, 슈퍼관리자 보조 계정 등이 섞여 들어온다. 그래서 실제 필터는
 *   `classCode 있음 && !isSuperAdmin && !isTeacher` 이고, 이 판정이 **학급 목록**과
 *   **학급별 인원수** 양쪽의 기준이 된다.
 *
 * 왜 모으나: 2026-08-20 에 인원수 세는 쪽을 새로 만들면서 같은 판정식을 손으로 한 번 더
 *   적었다. 이 저장소는 바로 그 복붙(배치 분할 판정) 때문에 주급이 한 주 멎은 적이 있다
 *   (functions/batchChunk.js 참고). 한쪽만 고치면 "학급 목록엔 있는데 인원은 0"
 *   같은 조용한 불일치가 생기고, 그 숫자가 classes 문서에 씨앗으로 눌러앉는다.
 */

/** 이 문서를 '학생'으로 셀 것인가. classCode 가 없으면 어느 학급에도 속하지 않는다. */
function isStudentDoc(data) {
  if (!data || !data.classCode) return false;
  return !data.isSuperAdmin && !data.isTeacher;
}

/** 스냅샷에 실제로 학생이 있는 학급코드 목록(중복 제거, 추가 읽기 0). */
function classCodesFromStudentSnap(snap) {
  const codeSet = new Set();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (isStudentDoc(data)) codeSet.add(data.classCode);
  });
  return Array.from(codeSet);
}

/** 학급코드 → 학생 수. 위 목록과 **반드시 같은 판정**을 쓴다. */
function studentCountsFromSnap(snap) {
  const counts = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (isStudentDoc(data)) counts.set(data.classCode, (counts.get(data.classCode) || 0) + 1);
  });
  return counts;
}

module.exports = { isStudentDoc, classCodesFromStudentSnap, studentCountsFromSnap };
