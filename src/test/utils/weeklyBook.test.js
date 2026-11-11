/**
 * 이번 주 가계부 — 계산(utils/weeklyBook.js)과 원장 합치기(utils/ledgerDedupe.js mergeLedgerRows).
 * 불변식: ① 통장·대출로 옮긴 돈은 번 돈/쓴 돈에 안 섞인다 ② 범위 밖 줄은 세지 않는다
 *         ③ 한 주는 한국 시간 월요일 0시에 시작한다 ④ 같은 사건이 두 원장에 있어도 한 번만 센다.
 */
import { describe, it, expect } from "vitest";
import { weekRangeKST, categorize, summarizeWeek, coachLines } from "../../utils/weeklyBook";
import { mergeLedgerRows } from "../../utils/ledgerDedupe";

const at = (iso) => new Date(iso);
const tx = (type, amount, description, iso = "2026-11-10T03:00:00Z") => ({ id: `${type}-${amount}-${iso}`, type, amount, description, timestamp: at(iso) });

describe("한 주의 범위(한국 시간)", () => {
  it("수요일 낮 → 그 주 월요일 0시(KST)부터 7일", () => {
    const r = weekRangeKST(Date.parse("2026-11-11T04:00:00Z")); // KST 수 13시
    expect(new Date(r.start).toISOString()).toBe("2026-11-08T15:00:00.000Z"); // KST 11/9(월) 00:00
    expect(r.end - r.start).toBe(7 * 86400e3);
    expect(r.label).toBe("11월 9일 ~ 11월 15일");
  });
  it("일요일 밤 23시(KST)는 아직 그 주, 월요일 0시 5분은 새 주", () => {
    expect(weekRangeKST(Date.parse("2026-11-15T14:00:00Z")).label).toBe("11월 9일 ~ 11월 15일");
    expect(weekRangeKST(Date.parse("2026-11-15T15:05:00Z")).label).toBe("11월 16일 ~ 11월 22일");
  });
  it("지난주", () => expect(weekRangeKST(Date.parse("2026-11-11T04:00:00Z"), -1).label).toBe("11월 2일 ~ 11월 8일"));
});

describe("분류 — 운영 원장의 실제 문구", () => {
  it.each([
    [tx("salaryPayment", 1_800_000, "[주급] 2026-W45 실수령 1,800,000원 (세전 2,000,000원 / 세금 200,000원)"), "income", "salary"],
    [tx("현금 입금", 5000, "3일차 출석 보상"), "income", "reward"],
    [tx("파킹통장 이자", 120, "파킹통장 이자 120원 (1일치)"), "income", "interest"],
    [tx("shop_sale", 3000, "김서아님이 새콤달콤 1개 구매 - 매출 (+3,000원)"), "income", "business"],
    [tx("아이템 판매", 900, "시리얼 1컵 1개 국고 되팔기 (900알찬)"), "income", "business"],
    [tx("transaction", 10000, "정찬우님으로부터 10,000원을 송금 받았습니다."), "income", "gift"],
    [tx("현금 지급 (경제이벤트)", 50000, "[경제이벤트] 학급 전원에게 현금 50,000원 지급"), "income", "event"],
    // 2026-11-11 배포본 실측: «○○님으로부터 입금»이 «기타»로 떨어졌다
    [tx("transaction", 100000, "김영민님으로부터 입금"), "income", "gift"],
    [tx("transaction", -100000, "김영민님에게 출금"), "expense", "gift"],
    [tx("아이템 구매", -3000, "종이컵 1개 구매 (3,000알찬)"), "expense", "shop"],
    [tx("shop_purchase", -3300, "연호의 가게에서 새콤달콤 1개 구매 (-3,300원, VAT 300원 포함)"), "expense", "shop"],
    [tx("transaction", -20000, "[자동] 순자산세 20,000원 (순자산 2,000,000원 × 1.0%)"), "expense", "tax"],
    [tx("재산 손실 (경제이벤트)", -40000, "[경제이벤트] 순자산 800,000원 기준 5.0% = 40,000원 부과. 차감 40,000원"), "expense", "event"],
    [tx("musicRequest", -1000, '음악 우선 신청: "노래"'), "expense", "music"],
    [tx("transaction", -5000, "소미니님에게 5,000원을 송금했습니다."), "expense", "gift"],
    [tx("현금 출금", -70000, "함께구매 참여: 선생님 의자 사용권 (-70,000원)"), "expense", "shop"],
    [tx("파킹통장 입금", -50000, "파킹통장 입금 50,000원"), "move", "saving"],
    [tx("파킹통장 출금", 20000, "파킹통장 출금 20,000원"), "move", "saving"],
    [tx("예금 가입", -100000, "일복리예금 7일 가입 (100,000원) - 선생님 계정 연동"), "move", "saving"],
    [tx("예금 만기", 101000, "일복리예금 7일 만기 수령 (원금: 100000 이자: 1000) - 선생님 계정에서"), "move", "saving"],
    [tx("대출 실행", 300000, "일복리대출 7일 대출 (300,000원) - 선생님 계정 연동"), "move", "loan"],
    [tx("대출 상환", -310000, "대출 일시 상환: 일복리대출 7일 (원금: 300000 이자: 10000 경과: 7일)"), "move", "loan"],
    [tx("???", -1, "알 수 없는 줄"), "expense", "etc"],
  ])("%#", (row, group, id) => {
    const c = categorize(row);
    expect([c.group, c.id]).toEqual([group, id]);
  });
});

