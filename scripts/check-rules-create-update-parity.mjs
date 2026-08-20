#!/usr/bin/env node
/**
 * firestore.rules — **update 에서 이름으로 막는 필드가 create 에서도 검사되는가.**
 *
 * 왜 검사인가 (산문으로는 안 걸러졌다)
 *   이 저장소는 이 실패모드를 **두 번** 겪었다.
 *     · 2026-07-15 policeReports: victimId 를 update 로만 막아 create 로 위조가 뚫렸다.
 *       그때 "update만 잠그면 create로 우회된다 — 신뢰 필드는 양쪽 검증 필수" 를 배웠다.
 *     · 2026-08-21 users: 같은 교훈을 적어 뒀는데도 `classCode` 가 create 에서 무방비였다.
 *       누구나 계정을 만들어 남의 학급 학생이 될 수 있었다(주급 대상 + 반 명단 열람).
 *   교훈을 문서에 적는 것으로는 재발을 못 막는다. 그래서 검사로 내린다.
 *
 * 무엇을 하나
 *   각 `match` 블록에서 `affectedKeys().hasAny([...])` 로 **update 를 막는 필드 이름**을 모으고,
 *   같은 블록의 `allow ... create ...` 절에서 그 이름이 **한 번이라도 언급되는지** 본다.
 *
 * ⚠️ 이건 린트지 증명이 아니다. "언급됐다"가 "올바르게 검증됐다"는 뜻은 아니고,
 *    헬퍼 함수 안에서 검사하면 여기선 안 보인다(그래서 ALLOWLIST 가 있다).
 *    목적은 **사람이 한 번 쳐다보게 만드는 것**이다. 진짜 증명은 scripts/rules-test.mjs 의
 *    DENY 케이스 + ALLOW 카나리아다.
 *
 * 실행: node scripts/check-rules-create-update-parity.mjs [firestore.rules]
 */
import { readFileSync } from "node:fs";

const FILE = process.argv[2] || "firestore.rules";

/**
 * 사람이 이미 확인해 "이건 create 에서 검사하지 않아도 된다"고 판단한 것들.
 * **반드시 이유를 적을 것.** 이유 없는 면제는 다음 사람에게 구멍으로 보인다.
 */
