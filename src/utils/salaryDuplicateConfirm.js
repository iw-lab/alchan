/**
 * 주급 지급 — "이미 이번 주에 줬는데 또 줄까요?" 를 묻는 한 곳.
 *
 * 막지 않는다. **묻고, 교사가 그렇다면 그대로 지급한다**
 * (사용자 결정 2026-08-06: "선생님이 누르면 두 번 줘도 된다").
 * 예전엔 금요일 자동 지급(scheduler-http.js) 뒤에 수동 지급 버튼을 누르면
 * 아무 경고 없이 두 번 나갔다.
 *
 * ⚠️ 컴포넌트 밖으로 뺀 이유는 두 가지다.
 *   ① 버튼이 둘(선택 지급·전체 지급)이라, 안에 두면 한쪽만 고쳐 다른 쪽이
 *      조용히 중복 지급하는 사고가 난다.
 *   ② AdminSettingsModal 은 3,900줄이라 이 흐름만 따로 테스트할 수가 없다.
 *      여기 있으면 확인창이 실제로 뜨는지·승인하면 정말 다시 부르는지를 검증할 수 있다.
 */
import { confirmDialog } from "./confirmDialog";

/**
 * 서버(functions/index.js batchPaySalaries)가 "이번 주에 이미 줬다"를 알릴 때 쓰는 코드.
 *
 * ⚠️ `already-exists` 가 **아니다**. 그 코드는 멱등키 중복 차단(checkIdempotent)이
 *    이미 쓰고 있다. 같이 쓰면 "재시도가 막혔다"를 "또 줄까요?"로 잘못 읽어,
 *    승인해도 같은 키라 또 막히고 또 묻는 고리에 빠진다. 둘은 다른 사건이다.
 */
export const DUPLICATE_CODE = "functions/failed-precondition";
/** 위 코드는 다른 이유로도 올 수 있으므로 details 로 한 번 더 좁힌다. */
export const DUPLICATE_REASON = "duplicate-week";

/** "2026-08-07T…" → "8월 7일 금" (교사는 주차 번호가 아니라 날짜를 읽는다). */
function formatPaidAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return ` (${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${dow})`;
}

/**
 * 상황별 안내 문구.
 *
 * ⚠️ 처음엔 어떤 경우든 "중복해서 한 번 더 지급하시겠습니까?" 하나로 물었다.
 *    그런데 **일부만 받은 경우** 그 문장은 사실을 감춘다 — 82명 중 3명만 받았다면
 *    지금 누르는 건 3명에겐 두 번째지만 79명에겐 **첫 번째**다. 교사가 "전원이 두 번
 *    받는다"고 오해하고 취소하면, 정작 79명은 주급을 못 받는다. 그래서 갈라 쓴다.
 *
 * @param {object} d 서버가 준 details
 * @return {{message: string, confirmText: string}}
 */
export function buildMessage(d) {
  // 표식 충돌 — 누가 얼마나 받았는지는 모른다(다른 요청이 먼저 커밋했거나,
  // 같은 주에 다른 묶음을 이미 지급했거나). 아는 것만 말한다.
  //
  // ⚠️ 예전엔 여기서도 "지금 지급하면 이번 주 주급이 한 번 더 나갑니다"라고 **단정**했다.
  //    표식은 학급+주 단위 문서 하나라 **학생 집합과 무관**하다 — 82명을 두 묶음으로
  //    나눠 지급하면 두 번째 묶음은 이번 주 첫 지급인데도 이 분기로 떨어진다.
  //    그때 "한 번 더 나간다"는 거짓이고, 교사가 그 말을 믿고 취소하면 그 학생들은
  //    이번 주 주급을 못 받는다. 취소는 교사가 의도한 동작이라 경고도 안 뜬다.
  //    (2026-08-10 교차검증: codex·claude 두 계열 확정)
  //    아래 `notPaid > 0` 분기에서 같은 오해를 막으려고 문구를 갈라놨는데,
  //    정작 **정보가 가장 없는 이 분기**에만 단정형이 남아 있었다.
  //    서버도 details 에 인원을 못 담는 상황이므로, 문구는 모른다는 사실까지 말한다.
  if (d.raced || !(d.alreadyPaidCount > 0)) {
    return {
      message:
        "이번 주에 이미 주급 지급이 실행된 기록이 있습니다.\n" +
        "다만 지금 선택한 학생들이 그때 받았는지는 확인되지 않았습니다.\n\n" +
        "이미 받은 학생이 있다면 두 번째 지급이 되고,\n" +
        "아직 못 받은 학생에게는 이번이 첫 지급입니다.\n계속하시겠습니까?",
      confirmText: "지급하기",
    };
  }

  const when = formatPaidAt(d.lastPaidAt);
  const sample = d.sampleNames?.length
    ? ` (${d.sampleNames.join(", ")}${
        d.alreadyPaidCount > d.sampleNames.length ? " 외" : ""
      })`
    : "";
  const notPaid = (d.targetCount ?? 0) - d.alreadyPaidCount;

  if (notPaid > 0) {
    return {
      message:
        `이미 이번 주에 주급을 받은 학생이 있습니다.${when}\n` +
        `${d.targetCount}명 중 ${d.alreadyPaidCount}명이 받았습니다.${sample}\n\n` +
        `지금 지급하면 이미 받은 ${d.alreadyPaidCount}명은 두 번째, ` +
        `나머지 ${notPaid}명은 첫 번째 지급입니다.\n계속하시겠습니까?`,
      confirmText: "전원 지급",
    };
  }

  return {
    message:
      `이미 이번 주에 주급을 지급했습니다.${when}\n` +
      `${d.alreadyPaidCount}명 모두 받았습니다.${sample}\n\n` +
      `한 번 더 지급하면 학생들은 이번 주 주급을 두 번 받습니다.\n계속하시겠습니까?`,
    confirmText: "중복 지급",
  };
}

/**
 * @param {(payload:object)=>Promise<object>} mutateAsync 실제 지급 호출
 * @param {{studentIds: string[], payAll: boolean}} payload
 * @return {Promise<object|null>} 지급 결과. 교사가 중복 지급을 거절하면 null.
 */
export async function paySalariesAskingIfDuplicate(mutateAsync, payload) {
  try {
    return await mutateAsync(payload);
  } catch (error) {
    // 이 사건이 아니면 진짜 오류다 — 호출부가 처리하도록 그대로 올려보낸다.
    // ⚠️ 코드만 보고 넘기면 다른 failed-precondition 까지 "또 줄까요?"로 둔갑한다.
    const d = error?.details || {};
    if (error?.code !== DUPLICATE_CODE || d.reason !== DUPLICATE_REASON) {
      throw error;
    }
    const { message, confirmText } = buildMessage(d);
    const ok = await confirmDialog(message, { danger: true, confirmText });
    if (!ok) return null;

    // 교사가 승인했다 — 같은 요청에 승인 표시만 얹어 다시 보낸다.
    return await mutateAsync({ ...payload, confirmDuplicate: true });
  }
}