describe("한 주 요약", () => {
  const range = weekRangeKST(Date.parse("2026-11-11T04:00:00Z"));
  const rows = [
    tx("salaryPayment", 1_000_000, "[주급] 실수령"),
    tx("아이템 구매", -200_000, "종이컵 1개 구매"),
    tx("아이템 구매", -100_000, "사탕 1개 구매", "2026-11-11T01:00:00Z"),
    tx("transaction", -50_000, "[자동] 순자산세 50,000원"),
    tx("파킹통장 입금", -400_000, "파킹통장 입금 400,000원"),
    tx("파킹통장 출금", 100_000, "파킹통장 출금 100,000원"),
    tx("대출 실행", 300_000, "일복리대출 7일 대출"),
    tx("아이템 구매", -999_999, "지난주 구매", "2026-11-05T03:00:00Z"), // 범위 밖
    tx("아이템 사용", 0, "새콤달콤 1개 사용"), // 0원 줄
  ];
  const s = summarizeWeek(rows, range);

  it("번 돈·쓴 돈·남긴 돈 — 옮긴 돈과 범위 밖은 빠진다", () => {
    expect(s.incomeTotal).toBe(1_000_000);
    expect(s.expenseTotal).toBe(350_000);
    expect(s.left).toBe(650_000);
    expect(s.keepRate).toBeCloseTo(0.65, 5);
    expect(s.count).toBe(7);
  });
  it("쓴 곳은 큰 순서", () => {
    expect(s.expense.map((e) => [e.id, e.total, e.count])).toEqual([["shop", 300_000, 2], ["tax", 50_000, 1]]);
  });
  it("통장·대출은 따로 센다", () => {
    expect(s.savedNet).toBe(300_000);
    expect(s.borrowed).toBe(300_000);
    expect(s.repaid).toBe(0);
  });
  it("번 돈이 없으면 비율은 null", () => {
    expect(summarizeWeek([tx("아이템 구매", -100, "구매")], range).keepRate).toBeNull();
    expect(summarizeWeek([], range).count).toBe(0);
    expect(summarizeWeek(null, range).count).toBe(0);
  });
  it("한 줄 조언", () => {
    const fmt = (n) => `${n.toLocaleString()}알찬`;
    const lines = coachLines(s, fmt);
    expect(lines[0]).toMatch(/65%/);
    expect(lines[1]).toMatch(/상점/);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(coachLines(summarizeWeek([], range))[0]).toMatch(/아직/);
    const over = summarizeWeek([tx("salaryPayment", 100, "[주급]"), tx("아이템 구매", -500, "구매")], range);
    expect(coachLines(over, fmt)[0]).toMatch(/400알찬 더 썼어요/);
  });
});

