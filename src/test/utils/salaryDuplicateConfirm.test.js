/**
 * "이미 이번 주에 주급을 지급했습니다 — 중복 지급하시겠습니까?" 흐름 검증.
 *
 * 사용자 요구(2026-08-06): **막지 말고 물어보라.** 그래서 확인해야 할 것이 셋이다.
 *   ① 경고가 실제로 화면에 뜨는가 (안 뜨면 예전처럼 조용히 두 번 나간다)
 *   ② 승인하면 정말 `confirmDuplicate: true` 로 **다시** 보내는가 (안 보내면 못 준다)
 *   ③ 거절하면 한 푼도 안 나가는가
 * 진짜 ConfirmHost 를 띄워서 확인한다 — 확인창을 흉내 내면 아무것도 증명 못 한다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ConfirmHost from "../../components/ConfirmHost";
import { __resetConfirm } from "../../utils/confirmDialog";
import {
  paySalariesAskingIfDuplicate,
  buildMessage,
  DUPLICATE_CODE,
  DUPLICATE_REASON,
} from "../../utils/salaryDuplicateConfirm";

beforeEach(() => __resetConfirm());
afterEach(() => __resetConfirm());

/** 서버가 던지는 already-exists 를 그대로 흉내 낸다. */
const duplicateError = (details) =>
  Object.assign(new Error("이미 이번 주에 주급을 지급했습니다."), {
    code: DUPLICATE_CODE,
    details: { reason: DUPLICATE_REASON, ...details },
  });

const DETAILS = {
  weekKey: "2026-W32",
  lastPaidAt: "2026-08-07T03:00:00.000Z", // KST 2026-08-07(금) 정오
  alreadyPaidCount: 82,
  targetCount: 82,
  sampleNames: ["김철수", "이영희", "박민수"],
};

const PAYLOAD = { studentIds: [], payAll: true };

/** 첫 호출은 중복 오류, 두 번째부터는 성공하는 mutate. */
const makeMutate = () => {
  const calls = [];
  const fn = vi.fn(async (payload) => {
    calls.push(payload);
    if (calls.length === 1) throw duplicateError(DETAILS);
    return { success: true, summary: { totalStudentsPaid: 82 } };
  });
  return { fn, calls };
};

describe("서버와의 계약", () => {
  // ⚠️ 이 두 값은 클라이언트 혼자 정하는 게 아니라 **서버와 맞춰야 하는 약속**이다.
  //    처음엔 상수(DUPLICATE_CODE)로만 테스트를 썼더니, 값을 통째로 바꿔도 테스트가
  //    전부 통과했다(실측) — 상수를 쓰는 쪽과 정의하는 쪽이 같이 움직이기 때문이다.
  //    그래서 값 자체를 못 박고, 서버 코드에 같은 문자열이 있는지도 확인한다.
  it("코드·이유 문자열이 고정돼 있다", () => {
    expect(DUPLICATE_CODE).toBe("functions/failed-precondition");
    expect(DUPLICATE_REASON).toBe("duplicate-week");
  });

  it("⭐ 서버(functions/index.js)가 같은 코드·이유로 던진다", () => {
    // ⚠️ `new URL(..., import.meta.url)` 은 vitest 변환 후 file: 스킴이 아니라 터진다(실측).
    //    테스트는 프로젝트 루트에서 도므로 cwd 기준으로 읽는다.
    const src = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
    const block = src.slice(
      src.indexOf("exports.batchPaySalaries"),
      src.indexOf("exports.reverseSalaryOnce"),
    );
    expect(block.length).toBeGreaterThan(1000); // 구간을 제대로 잘랐는지
    // 클라이언트는 "functions/" 접두사를 붙여 받는다 — 서버 쪽은 접두사가 없다.
    expect(block).toContain(`"${DUPLICATE_CODE.replace("functions/", "")}"`);
    expect(block).toContain(`reason: "${DUPLICATE_REASON}"`);
    // 멱등키 차단은 **다른** 코드여야 한다(같으면 되묻는 고리에 빠진다).
    expect(block).toContain(`"already-exists"`);
  });
});

