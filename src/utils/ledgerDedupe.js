/**
 * 거래내역 화면의 **원장 중복 제거**.
 *
 * 이 앱은 돈이 움직일 때 원장을 둘 남긴다 — 서버가 `users/{uid}/transactions` 에
 * 권위 있는 한 줄을, 클라이언트가 `activity_logs` 에 표시용 한 줄을 쓴다.
 * 두 줄이 그대로 화면에 오르면 학생 눈에는 **"한 번 샀는데 두 번 빠져나갔다"** 로 보인다.
 * (2026-08-30 라이브 실측: 학생 1명의 활동로그 197건 중 76건이 거래원장과 짝이었다 —
 *  아이템 구매 50 · 국고 되팔기 14 · 주급 5 · 송금 7.)
 *
 * 🔴 **유형 목록으로 거르지 않는다.** 새 거래 유형이 생길 때마다 한쪽만 갱신되는 자리가 된다
 *    (이 저장소가 "N곳 중 M곳만 갱신"으로 여러 번 다친 모양이다). 대신 **금액이 같고 시각이
 *    가까운 것을 1:1 로 짝지어** 표시용 사본만 뺀다.
 *
 * 왜 1:1 인가: 같은 금액을 연달아 두 번 산 경우(실측 3초 간격)를 뭉개지 않기 위해서다.
 *   거래원장 줄 하나는 활동로그 하나와만 짝이 된다 — 거래가 2건이면 화면에도 2건 남는다.
 *   짝이 없는 활동로그(파킹통장처럼 원장이 하나뿐인 것)는 그대로 남는다.
 */

/**
 * Firestore Timestamp·초 객체·Date 무엇이 와도 ms 로. **모르면 0.**
 *
 * 🔴 0 은 "1970년"이 아니라 "모른다"는 뜻이다. 시각을 모르는 두 줄을 그대로 비교하면
 *    간격이 0 이 되어 **금액만 같으면 서로 다른 날짜의 거래가 짝이 된다**
 *    (2026-08-30 codex·Gemini 가 같은 자리를 CRITICAL 로 지적). 아래 짝짓기는 양쪽 시각이
 *    모두 유효한 양수일 때만 후보로 본다 — 모르면 짝짓지 않고 **남긴다**(중복이 남는 쪽이
 *    거래가 사라지는 쪽보다 낫다).
 */
export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  return 0;
};

/**
 * 설명에서 낱말을 뽑는다 — 숫자·금액·단위·괄호는 버린다.
 * 같은 사건의 두 줄은 서로 다른 문구를 쓰지만(예: "급식 우선권 1개 구매 (1,089,000알찬)" 과
 * "[관리자 상점] 급식 우선권 1개 (단가 1,089,000원)") **품목 이름은 공유한다.**
 * 실측: 진짜 짝 76건 **전부**가 두 글자 이상 낱말을 하나 이상 공유했다(76/76).
 */
const descriptionWords = (text) =>
  String(text || "")
    .replace(/[0-9,()[\]·원알찬]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);

const sharesWord = (a, b) => {
  const setA = new Set(descriptionWords(a));
  if (setA.size === 0) return false;
  return descriptionWords(b).some((word) => setA.has(word));
};

/**
 * 실측 간격 분포(중앙 316ms · 90% 1.5초 · 최대 3.46초)를 덮는 최소 창.
 * 더 넓히면 "연달아 같은 금액" 거래를 잘못 묶을 위험이 커진다.
 */
export const DUPLICATE_WINDOW_MS = 4000;

/**
 * 거래원장과 짝이 맞는 활동로그 줄을 뺀다.
 *
 * @param {Array} activityRows activity_logs 에서 온 줄 (금액 필드 보유)
 * @param {Array} ledgerRows   users/{uid}/transactions · 루트 transactions 에서 온 줄
 * @param {number} windowMs    같은 사건으로 볼 시간 창
 * @returns {Array} 화면에 남길 활동로그 줄
 */
export const dropDuplicateActivityRows = (
  activityRows,
  ledgerRows,
  windowMs = DUPLICATE_WINDOW_MS,
) => {
  const activity = Array.isArray(activityRows) ? activityRows : [];
  const ledger = Array.isArray(ledgerRows) ? ledgerRows : [];
  const paired = new Set();

  return activity.filter((act) => {
    const actAt = toMillis(act?.timestamp);
    // 시각을 모르면 짝짓지 않는다(위 toMillis 주석).
    if (!(actAt > 0)) return true;
    // 돈도 쿠폰도 안 움직인 줄은 애초에 짝짓기 대상이 아니다 —
    // 0 === 0 으로 아무거나 들어맞아 엉뚱한 기록이 사라진다(2026-08-30 Gemini).
    if ((act?.amount || 0) === 0 && (act?.couponAmount || 0) === 0) return true;

    let bestIndex = -1;
    let bestGap = Infinity;

    ledger.forEach((row, index) => {
      if (paired.has(index)) return;
      if ((row?.amount || 0) !== (act?.amount || 0)) return;
      if ((row?.couponAmount || 0) !== (act?.couponAmount || 0)) return;
      const rowAt = toMillis(row?.timestamp);
      if (!(rowAt > 0)) return;
      const gap = Math.abs(rowAt - actAt);
      if (gap > windowMs) return;
      // 🔒 금액·시각만으로는 **남남인 두 기록**이 우연히 겹칠 수 있다(2026-08-30 codex:
      //    원장 사본이 없는 파킹통장 기록이 같은 금액의 다른 거래와 짝이 되어 사라지는 자리).
      //    같은 사건이면 품목·상대 이름 같은 낱말을 공유한다 — 실측 76/76.
      if (!sharesWord(act?.description, row?.description)) return;
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) return true;
    paired.add(bestIndex);
    return false; // 권위 있는 쪽(거래원장)을 남기고 표시용 사본을 뺀다
  });
};
