/**
 * KST 기준 날짜 문자열.
 *
 * 이 앱의 "하루"는 전부 KST 자정 경계다 — 주급·세금·출석·할일 리셋·상품 만기 모두.
 * UTC 로 판정하면 KST 09:00 에 날짜가 넘어가서, 오전 수업 중에 "어제"가 "오늘"이 된다.
 *
 * 순수 함수라 파이어베이스를 끌고 오지 않는다(테스트에서 그대로 부를 수 있다).
 *
 * @param {number} [nowMs] epoch ms. 테스트에서 경계를 고정할 때 넘긴다.
 * @returns {string} "YYYY-MM-DD"
 */
export function kstDateString(nowMs = Date.now()) {
  return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

export default kstDateString;