describe("안내 문구 — 교사가 무슨 일이 벌어지는지 알 수 있어야 한다", () => {
  it("⭐ 일부만 받은 경우 '나머지는 첫 번째 지급'이라고 분명히 말한다", () => {
    // ⚠️ 이걸 안 쓰면 교사가 "전원이 두 번 받는다"로 오해하고 취소한다.
    //    그러면 아직 못 받은 79명은 이번 주 주급을 **아예 못 받는다**.
    const { message, confirmText } = buildMessage({
      reason: DUPLICATE_REASON,
      lastPaidAt: "2026-08-07T03:00:00.000Z",
      alreadyPaidCount: 3,
      targetCount: 82,
      sampleNames: ["김철수", "이영희", "박민수"],
    });
    expect(message).toContain("82명 중 3명이 받았습니다");
    expect(message).toContain("이미 받은 3명은 두 번째");
    expect(message).toContain("나머지 79명은 첫 번째 지급");
    expect(confirmText).toBe("전원 지급");
  });

  it("전원이 받은 경우엔 '두 번 받는다'고 못 박고 버튼도 '중복 지급'", () => {
    const { message, confirmText } = buildMessage({
      reason: DUPLICATE_REASON,
      lastPaidAt: "2026-08-07T03:00:00.000Z",
      alreadyPaidCount: 82,
      targetCount: 82,
      sampleNames: ["김철수", "이영희", "박민수"],
    });
    expect(message).toContain("82명 모두 받았습니다");
    expect(message).toContain("이번 주 주급을 두 번 받습니다");
    expect(message).not.toContain("첫 번째 지급");
    expect(confirmText).toBe("중복 지급");
  });

  it("⭐ 주차 번호(2026-W32) 대신 사람이 읽는 날짜를 보여준다", () => {
    // "2026-W32"는 교사가 읽는 말이 아니다. 게다가 이 앱의 주차는 월요일에
    // 시작하지도 않아서(1월 1일 기준 7일씩) 더 헷갈린다.
    const { message } = buildMessage({
      reason: DUPLICATE_REASON,
      weekKey: "2026-W32",
      lastPaidAt: "2026-08-07T03:00:00.000Z", // KST 8월 7일 금요일
      alreadyPaidCount: 82,
      targetCount: 82,
    });
    expect(message).toContain("8월 7일 금");
    expect(message).not.toContain("W32");
  });

  it("날짜가 없거나 망가져도 문구가 깨지지 않는다", () => {
    for (const bad of [null, undefined, "언젠가"]) {
      const { message } = buildMessage({
        reason: DUPLICATE_REASON,
        lastPaidAt: bad,
        alreadyPaidCount: 82,
        targetCount: 82,
      });
      expect(message).toContain("82명 모두 받았습니다");
      expect(message).not.toContain("undefined");
      expect(message).not.toContain("NaN");
    }
  });

  it("⭐ 경쟁 감지(raced)는 아는 것만 말한다 — 인원수를 지어내지 않는다", () => {
    const { message, confirmText } = buildMessage({
      reason: DUPLICATE_REASON,
      raced: true,
    });
    expect(message).toContain("이번 주에 이미 주급 지급이 실행된 기록이 있습니다");
    expect(message).not.toMatch(/\d+명/);
    expect(confirmText).toBe("지급하기");
  });

  // 2026-08-10 교차검증(codex·claude 두 계열 확정)에서 나온 회귀.
  //   표식(salaryRuns/{classCode}_{payWeekId})은 학급+주 단위 문서 하나라 **학생 집합과
  //   무관**하다. 82명을 두 묶음으로 나눠 지급하면 두 번째 묶음은 이번 주 첫 지급인데도
  //   이 분기로 떨어진다. 그때 "한 번 더 나간다"고 단정하면 거짓이고, 교사가 믿고 취소하면
  //   그 학생들은 이번 주 주급이 0원인 채 조용히 넘어간다(취소는 의도한 동작이라 경고도 없다).
  //   문구가 다시 단정형으로 돌아가지 못하게 못을 박는다.
  it("⭐ 경쟁 감지(raced)는 '한 번 더 나간다'고 단정하지 않는다 — 첫 지급일 수 있다", () => {
    const { message } = buildMessage({
      reason: DUPLICATE_REASON,
      raced: true,
    });
    // 확정적 거짓 주장 금지
    expect(message).not.toContain("한 번 더 나갑니다");
    expect(message).not.toContain("두 번 받습니다");
    // 모른다는 사실 + 첫 지급 가능성을 반드시 알린다
    expect(message).toContain("확인되지 않았습니다");
    expect(message).toContain("첫 지급");
  });
});

