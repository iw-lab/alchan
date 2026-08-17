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
  it("기본 10개가 전부 정규화를 통과한다 (폴백이 조용히 비면 사이드바가 빈다)", () => {
    expect(DEFAULT_LEARNING_APPS).toHaveLength(10);
    expect(defaultLearningAppItems()).toHaveLength(10);
  });

  it("기본 목록의 URL 은 전부 https 다", () => {
    for (const a of DEFAULT_LEARNING_APPS) expect(a.url.startsWith("https://")).toBe(true);
  });
});
