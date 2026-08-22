/**
 * 🚪 AAP 실행 다리 — 학생이 사이드바에서 학습앱을 누르는 **유일한 길**.
 *
 * 이 파일이 지키는 불변식
 *   ① 이관 안 된 앱은 지금까지와 **똑같이** 열린다(회귀 0 · CF 호출 0회).
 *   ② 새 탭은 **`await` 전에** 열린다 — 그 뒤에 열면 Chrome 이 차단한다(실측).
 *   ③ 실행 URL 은 **서버가 준 것만** 연다. 클라가 토큰을 붙여 조립하지 않는다.
 *   ④ 🔴 **교사 잠금을 우회하지 않는다.** 거부되면 그냥 링크로 열어 주지 않는다.
 *   ⑤ 이관된 앱이 토큰 없이 열리는 일은 없다 — 조용한 실패가 제일 나쁜 실패다.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const callable = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("../../firebase/firebaseConfig", () => ({ functions: {} }));
const toastErr = vi.hoisted(() => vi.fn());
vi.mock("../../utils/toast", () => ({ toast: { error: toastErr, success: vi.fn(), info: vi.fn() } }));
vi.mock("../../utils/logger", () => ({ default: { warn: () => {}, error: () => {}, info: () => {} } }));

const { launchLearningApp } = await import("../../services/appLaunch");

const PLAIN = "https://gugu-guardians.pages.dev/";
const LAUNCH = "https://gugu-guardians.pages.dev/#aap=eyJhbGciOiJSUzI1NiJ9.x.y";

/** 열린 탭 흉내. 실제 브라우저 동작을 그대로 흉내낸다(`opener` 는 쓰기 가능). */
function fakeWin() {
  return {
    closed: false,
    opener: { name: "알찬탭" },      // 기본은 **연결된 상태** — 끊는 코드가 없으면 남는다
    location: { replace: vi.fn() },
    document: { write: vi.fn() },
    close: vi.fn(function () { this.closed = true; }),
  };
}

let opened;   // window.open 이 받은 인자들
let win;

beforeEach(() => {
  callable.mockReset();
  toastErr.mockReset();
  opened = [];
  win = fakeWin();
  global.window = {
    open: vi.fn((url, target, feat) => { opened.push({ url, target, feat }); return url === "" ? win : fakeWin(); }),
  };
});

// ═══════════════════════════════════════════════════════════════
describe("🔴 언제나 서버에 묻는다 — 클라 값으로 서버 확인을 건너뛰지 않는다", () => {
  // 예전엔 힌트가 falsy 면 아예 안 물었다. 그런데 그 힌트는 `sessionStorage`(학생이 devtools 로
  // 직접 쓸 수 있다)와 폴백에서 온다 — **못 믿기로 설계된 값**에 관문을 맡긴 꼴이었다.
  const NOT_AAP = () => { const e = new Error("이 앱은 아직 준비 중이에요."); e.code = "functions/failed-precondition"; return e; };

  it("힌트가 `false` 여도 물어본다", async () => {
    callable.mockRejectedValue(NOT_AAP());
    const ok = await launchLearningApp({ id: "siteX", externalUrl: PLAIN, aap: false });
    expect(callable).toHaveBeenCalledWith({ appId: "siteX" });
    expect(ok).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith(PLAIN);   // 답을 듣고 나서 링크로
  });

  it("힌트가 아예 없어도 물어본다", async () => {
    callable.mockRejectedValue(NOT_AAP());
    await launchLearningApp({ id: "siteX", externalUrl: PLAIN });
    expect(callable).toHaveBeenCalled();
  });

  it("폴백 목록(`aapUnknown`)도 물어본다 — 모름을 '아니다'로 뭉개지 않는다", async () => {
    callable.mockRejectedValue(NOT_AAP());
    const ok = await launchLearningApp({ id: "siteGuguGuardians", externalUrl: PLAIN, aapUnknown: true });
    expect(callable).toHaveBeenCalledWith({ appId: "siteGuguGuardians" });
    expect(ok).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith(PLAIN);
  });

  it("🔴 세션캐시가 거짓말해도(`aap:false`) 실은 이관된 앱이면 **토큰과 함께** 열린다", async () => {
    // 학생이 sessionStorage 를 고쳤거나, 교사가 오전에 이관을 켜서 캐시가 낡았거나.
    // 어느 쪽이든 답은 서버에 있고, 이제 그 답을 듣는다.
    callable.mockResolvedValue({ data: { launchUrl: LAUNCH } });
    await launchLearningApp({ id: "siteGuguGuardians", externalUrl: PLAIN, aap: false });
    expect(win.location.replace).toHaveBeenCalledWith(LAUNCH);
  });

  it("링크도 id 도 없으면 아무것도 안 연다", async () => {
    expect(await launchLearningApp({})).toBe(false);
    expect(opened).toHaveLength(0);
  });
});