describe("세 원장 합치기", () => {
  const t = at("2026-11-10T03:00:00Z");
  it("0원 기록 줄은 버리고, 같은 id·같은 주급은 한 번만", () => {
    const activity = [
      { id: "a1", type: "아이템 사용", amount: 0, description: "사용", timestamp: t },
      { id: "a2", type: "salaryPayment", weekKey: "2026-W45", amount: 1000, description: "[주급]", timestamp: t },
      { id: "a3", type: "쿠폰 획득", amount: 0, couponAmount: 2, description: "보상", timestamp: t },
    ];
    const sub = [
      { id: "t1", type: "salaryPayment", weekKey: "2026-W45", amount: 1000, description: "주급", timestamp: t },
      { id: "t2", type: "transfer", amount: -500, description: "송금했습니다", timestamp: t },
    ];
    const root = [
      { id: "t2", amount: -500, description: "송금했습니다", timestamp: t },
      { id: "r1", amount: 700, description: "받았습니다", createdAt: t },
    ];
    const ids = mergeLedgerRows(activity, sub, root).map((r) => r.id).sort();
    expect(ids).toEqual(["a2", "a3", "r1", "t2"]);
  });
  it("같은 돈이 두 원장에 적혔으면 한 줄(상점 구매)", () => {
    const activity = [{ id: "a", type: "아이템 구매", amount: -3000, description: "급식 우선권 1개 구매 (3,000알찬)", timestamp: t }];
    const sub = [{ id: "s", amount: -3000, description: "[관리자 상점] 급식 우선권 1개 (단가 3,000원)", timestamp: new Date(t.getTime() + 300) }];
    expect(mergeLedgerRows(activity, sub, [])).toHaveLength(1);
  });
  it("🔒 화면·데이터층은 문서 id 를 뒤에 쓴다 — 데이터의 id 필드가 문서 id 를 덮지 않는다(교차검증 codex·grok)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of ["../../pages/my-assets/MyAssets.js", "../../firebase/db/ledger.js"]) {
      const src = fs.readFileSync(path.resolve(__dirname, f), "utf8");
      expect(src).toMatch(/\{ \.\.\.d\.data\(\), id: d\.id \}/);
      expect(src).not.toMatch(/\{ id: d\.id, \.\.\.d\.data\(\) \}/);
    }
  });
  it("최신순, 빈 입력에 던지지 않는다", () => {
    const rows = mergeLedgerRows([], [{ id: "old", amount: 1, timestamp: at("2026-11-01T00:00:00Z") }, { id: "new", amount: 1, timestamp: at("2026-11-10T00:00:00Z") }], undefined);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(mergeLedgerRows()).toEqual([]);
  });
});

describe("보험 줄 분류(2026-11-11)", () => {
  it("보험료는 쓴 돈 «보험료», 보험금은 번 돈 «보험금» — 경제 이벤트·기타로 새지 않는다", () => {
    expect(categorize({ type: "보험료 납부", amount: -500, description: "재난 보험 7일 가입 — 보험료 500원, 보장 한도 10,000원" })).toEqual({ group: "expense", id: "insurance", label: "보험료" });
    expect(categorize({ type: "보험금 지급", amount: 1237, description: "[재난 보험] 경제이벤트 손실 2,475원의 절반을 보험이 대신 냈어요 — 보험금 1,237원" })).toEqual({ group: "income", id: "insurance", label: "보험금" });
    expect(categorize({ type: "재산 손실 (경제이벤트)", amount: -2475, description: "[경제이벤트] 순자산 49,500원 기준 5.0% = 2,475원 부과. 차감 2,475원" })).toMatchObject({ group: "expense", id: "event" });
  });
});