const ALLOWLIST = {
  "/users/{userId}": {
    // isValidUserData() 안에서 cash == 0 && coupons == 0 을 강제한다(헬퍼라 여기선 안 보인다).
    cash: "isValidUserData() 가 0 강제",
    coupons: "isValidUserData() 가 0 강제",
    // 아래는 주입해도 **자기 손해**뿐이다: 미래 값을 심으면 자기 지급·리셋이 건너뛰어진다.
    email: "create 에서 반드시 쓰는 값",
    isTestAccount: "켜면 통계·지급에서 빠진다(자기 손해)",
    lastGrossSalary: "표시용",
    lastNetSalary: "표시용",
    lastTaxAmount: "표시용",
    totalSalaryReceived: "표시용",
    lastSalaryDate: "표시용",
    lastSalaryWeekKey: "미래 값 = 자기 주급 건너뜀(자기 손해)",
    lastWeeklyTaxWeekKey: "미래 값 = 자기 세금 건너뜀(교사가 징수로 확인)",
    lastIncomingTransferAt: "미래 값 = 자기 수신 제한(자기 손해)",
    lastLoanRepaidAt: "미래 값 = 자기 상환 제한(자기 손해)",
    tasksResetDate: "미래 값 = 자기 할일 리셋 건너뜀(자기 손해)",
    dailyDrawDate: "카운터(dailyDrawCount)를 막으면 날짜만으론 무해",
    dailySpinDate: "카운터(dailySpinCount)를 막으면 날짜만으론 무해",
  },

  "/shopProducts/{productId}": {
    // create 하는 사람이 곧 소유자(ownerId == auth.uid)이고, 소유자는 update 로도 status 를
    // 자유롭게 바꿀 수 있다. update 의 status 제약은 **구매자**가 남의 상품을 'soldout' 으로
    // 사보타주하지 못하게 하는 것이라, create 시점에는 대응물이 없다.
    status: "create 하는 사람이 소유자다 — 소유자는 원래 자기 상품 status 를 바꾼다",
  },

  "/courtComplaints/{complaintId}": {
    // 합의금 지급 CF 는 **멱등 원장**(courtsettle_{complaintId}, 클라 write 불가)으로 이중지급을
    // 막고, settlementPaid === true 는 "이미 처리됨" **거부 게이트**다. 즉 create 에 true 를
    // 심으면 자기 합의금이 안 나간다(자기 손해). 금액은 교사/판사가 호출 때 넣는다.
    settlementPaid: "true 를 심으면 CF 가 지급을 거부한다(자기 손해)",
    settlementAmount: "지급액은 CF 호출 인자에서 오고 문서 값을 신뢰하지 않는다",
    settlementDate: "기록용",
    settlementProcessedBy: "기록용",
  },

  "/trialRooms/{roomId}": {
    settlementPaid: "courtComplaints 와 동일 — 거부 게이트",
    settlementAmount: "지급액은 CF 호출 인자에서 온다",
    settlementDate: "기록용",
    settlementProcessedBy: "기록용",
    caseId: "표시용 연결",
    // ⚠️ 여기는 면제지 안전이 아니다. 당사자 지정은 '고소장의 본질' 이라 잠글 수 없다고
    //    2026-08-20 에 판단했고(메모리 court_settlement_drain), 대신 **지급 권한**을 교사/
    //    서버검증된 임명 판사로 좁혔다(processTrialSettlement). 재판방 기능 자체도 지금 꺼져 있다.
    complainantId: "당사자 지정은 잠글 수 없다 — 대신 지급 권한을 교사/임명판사로 좁혔다(수용된 잔여)",
    defendantId: "당사자 지정은 잠글 수 없다 — 위와 같음(수용된 잔여)",
  },
};

const src = readFileSync(FILE, "utf8");
const code = src.replace(/\/\/.*/g, ""); // 주석 제거(주석 속 필드명에 속지 않게)

// match 블록 시작 위치들. 중첩은 가장 가까운 상위로 귀속되지만, 이 린트 목적에는 충분하다.
const starts = [...code.matchAll(/match\s+(\S+)\s*\{/g)].map((m) => ({
  at: m.index,
  path: m[1],
}));
starts.push({ at: code.length, path: null });

const findings = [];
for (let i = 0; i < starts.length - 1; i += 1) {
  const { at, path } = starts[i];
  const body = code.slice(at, starts[i + 1].at);

  const blocked = new Set();
  for (const hs of body.matchAll(/hasAny\(\[([^\]]*)\]\)/g)) {
    for (const raw of hs[1].split(",")) {
      const name = raw.trim().replace(/^['"]|['"]$/g, "");
      if (name) blocked.add(name);
    }
  }
  if (blocked.size === 0) continue;

  const createClause = body.match(/allow[^;]*\bcreate\b[^;]*;/s);
  // create 규칙이 아예 없으면 기본 거부다 — 그건 안전하다.
  if (!createClause) continue;

  const allow = ALLOWLIST[path] || {};
  const missing = [...blocked]
    .filter((f) => !createClause[0].includes(f) && !(f in allow))
    .sort();
  if (missing.length > 0) findings.push({ path, missing });
}

if (findings.length === 0) {
  console.log("✅ update 로 막는 필드가 create 에서도 전부 다뤄지고 있습니다.");
  process.exit(0);
}

console.error("❌ update 는 막는데 create 가 안 보는 필드가 있습니다.");
console.error("   (update 만 잠그면 create 로 우회된다 — 이 저장소가 두 번 겪은 실패모드)\n");
for (const { path, missing } of findings) {
  console.error(`  ${path}`);
  console.error(`     ${missing.join(", ")}\n`);
}
console.error("고치는 법: create 규칙에서 그 필드를 검증하거나,");
console.error("           안전한 이유를 적어 이 스크립트의 ALLOWLIST 에 넣으세요.");
process.exit(1);
