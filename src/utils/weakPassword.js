// src/utils/weakPassword.js
// «비밀번호가 아이디와 같다»는 표시 — 로그인할 때 이 기기에만 남긴다(서버로 안 보낸다. 비밀번호 자체는 저장하지 않는다).
// 학생 계정은 일괄 생성 때 비밀번호 = 아이디로 만들어져 대부분 그대로다(2026-08-31 실측 47명 중 41명).
// 표시가 있으면 화면 위에 «비밀번호를 바꿔 주세요» 한 줄을 띄운다(AlchanHeader).
const KEY = "alchan_weak_pw_uid";

export const isSameAsId = (studentId, password) =>
  !!studentId &&
  !!password &&
  String(studentId).trim().toLowerCase() === String(password).trim().toLowerCase();

/** 로그인 성공 직후 호출 — 같으면 그 계정(uid)에 표시, 다르면 지운다. */
export const rememberWeakPassword = (uid, studentId, password) => {
  try {
    if (uid && isSameAsId(studentId, password)) localStorage.setItem(KEY, uid);
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 써도 로그인은 계속한다 */
  }
};

/** 지금 로그인한 계정이 표시된 계정인지 — 다른 학생이 같은 기기에 로그인하면 안 뜬다. */
export const hasWeakPassword = (uid) => {
  try {
    return !!uid && localStorage.getItem(KEY) === uid;
  } catch {
    return false;
  }
};

export const clearWeakPassword = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
};