describe("서버에 닿지 못했을 때 — 장애가 앱 10개를 같이 죽이지 않는다", () => {
  const down = (code) => { const e = new Error("일시 장애"); e.code = code; return e; };

  it("이관 안 된 게 **확실한** 앱은 장애 때 예전처럼 링크로 연다", async () => {
    callable.mockRejectedValue(down("functions/unavailable"));
    const ok = await launchLearningApp({ id: "siteX", externalUrl: PLAIN, aap: false });
    expect(ok).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith(PLAIN);
  });

  it("🔴 이관된 앱은 장애 때 **열지 않는다** — 토큰 없이 열면 조용히 실패한다", async () => {
    callable.mockRejectedValue(down("functions/unavailable"));
    expect(await launchLearningApp({ id: "siteGuguGuardians", externalUrl: PLAIN, aap: true })).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("🔴 **모르는** 앱도 장애 때 열지 않는다 — 모름은 '아니다'가 아니다", async () => {
    callable.mockRejectedValue(down("functions/internal"));
    expect(await launchLearningApp({ id: "siteX", externalUrl: PLAIN, aapUnknown: true })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("이관된 앱", () => {
  const item = { id: "siteGuguGuardians", externalUrl: PLAIN, aap: true };

  it("🔴 새 탭을 **await 보다 먼저** 연다 — 나중에 열면 Chrome 이 차단한다", async () => {
    let openedBeforeAwait = false;
    callable.mockImplementation(() => {
      // 이 시점은 이미 `await` 안이다. 여기서 탭이 열려 있어야 순서가 맞다.
      openedBeforeAwait = opened.length === 1;
      return Promise.resolve({ data: { launchUrl: LAUNCH } });
    });
    await launchLearningApp(item);
    expect(openedBeforeAwait).toBe(true);
    expect(opened[0].url).toBe("");                        // 빈 탭을 먼저 열었다
  });

  it("🔴 `opener` 를 끊는다 — 안 끊으면 위성앱이 알찬 탭을 잡는다", async () => {
    callable.mockResolvedValue({ data: { launchUrl: LAUNCH } });
    await launchLearningApp(item);
    expect(win.opener).toBeNull();
  });

  it("🔴 **서버가 준 URL 만** 연다 — 클라가 조립하지 않는다", async () => {
    callable.mockResolvedValue({ data: { launchUrl: LAUNCH } });
    expect(await launchLearningApp(item)).toBe(true);
    expect(callable).toHaveBeenCalledWith({ appId: "siteGuguGuardians" });
    expect(win.location.replace).toHaveBeenCalledWith(LAUNCH);
    // 링크(PLAIN)로 연 적이 없다 — 토큰 없는 실행이 섞이면 안 된다
    expect(win.location.replace).toHaveBeenCalledTimes(1);
  });

  it("🔴 launchUrl 이 비면 실패로 치고, **내부 문구를 학생에게 보여주지 않는다**", async () => {
    callable.mockResolvedValue({ data: {} });
    expect(await launchLearningApp(item)).toBe(false);
    const shown = toastErr.mock.calls.at(-1)[0];
    expect(shown).not.toContain("launchUrl");            // 개발자 메모가 아이 화면에 뜨면 안 된다
    expect(shown).toBe("학습앱을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  it("code 없는 내부 오류의 문구도 새 지 않는다", async () => {
    callable.mockRejectedValue(new Error("TypeError: undefined is not a function"));
    await launchLearningApp(item);
    const html = win.document.write.mock.calls.at(-1)[0];
    expect(html).not.toContain("TypeError");
  });

  it("빈 문자열 launchUrl 도 거른다 — `typeof` 만으로는 안 걸린다", async () => {
    callable.mockResolvedValue({ data: { launchUrl: "" } });
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("이관 안 된 앱으로 떨어질 때도 탭이 닫혔으면 **false** 다 — 성공 경로와 계약을 맞춘다", async () => {
    const e = new Error("아직 알찬과 연결되지 않은 앱이에요.");
    e.code = "functions/not-found";
    callable.mockImplementation(() => { win.closed = true; return Promise.reject(e); });
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("기다리는 동안 학생이 탭을 닫으면 이동시키지 않는다", async () => {
    callable.mockImplementation(() => { win.closed = true; return Promise.resolve({ data: { launchUrl: LAUNCH } }); });
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("브라우저가 팝업을 아예 막으면 알린다", async () => {
    global.window.open = vi.fn(() => null);
    expect(await launchLearningApp(item)).toBe(false);
    expect(toastErr).toHaveBeenCalled();
    expect(callable).not.toHaveBeenCalled();               // 열 수도 없는데 토큰을 낭비하지 않는다
  });
});

// ═══════════════════════════════════════════════════════════════
describe("🔴 거부됐을 때 — 링크로 우회하지 않는다", () => {
  const item = { id: "siteGuguGuardians", externalUrl: PLAIN, aap: true };

  it("교사 잠금(permission-denied)은 **절대** 그냥 링크로 열지 않는다", async () => {
    // 이게 뚫리면 클라 한 줄이 교사의 잠금을 무력화한다.
    const e = new Error("선생님이 이 기능을 꺼 두셨어요.");
    e.code = "functions/permission-denied";
    callable.mockRejectedValue(e);

    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
    expect(toastErr).toHaveBeenCalledWith("선생님이 이 기능을 꺼 두셨어요.");   // 문구 정본은 서버
  });

  it("🔴 실패한 탭을 **닫지 않고** 그 안에서 이유를 말한다", async () => {
    // 학생 눈은 새 탭에 가 있다. 거기서 탭이 사라지고 안내가 원래 탭에만 뜨면
    // 학생이 보는 것은 "눌렀는데 아무 일도 없었다" 뿐이다.
    const e = new Error("선생님이 이 기능을 꺼 두셨어요.");
    e.code = "functions/permission-denied";
    callable.mockRejectedValue(e);
    await launchLearningApp(item);
    expect(win.close).not.toHaveBeenCalled();
    const html = win.document.write.mock.calls.at(-1)[0];
    expect(html).toContain("선생님이 이 기능을 꺼 두셨어요.");
  });

  it("🔴 서버 문구를 HTML 에 넣기 전에 이스케이프한다", async () => {
    const e = new Error('<img src=x onerror="boom()">');
    e.code = "functions/internal";
    callable.mockRejectedValue(e);
    await launchLearningApp(item);
    const html = win.document.write.mock.calls.at(-1)[0];
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("kill switch(failed-precondition)도 마찬가지다", async () => {
    const e = new Error("지금은 이 앱을 열 수 없어요.");
    e.code = "functions/failed-precondition";
    callable.mockRejectedValue(e);
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("일시 장애(internal)도 링크로 떨어뜨리지 않는다 — 조용한 실패가 더 나쁘다", async () => {
    const e = new Error("잠시 후 다시 시도해 주세요.");
    e.code = "functions/internal";
    callable.mockRejectedValue(e);
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("🔴 문구 없는 404 는 '이관 안 됨'이 아니다 — SDK 가 **모든 404** 를 not-found 로 바꾼다", async () => {
    // 함수 삭제·리전 오타·게이트웨이 404 가 전부 여기로 온다. 코드로 판정하면
    // **이관된 앱이 평문 링크로 열린다**(2026-08-22 codex 레인).
    const e = new Error("NOT FOUND");
    e.code = "functions/not-found";
    callable.mockRejectedValue(e);
    expect(await launchLearningApp(item)).toBe(false);
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  it("등록 안 된 앱은 링크로 떨어진다 — 서버 **문구**로 판정한다", async () => {
    const e = new Error("아직 알찬과 연결되지 않은 앱이에요.");
    e.code = "functions/not-found";
    callable.mockRejectedValue(e);
    expect(await launchLearningApp(item)).toBe(true);
    // 🔴 **이미 연 탭을 재활용**한다. 닫고 새로 열면 그 open 은 비동기 뒤라 차단된다.
    expect(win.location.replace).toHaveBeenCalledWith(PLAIN);
    expect(win.close).not.toHaveBeenCalled();
  });

  it("이관 전 문구로 오는 경우도 링크로 떨어진다", async () => {
    const e = new Error("이 앱은 아직 준비 중이에요.");
    e.code = "functions/failed-precondition";        // 코드는 겹치지만 뜻은 '이관 전'이다
    callable.mockRejectedValue(e);
    expect(await launchLearningApp(item)).toBe(true);
    expect(win.location.replace).toHaveBeenCalledWith(PLAIN);
  });
});
