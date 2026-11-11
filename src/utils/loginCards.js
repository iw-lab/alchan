// src/utils/loginCards.js — 로그인 카드에 찍을 내용(순수 함수).
// 🔒 비밀번호는 여기서 다루지 않는다. 서버에도 평문이 없고, 종이에 찍힌 비밀번호는 교실에 굴러다닌다.
//    카드에는 손으로 적는 빈칸만 둔다.
import { sortByStudentNumber, studentNumberOf, plainStudentName } from "./studentOrder";

/** 로그인 아이디 = 이메일의 @ 앞부분(학생 계정은 `아이디@학급코드.alchan`). */
export function loginIdOf(student) {
  const email = String(student?.email || "");
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : "";
}

/** 카드 한 장에 들어갈 값(번호순). 아이디가 없는 계정(깨진 문서)은 뺀다. */
export function buildLoginCards(students, { classCode } = {}) {
  return sortByStudentNumber(Array.isArray(students) ? students : [])
    .map((s) => ({
      key: s.id || s.email,
      number: studentNumberOf(s),
      name: plainStudentName(s),
      loginId: loginIdOf(s),
      classCode: String(classCode || s.classCode || "").toUpperCase(),
    }))
    .filter((c) => c.loginId);
}

/** n장씩 쪽으로 나눈다(A4 한 쪽 8장). */
export function paginate(list, perPage = 8) {
  const pages = [];
  for (let i = 0; i < list.length; i += perPage) pages.push(list.slice(i, i + perPage));
  return pages;
}
