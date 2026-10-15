// 🔒 App Check 는 첫 화면 «뒤에» 켠다 (2026-10-15 사용자 「첫 로딩시간이 너무 길어」).
// 일찍 켜면 Firestore·Auth·Functions 가 요청마다 reCAPTCHA 토큰을 기다려, 그날 첫 접속의 첫 화면이
// 토큰 시간만큼 늦는다(에뮬레이터 실측: 토큰 3초 지연 → 0.42초가 3.44초). 모듈을 불러오는 순간
// initializeAppCheck 가 불리거나, AuthContext 가 첫 화면 전에 켜면 여기가 빨개진다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const initializeAppCheck = vi.fn();
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => ({ initializeFirestore: vi.fn(() => ({})), memoryLocalCache: vi.fn(), connectFirestoreEmulator: vi.fn() }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(() => ({})), connectAuthEmulator: vi.fn() }));
vi.mock("firebase/storage", () => ({ getStorage: vi.fn(() => ({})) }));
vi.mock("firebase/functions", () => ({ getFunctions: vi.fn(() => ({})), connectFunctionsEmulator: vi.fn() }));
vi.mock("firebase/app-check", () => ({ initializeAppCheck: (...a) => initializeAppCheck(...a), ReCaptchaV3Provider: vi.fn() }));

describe("App Check 지연 시작", () => {
  beforeEach(() => {
    vi.resetModules();
    initializeAppCheck.mockClear();
    process.env.REACT_APP_RECAPTCHA_SITE_KEY = "test-site-key";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  });

  it("모듈을 불러오기만 해서는 켜지지 않는다", async () => {
    await import("../../firebase/firebaseConfig");
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("startAppCheckSoon = 기다렸다가 한 번만 · 취소하면 안 켜진다", async () => {
    const m = await import("../../firebase/firebaseConfig");
    const cancel = m.startAppCheckSoon(3000);
    vi.advanceTimersByTime(2999);
    expect(initializeAppCheck).not.toHaveBeenCalled();
    cancel();
    vi.advanceTimersByTime(5000);
    expect(initializeAppCheck).not.toHaveBeenCalled();

    m.startAppCheckSoon(3000);
    vi.advanceTimersByTime(3000);
    vi.runOnlyPendingTimers(); // requestIdleCallback 이 있는 환경이면 그 몫
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(m.startAppCheck()).toBe(false);
    m.startAppCheckSoon(0);
    vi.runAllTimers();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it("AuthContext 는 로그인한 사람의 첫 화면이 뜬 뒤에만 켠다", () => {
    const src = readFileSync(join(__dirname, "../../contexts/AuthContext.js"), "utf8");
    expect(src).toContain("const firstScreenReady = !loading && !!user && !!userDoc;");
    const calls = src.match(/startAppCheck\w*\(/g) || [];
    expect(calls).toEqual(["startAppCheckSoon("]);
    expect(src).toMatch(/if \(!firstScreenReady\) return undefined;\s*return startAppCheckSoon\(\);\s*\}, \[firstScreenReady\]\);/);
  });

  it("다른 곳에서 App Check 를 직접 켜지 않는다", () => {
    const cfg = readFileSync(join(__dirname, "../../firebase/firebaseConfig.js"), "utf8");
    expect(cfg.match(/initializeAppCheck\(/g)).toHaveLength(1);
    expect(cfg).toMatch(/export function startAppCheck\(\) \{[\s\S]*?initializeAppCheck\(app,/);
  });
});
