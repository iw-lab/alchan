// src/utils/takeSignature.js
// 「같은 회수를 또 하려는가」를 가리는 순수 헬퍼.
//
// 배경: 2026-07-27 사고는 같은 −50,000,000 회수를 28분 뒤 한 번 더 누른 것이었다.
// 그때는 '마이너스 허용' 체크가 자동으로 꺼져 두 번째가 0원에서 멈췄지만, 2026-08-31
// 사용자 지시로 체크가 기본 켜짐이 되면서 그 방어가 사라졌다. 대신 확인창이
// 직전 회수를 알려 준다 — **막지 않고 보여만 준다**(정말 두 번 회수할 때가 있다).
//
// 컴포넌트가 아니라 여기 두는 이유: MoneyTransfer 를 import 하면 firebase 초기화가
// 딸려와 테스트에서 터진다. 판단 로직은 화면과 떼어 놓는다.

/**
 * 회수 한 건의 지문. 같은 지문 = 같은 회수.
 * 대상은 **정렬**해서 넣는다 — 선택 순서는 회수의 정체가 아니다.
 * @param {string} action "take" | "send"
 * @param {string} amountType "fixed" | "percentage"
 * @param {string|number} inputValue 입력한 금액 또는 퍼센트
 * @param {string[]} userIds 대상 학생 id 목록
 * @return {string}
 */
export const takeSignature = (action, amountType, inputValue, userIds) =>
  [
    action,
    amountType,
    String(inputValue),
    [...(userIds || [])].sort().join(","),
  ].join("|");

/**
 * 경과 시간을 확인창에 넣을 사람 말로. "방금" · "28분" · "2시간" · "3일".
 * 시계가 뒤로 간 경우(음수)도 "방금"으로 안전하게 떨어진다.
 * @param {number} ms
 * @return {string}
 */
export const describeElapsed = (ms) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간`;
  return `${Math.floor(hour / 24)}일`;
};
