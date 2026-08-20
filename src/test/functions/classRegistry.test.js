/**
 * `classes/{학급코드}` — 학급 목록 '정본'이 될 문서를 만드는 세 경로를 지킨다.
 *
 * 이 문서는 P0-E(학급 목록 정본을 users 전량 스캔 → classes 조회로 교체)의 전제다.
 * 전제가 깨진 채 정본을 갈아타면 빠진 학급의 **주급이 조용히 끊긴다** — 그래서
 * "어떻게 만드는가"의 불변식을 테스트로 박아 둔다(2026-08-20 교차검증 지적).
 *
 * 만드는 곳이 셋이다:
 *   ① SuperAdminDashboard.js  교사 승인 (근원 차단)
 *   ② scheduler-http.js  initClassroomDefaultsServerSide (수동 엔드포인트)
 *   ③ scheduler-http.js  logClassRegistryDrift 자가치유 (주 1회 사후 복구)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const SCHEDULER = read("functions/scheduler-http.js");
const DIVIDEND = read("functions/dividendService.js");
const SUPERADMIN = read("src/pages/superadmin/SuperAdminDashboard.js");

// 자가치유 블록만 잘라낸다(파일 전체를 보면 다른 batch.set 에 걸린다).
const healBlock = SCHEDULER.slice(
  SCHEDULER.indexOf("if (missing.length > 0) {"),
  SCHEDULER.indexOf("if (empty.length > 0) {"),
);

describe("자가치유가 남의 문서를 덮어쓰지 않는다", () => {
  it("⭐ set(merge) 이 아니라 create() 를 쓴다", () => {
    // set(merge:true) 는 경합을 못 막는다 — 조회 후 커밋 전에 승인 화면이 제대로 만들어 두면
    // 빈 className 과 새 createdAt 으로 그걸 덮어쓴다. create() 는 이미 있으면 그냥 실패한다.
    expect(healBlock).toContain(".create(");
    expect(healBlock).not.toContain("merge: true");
  });

  it("⭐ ALREADY_EXISTS(6) 를 실패가 아니라 '건너뜀'으로 다룬다", () => {
    expect(healBlock).toMatch(/e\.code === 6/);
  });

  it("⭐ batch 를 쓰지 않는다 — 500건 넘으면 영원히 수렴 못 한다", () => {
    expect(healBlock).not.toContain("db.batch()");
  });

  it("⭐ 실행당 상한이 있어 주급 시간을 잠식하지 않는다", () => {
    expect(healBlock).toContain("SELF_HEAL_MAX_PER_RUN");
  });

  it("⭐ 학생 수를 0 이 아니라 실측값으로 심는다", () => {
    // 이 경로는 '학생이 있는데 문서가 없는' 학급만 타므로 0 은 언제나 거짓이고,
    // studentCount 는 이후 전부 증감으로만 유지되어 틀린 씨앗이 영구히 남는다.
    expect(healBlock).toContain("studentCount: studentCounts.get(code)");
  });
});

describe("cutover 준비 판정", () => {
  it("⭐ 양방향(미등록 0 · 학생0 학급 0)일 때만 '전제 충족'을 찍는다", () => {
    // 한쪽만 0인 걸 충족으로 기록하면 그 로그가 거짓 근거가 되어 잘못된 cutover 를 부른다.
    expect(SCHEDULER).toContain("if (missing.length === 0 && empty.length === 0) {");
  });

  it("⭐ 학생이 0명으로 조회되면 점검을 건너뛴다", () => {
    // 빈 조회를 그대로 믿으면 등록된 모든 학급을 '학생 0'으로 잘못 기록한다.
    expect(SCHEDULER).toContain("[학급정본] 활성 학급 0");
  });
});

describe("문서 스키마가 세 곳에서 갈라지지 않는다", () => {
  it("⭐ 서버 두 경로는 buildClassDoc 하나만 쓴다", () => {
    // 정의 1 + 호출 2 = 3. (정의부 `function buildClassDoc({...})` 도 같은 모양이라 함께 잡힌다)
    const all = SCHEDULER.match(/buildClassDoc\(\{/g) || [];
    const defs = SCHEDULER.match(/function buildClassDoc\(\{/g) || [];
    expect(defs.length).toBe(1);
    expect(all.length - defs.length).toBe(2);
    expect(SCHEDULER).not.toContain("settings: {},");
  });

  it("⭐ 기본 설정값이 승인 화면과 같다", () => {
    // 다르면, 서버가 만든 학급만 조용히 다른 초기자산으로 굴러간다.
    expect(SCHEDULER).toContain("settings: { initialCash: 100000, initialCoupons: 10 }");
    expect(SUPERADMIN).toContain("settings: { initialCash: 100000, initialCoupons: 10 }");
  });
});

describe("승인 경로의 구멍", () => {
  it("⭐ 이미 학급코드를 가진 교사도 classes 문서를 얻는다", () => {
    // `needsClassCode === false` 분기가 그냥 지나가던 것이 드리프트의 근원이었다(QAZWSX12).
    const approve = SUPERADMIN.slice(
      SUPERADMIN.indexOf("const handleApproveTeacher"),
      SUPERADMIN.indexOf("await updateDoc(userRef, updates);"),
    );
    expect(approve).toContain("} else {");
    expect(approve).toMatch(/existingSnap\.exists\(\)/);
  });
});

describe("배치 한도 상수", () => {
  it("⭐ 450 은 batchChunk.js 한 곳에만 있다", () => {
    // 판정 로직만 모으고 숫자를 각자 들고 있으면, 안전마진을 조정할 때 다시 갈라진다.
    expect(SCHEDULER).not.toMatch(/TAX_BATCH_SOFT_LIMIT\s*=\s*450/);
    expect(DIVIDEND).not.toMatch(/BATCH_OP_LIMIT\s*=\s*450/);
  });
});
