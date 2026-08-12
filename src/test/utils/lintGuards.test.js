/**
 * 부채 천장이 서 있으려면 **그 아래 규칙이 켜져 있어야** 한다.
 *
 * `debt-ratchet` 의 `bareDepsSuppress` 는 "이유 없이 끈 exhaustive-deps" 를 센다.
 * 그런데 누군가 `.oxlintrc.json` 에서 규칙 자체를 off 로 바꾸면, 억제 주석이 필요 없어져
 * 개수는 0으로 유지되면서 **보호는 통째로 사라진다** — 지표가 초록인 채로 고장 나는 형태다.
 * 이 앱에서 가장 비쌌던 사고들(야간 150 read/분, 할일 54→3 문서, 방치 탭 폴링)이
 * 전부 의존성 배열에서 나왔으므로, 규칙이 꺼지는 것 자체를 막아 둔다.
 *
 * 끄고 싶다면 이 테스트를 함께 고쳐야 하고, 그때는 왜인지 설명이 남는다. 그게 목적이다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), ".oxlintrc.json"), "utf8"),
);

describe("린트 규칙이 실제로 켜져 있는지", () => {
  it("⭐ react-hooks/exhaustive-deps 가 error 다", () => {
    expect(config.rules?.["react-hooks/exhaustive-deps"]).toBe("error");
  });

  it("⭐ react 플러그인이 활성화돼 있다 (없으면 훅 규칙이 통째로 안 돈다)", () => {
    expect(config.plugins).toContain("react");
  });

  it("⭐ no-alert 가 error 다 — alert/confirm/prompt 671곳을 걷어낸 걸 되돌리지 않는다", () => {
    expect(config.rules?.["no-alert"]).toBe("error");
  });

  it("exhaustive-deps 를 파일 단위로 끈 예외가 하나도 없다", () => {
    // 종전 유일한 예외였던 src/hooks/useFirestoreData.js 는 2026-08-12 에 삭제됐다.
    // 프로덕션 호출부가 0건인 죽은 캐시 계층이었다(이 저장소엔 캐시가 다섯 겹이고,
    // 그중 하나가 "쓰면 캐시되는 줄" 착각을 만들어 이중 캐시 버그의 씨앗이 됐다).
    // 예외가 다시 생기면 여기서 걸린다 — 규칙이 조용히 무의미해지는 걸 막는 게 목적이다.
    const off = (config.overrides || []).filter(
      (o) => o.rules?.["react-hooks/exhaustive-deps"] === "off",
    );
    const files = off.flatMap((o) => o.files || []);
    expect(files).toEqual([]);
  });

  it("부채 천장에 exhaustive-deps 지표가 있고 0 이다", () => {
    const baseline = JSON.parse(
      readFileSync(resolve(process.cwd(), "scripts/debt-baseline.json"), "utf8"),
    );
    // ① 지표가 사라지면 ratchet 이 "천장 미설정"으로 넘어가며 **조용히 검사를 멈춘다**.
    expect(baseline).toHaveProperty("bareDepsSuppress");

    // ② 0 을 못박는 이유: 다른 지표들과 성격이 다르다.
    //    !important 714 · Firestore 직접호출 46 은 "이미 쌓인 걸 더 늘리지 말자"는 **천장**이라
    //    숫자가 얼마든 상관없다. 반면 이건 "이유 없는 억제는 아예 만들지 말자"는 **정책**이고,
    //    실제로 오늘 26 → 0 으로 비웠다. 0 이 아니게 되는 건 늘어남이 아니라 정책 폐기다.
    //    올리려면 이 테스트도 함께 고쳐야 하고, 그러면 왜인지가 diff 에 남는다 — 그게 목적이다.
    expect(baseline.bareDepsSuppress).toBe(0);
  });
});
