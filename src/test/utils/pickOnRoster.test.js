/**
 * 🎟️ 쿠폰 추첨에 학급 전원을 최소 1장으로 넣는다.
 *
 * 왜: 한 장도 응모하지 못한 아이가 아예 뽑힐 수 없으면 그건 상이 아니라 벌에 가깝다.
 * 불변식 셋 — 이 셋이 어긋나면 확률이 조용히 왜곡된다.
 *   ① 미응모 학생도 정확히 1장
 *   ② 응모한 학생은 응모한 장수 그대로 (바닥 1장이 얹혀 6장이 되면 안 된다)
 *   ③ 선생님은 명단에서 빠진다(호출부가 걸러 넘긴다 — 여기선 넘긴 것만 들어감을 확인)
 */
import { describe, it, expect } from "vitest";
import { buildEntriesFromDonations } from "../../utils/pickOn";

const roster = [
  { id: "u1", name: "하하" },
  { id: "u2", name: "후후" },
  { id: "u3", name: "히히" },
  { id: "u4", name: "쿠쿠" },
];
const weights = (entries) => Object.fromEntries(entries.map((e) => [e.name, e.weight]));

describe("추첨 명단 · 전원 최소 1장", () => {
  it("한 장도 안 낸 학생도 1장으로 참가한다", () => {
    const e = buildEntriesFromDonations([{ userId: "u1", userName: "하하", amount: 5 }], roster);
    const w = weights(e);
    expect(e).toHaveLength(4);
    expect(w["후후"]).toBe(1);
    expect(w["히히"]).toBe(1);
    expect(w["쿠쿠"]).toBe(1);
  });

  it("응모한 학생은 낸 만큼만 — 바닥 1장이 얹히지 않는다", () => {
    const e = buildEntriesFromDonations(
      [
        { userId: "u1", userName: "하하", amount: 5 },
        { userId: "u1", userName: "하하", amount: 2 },
      ],
      roster,
    );
    expect(weights(e)["하하"]).toBe(7); // 8 이면 바닥 1장이 잘못 더해진 것
  });

  it("1장 응모한 학생과 미응모 학생이 같은 1장이다", () => {
    const e = buildEntriesFromDonations([{ userId: "u3", userName: "히히", amount: 1 }], roster);
    const w = weights(e);
    expect(w["히히"]).toBe(1);
    expect(w["후후"]).toBe(1);
  });

  it("명단을 안 넘기면 예전처럼 응모자만 나온다", () => {
    const e = buildEntriesFromDonations([{ userId: "u1", userName: "하하", amount: 5 }]);
    expect(e).toHaveLength(1);
    expect(weights(e)["하하"]).toBe(5);
  });

  it("명단에 없는 학생이 응모했어도 빠지지 않는다(전학 등)", () => {
    const e = buildEntriesFromDonations(
      [{ userId: "gone", userName: "전학생", amount: 3 }],
      roster,
    );
    expect(weights(e)["전학생"]).toBe(3);
    expect(e).toHaveLength(5);
  });

  it("id 가 숫자·문자로 섞여도 한 사람이다", () => {
    const e = buildEntriesFromDonations(
      [
        { userId: 1, userName: "하하", amount: 2 },
        { userId: "1", userName: "하하", amount: 3 },
      ],
      [{ id: "1", name: "하하" }],
    );
    expect(e).toHaveLength(1);
    expect(e[0].weight).toBe(5);
  });
});