describe("주급 중복 지급 확인", () => {
  it("⭐ 경고 창이 실제로 뜨고, 주차·인원·이름이 보인다", async () => {
    render(<ConfirmHost />);
    const { fn } = makeMutate();
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD);
    });

    const msg = await screen.findByText(/이미 이번 주에 주급을 지급했습니다/);
    expect(msg.textContent).toContain("82명 모두 받았습니다");
    expect(msg.textContent).toContain("김철수, 이영희, 박민수");
    // 되돌릴 수 없는 작업이라 확인 버튼 문구를 분명히 한다
    expect(screen.getByText("중복 지급")).toBeInTheDocument();
  });

  it("⭐ 승인하면 confirmDuplicate: true 로 다시 보낸다", async () => {
    render(<ConfirmHost />);
    const { fn, calls } = makeMutate();
    let result;
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD).then((r) => (result = r));
    });
    await screen.findByText(/이미 이번 주에 주급/);

    await act(async () => screen.getByText("중복 지급").click());
    await act(async () => {});

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ studentIds: [], payAll: true });
    expect(calls[1]).toEqual({ studentIds: [], payAll: true, confirmDuplicate: true });
    expect(result).toEqual({ success: true, summary: { totalStudentsPaid: 82 } });
  });

  it("⭐ 거절하면 한 푼도 안 나간다 — 두 번째 호출이 없다", async () => {
    render(<ConfirmHost />);
    const { fn, calls } = makeMutate();
    let result = "미결";
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD).then((r) => (result = r));
    });
    await screen.findByText(/이미 이번 주에 주급/);

    await act(async () => screen.getByText("취소").click());
    await act(async () => {});

    expect(calls).toHaveLength(1);
    expect(result).toBeNull();
  });

  it("중복이 아니면 묻지 않고 그냥 지급한다 — 평소엔 창이 하나도 안 뜬다", async () => {
    render(<ConfirmHost />);
    const fn = vi.fn(async () => ({ success: true }));
    const result = await paySalariesAskingIfDuplicate(fn, PAYLOAD);
    expect(result).toEqual({ success: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/이미 이번 주에 주급/)).toBeNull();
  });

  it("진짜 오류는 삼키지 않고 그대로 올려보낸다", async () => {
    render(<ConfirmHost />);
    const boom = Object.assign(new Error("서버가 죽었습니다"), {
      code: "functions/internal",
    });
    const fn = vi.fn(async () => {
      throw boom;
    });
    await expect(paySalariesAskingIfDuplicate(fn, PAYLOAD)).rejects.toThrow(
      "서버가 죽었습니다",
    );
    expect(screen.queryByText(/이미 이번 주에 주급/)).toBeNull();
  });

  it("일부만 받은 경우 '82명 중 3명' 으로 알려준다", async () => {
    render(<ConfirmHost />);
    const fn = vi.fn(async () => {
      throw duplicateError({
        weekKey: "2026-W32",
        alreadyPaidCount: 3,
        targetCount: 82,
        sampleNames: ["김철수", "이영희", "박민수"],
      });
    });
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD);
    });
    const msg = await screen.findByText(/이미 이번 주에 주급/);
    expect(msg.textContent).toContain("82명 중 3명이 받았습니다");
  });

  it("이름이 더 있으면 '외' 를 붙인다 — 3명만 보여주기 때문", async () => {
    render(<ConfirmHost />);
    const fn = vi.fn(async () => {
      throw duplicateError({ ...DETAILS, alreadyPaidCount: 82 });
    });
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD);
    });
    const msg = await screen.findByText(/이미 이번 주에 주급/);
    expect(msg.textContent).toContain("박민수 외");
  });

  it("details 가 reason 만 있어도 죽지 않는다 — 창은 뜬다", async () => {
    render(<ConfirmHost />);
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("중복"), {
        code: DUPLICATE_CODE,
        details: { reason: DUPLICATE_REASON },
      });
    });
    act(() => {
      paySalariesAskingIfDuplicate(fn, PAYLOAD);
    });
    expect(await screen.findByText(/계속하시겠습니까/)).toBeInTheDocument();
  });

  it("⭐ 멱등키 중복 차단(already-exists)은 '또 줄까요?'로 둔갑하지 않는다", async () => {
    // 이 둘을 같은 코드로 두면 승인해도 같은 키라 또 막히고 또 묻는 고리에 빠진다.
    render(<ConfirmHost />);
    const blocked = Object.assign(new Error("이미 처리된 요청입니다. (중복 지급 차단)"), {
      code: "functions/already-exists",
    });
    const fn = vi.fn(async () => {
      throw blocked;
    });
    await expect(paySalariesAskingIfDuplicate(fn, PAYLOAD)).rejects.toThrow(
      "이미 처리된 요청입니다",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/계속하시겠습니까/)).toBeNull();
  });

  it("⭐ 다른 이유의 failed-precondition 도 창을 띄우지 않는다", async () => {
    render(<ConfirmHost />);
    const other = Object.assign(new Error("학급 설정이 없습니다"), {
      code: DUPLICATE_CODE,
      details: { reason: "no-class-settings" },
    });
    const fn = vi.fn(async () => {
      throw other;
    });
    await expect(paySalariesAskingIfDuplicate(fn, PAYLOAD)).rejects.toThrow(
      "학급 설정이 없습니다",
    );
    expect(screen.queryByText(/계속하시겠습니까/)).toBeNull();
  });

  it("⭐ 승인 후 재호출은 payload 를 그대로 유지한다 — 멱등키도 같이 간다", async () => {
    render(<ConfirmHost />);
    const { fn, calls } = makeMutate();
    act(() => {
      paySalariesAskingIfDuplicate(fn, { ...PAYLOAD, idempotencyKey: "key-abc" });
    });
    await screen.findByText(/이미 이번 주에 주급/);
    await act(async () => screen.getByText("중복 지급").click());
    await act(async () => {});
    expect(calls[1]).toEqual({
      studentIds: [],
      payAll: true,
      idempotencyKey: "key-abc",
      confirmDuplicate: true,
    });
  });
});
