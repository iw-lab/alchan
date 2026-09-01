import { describe, it, expect } from "vitest";
import {
  normalizeLearningApps,
  defaultLearningAppItems,
  DEFAULT_LEARNING_APPS,
} from "../../config/learningApps";

// 이 정규화는 **Firestore 에서 온 값**을 사이드바 링크로 바꾼다.
// 레지스트리는 슈퍼관리자만 쓰지만, 방어는 읽는 쪽에도 둔다(쓰기 권한이 언젠가 넓어질 수 있고,
// 링크 하나가 javascript: 스킴이면 클릭 = 스크립트 실행이다).
describe("normalizeLearningApps", () => {
  const ok = { id: "siteX", label: "테스트앱", icon: "Globe", url: "https://example.com/" };

  it("정상 항목을 메뉴 아이템으로 바꾼다", () => {
    const [item] = normalizeLearningApps([ok]);
    expect(item.id).toBe("siteX");
    expect(item.label).toBe("테스트앱");
    expect(item.externalUrl).toBe("https://example.com/");
    expect(item.parentId).toBe("learningSitesCategory");
    expect(typeof item.icon).not.toBe("string"); // 컴포넌트로 매핑됨
  });

  // ⚠️ 페이로드에 `alert(` 를 쓰지 않는다. debt-ratchet 의 alert/confirm/prompt 천장(0)이
  //    문자열 리터럴까지 세서 이 픽스처 2건을 실제 alert 호출로 오탐한다(CI 실패로 확인).
  //    검증 대상은 **스킴 거부**지 페이로드 내용이 아니라 아무 영향이 없다 — 되돌리지 말 것.
  it("https 가 아닌 스킴은 버린다 (클릭 = 스크립트 실행 차단)", () => {
    for (const url of [
      "javascript:void 0",
      "data:text/html,<script>document.cookie</script>",
      "http://example.com/",   // 평문 http 도 거부 — 학생 기기에서 중간자 노출
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
    ]) {
      expect(normalizeLearningApps([{ ...ok, url }])).toHaveLength(0);
    }
  });

  it("URL 로 파싱되지 않으면 버린다", () => {
    expect(normalizeLearningApps([{ ...ok, url: "not a url" }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, url: "" }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, url: 123 }])).toHaveLength(0);
  });

  it("id 가 이상하면 버린다 (경로 주입·중복)", () => {
    expect(normalizeLearningApps([{ ...ok, id: "a/b" }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, id: "" }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, id: "x".repeat(65) }])).toHaveLength(0);
    // 중복 id 는 첫 것만
    expect(normalizeLearningApps([ok, { ...ok, label: "두번째" }])).toHaveLength(1);
  });

  it("label 이 비었거나 과하게 길면 버린다", () => {
    expect(normalizeLearningApps([{ ...ok, label: "   " }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, label: "가".repeat(61) }])).toHaveLength(0);
  });

  it("enabled:false 는 숨긴다 (앱이 죽었을 때 코드 배포 없이 내리는 스위치)", () => {
    expect(normalizeLearningApps([{ ...ok, enabled: false }])).toHaveLength(0);
    expect(normalizeLearningApps([{ ...ok, enabled: true }])).toHaveLength(1);
  });

  it("한 줄이 잘못돼도 나머지는 산다 (오타가 사이드바 전체를 날리면 안 된다)", () => {
    const items = normalizeLearningApps([{ ...ok, url: "javascript:x" }, { ...ok, id: "siteY" }]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("siteY");
  });

  it("배열이 아니면 빈 목록 (문서 없음·필드 없음)", () => {
    for (const v of [null, undefined, {}, "x", 0]) expect(normalizeLearningApps(v)).toEqual([]);
  });

  it("60개를 넘기지 않는다 (레지스트리 오염 시 사이드바 폭주 방지)", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...ok, id: `site${i}` }));
    expect(normalizeLearningApps(many)).toHaveLength(60);
  });

  it("모르는 아이콘 이름이어도 렌더 가능한 컴포넌트가 나온다", () => {
    const [item] = normalizeLearningApps([{ ...ok, icon: "존재하지않는아이콘" }]);
    expect(item.icon).toBeTruthy();
  });
});

describe("폴백 기본 목록", () => {
  it("기본 19개가 전부 정규화를 통과한다 (폴백이 조용히 비면 사이드바가 빈다)", () => {
    // 절대 개수와 "하나도 안 떨어졌다"를 **둘 다** 본다. 앞은 항목이 실수로 지워지는 것을,
    // 뒤는 정규화가 조용히 걸러 내는 것을 잡는다 — 뒤만 두면 목록이 비어도 통과한다.
    expect(DEFAULT_LEARNING_APPS).toHaveLength(21);   // 2026-09-02 하늘수비대·비트:온 추가
    expect(defaultLearningAppItems()).toHaveLength(DEFAULT_LEARNING_APPS.length);
  });

  it("기본 목록의 URL 은 전부 https 다", () => {
    for (const a of DEFAULT_LEARNING_APPS) expect(a.url.startsWith("https://")).toBe(true);
  });

  it("🔴 학교망이 막는 도메인을 쓰지 않는다", () => {
    // 2026-08-21 교육청 네트워크가 `github.io` 를 통째로 막았다(ERR_TIMED_OUT — 누구나
    // 올릴 수 있는 도메인이라 필터가 도메인 단위로 건다). 앱 두 개를 Cloudflare 로 옮겼는데
    // **알찬 쪽 주소가 그대로여서** 교실에서 누르면 아무것도 안 열렸다.
    // 앱을 옮기는 것과 알찬이 그걸 아는 것은 다른 일이라, 그 간극을 여기서 잡는다.
    // ⚠️ 이건 폴백만 지킨다. 정본은 `platformApps/_registry` 라 운영 점검이 따로 필요하다
    //    (`aap-switch.mjs list` 가 실행주소를 같이 찍는다).
    const BLOCKED = ["github.io"];
    for (const a of DEFAULT_LEARNING_APPS) {
      const host = new URL(a.url).hostname;
      for (const bad of BLOCKED) {
        expect(host.endsWith(bad), `${a.id} 가 학교에서 막히는 도메인(${bad})을 씁니다: ${a.url}`).toBe(false);
      }
    }
  });

  it("🔴 폴백은 이관 여부를 **모른다고** 말한다 — false 로 뭉개면 조용한 실패가 난다", () => {
    // 코드는 이관 여부를 알 수가 없다(진실은 Firestore 다). `false` 로 두면 이관된 앱이
    // 토큰 없이 열려 기록·보상만 조용히 실패한다 — 사이드바 첫 페인트가 매 세션 폴백이라
    // 그 창은 예외가 아니다.
    for (const item of defaultLearningAppItems()) {
      expect(item.aap).toBe(false);
      expect(item.aapUnknown).toBe(true);
    }
  });

  it("레지스트리에서 온 항목은 **모른다고 하지 않는다** — 거기엔 답이 있다", () => {
    const [item] = normalizeLearningApps([
      { id: "siteX", label: "테스트앱", icon: "Globe", url: "https://example.com/", aap: true },
    ]);
    expect(item.aap).toBe(true);
    expect(item.aapUnknown).toBeUndefined();
  });
});
