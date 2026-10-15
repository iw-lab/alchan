import { stripNumberPrefix } from "./alias";

/**
 * 학생이 나오는 모든 목록의 순서·표시 정본 — 학번(번호) 순.
 *
 * 2026-10-15 사용자: 「돈보내기 가져오기 같은 학생들이 나오는 곳에 무조건 학번별로 배열해줘.
 * 학번 맨 앞에 최대한 크게 써주고」. 화면마다 가나다순 정렬을 따로 들고 있었고, 이름에
 * 「3번 별칭」이 섞여 있어 가나다순이면 10번이 2번보다 먼저 왔다. 정렬은 여기 하나만 쓴다.
 *
 * 번호 출처: users.studentNumber(정수, 운영 실측 61/62) → 없으면 이름 앞 「N번」(buildDisplayName).
 * 번호 없는 사람(교사·관리자·미입력)은 뒤로, 그 안에서는 가나다순.
 */
export const studentNumberOf = (member) => {
  const n = Number(member?.studentNumber);
  if (Number.isInteger(n) && n > 0) return n;
  const m = String(member?.name || member?.nickname || "").match(/^\s*(\d+)\s*번/);
  return m ? Number(m[1]) : null;
};

/** 화면용 이름에서 「N번 」을 뗀 이름(번호는 따로 크게 보여 준다). */
export const plainStudentName = (member) =>
  stripNumberPrefix(member?.name || member?.nickname || "") || "이름없음";

export const compareByStudentNumber = (a, b) => {
  const na = studentNumberOf(a);
  const nb = studentNumberOf(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na === null && nb !== null) return 1;
  if (na !== null && nb === null) return -1;
  return plainStudentName(a).localeCompare(plainStudentName(b), "ko");
};

export const sortByStudentNumber = (list) =>
  Array.isArray(list) ? [...list].sort(compareByStudentNumber) : [];

/** 드롭다운(<option>)처럼 글자 크기를 못 키우는 곳 — 번호를 맨 앞에. */
export const numberedStudentName = (member) => {
  const n = studentNumberOf(member);
  const name = plainStudentName(member);
  return n === null ? name : `${n}번 ${name}`;
};
