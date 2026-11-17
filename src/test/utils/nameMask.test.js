// 이름 칸 자동 가리기 — 공개 저장소라 실제 사진(학생 이름) 대신 같은 양식의 표를 그려 시험한다.
//   실제 사진 실측(2026-11-17): 정방향·거꾸로·±4° 기울임·어둡게·흐리게·여백 많음·꽉 차게 9가지 모두 이름 칸만 가림.
import { describe, it, expect } from "vitest";
import { findNameColumn } from "../../utils/nameMask";

/** 번호(30) · 이름(48) · 금액 15칸(52) 표. shear = 기울임(dx/dy), names = 이름 칸에 세로획 글씨 */
function sheet({ w = 1000, h = 560, left = 90, shear = 0, flip = false, names = true } = {}) {
  const g = new Uint8Array(w * h).fill(215);
  const cols = [left, left + 30, left + 78]; for (let i = 1; i <= 15; i++) cols.push(left + 78 + i * 52);
  const top = 30; const bot = h - 20; const cy = h / 2;
  const put = (x, y, v = 60) => { x = Math.round(x + (y - cy) * shear); if (x >= 0 && x < w && y >= 0 && y < h) g[y * w + x] = v; };
  for (const c of cols) for (let y = top; y < bot; y++) { put(c, y); put(c + 1, y); }
  for (let y = top; y < bot; y += 24) for (let x = cols[0]; x <= cols[cols.length - 1]; x++) { put(x, y); put(x, y + 1); }
  for (let r = 0; r < 21; r++) {
    const y0 = top + r * 24 + 6;
    if (names) for (const dx of [10, 18, 27, 35]) for (let y = y0; y < y0 + 13; y++) put(cols[1] + dx, y, 70); // 이름 글씨 세로획
    for (let y = y0; y < y0 + 10; y++) put(cols[0] + 14, y, 80);                                              // 번호
    if (r % 3 === 0) for (let y = y0; y < y0 + 9; y++) { put(cols[2] + 6, y, 90); put(cols[2] + 20, y, 90); } // 금액 손글씨
  }
  if (!flip) return { g, w, h, cols, cy, shear };
  const f = new Uint8Array(w * h); for (let i = 0; i < f.length; i++) f[i] = g[f.length - 1 - i];
  return { g: f, w, h, cols: cols.map((c) => w - 1 - c).reverse(), cy, shear, flipped: true };
}

/** 다각형 안쪽인지(짝-홀 규칙) */
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

function expectNameOnly(s) {
  const r = findNameColumn(s.g, s.w, s.h);
  expect(r.ok).toBe(true);
  const [noL, nameL, nameR] = s.flipped ? [s.cols[s.cols.length - 1], s.cols[s.cols.length - 2], s.cols[s.cols.length - 3]] : [s.cols[0], s.cols[1], s.cols[2]];
  const sx = (x, y) => x + (y - s.cy) * s.shear * (s.flipped ? 1 : 1);
  for (let y = 40; y < s.h - 30; y += 20) {
    for (let f = 0.1; f <= 0.9; f += 0.2) expect(inside(r.poly, sx(nameL + (nameR - nameL) * f, y), y)).toBe(true); // 이름 칸 전부 가림
    expect(inside(r.poly, sx((noL + nameL) / 2, y), y)).toBe(false);                                              // 번호는 보인다
    const money = s.flipped ? nameR - 8 : nameR + 8;
    expect(inside(r.poly, sx(money, y), y)).toBe(false);                                                          // 금액 칸 손글씨는 보인다
  }
}

describe("findNameColumn — 이름 칸만 가린다(번호·금액은 남긴다)", () => {
  it("정방향", () => expectNameOnly(sheet()));
  it("거꾸로(180°) 찍은 사진", () => expectNameOnly(sheet({ flip: true })));
  it("비스듬히 찍은 사진(±10%)", () => { expectNameOnly(sheet({ shear: 0.1 })); expectNameOnly(sheet({ shear: -0.1 })); });
  it("표가 오른쪽에 치우친 사진", () => expectNameOnly(sheet({ left: 150, w: 1100 })));
  it("표가 없으면 못 찾았다고 한다(그냥 보내지 않게)", () => {
    expect(findNameColumn(new Uint8Array(1000 * 560).fill(200), 1000, 560).ok).toBe(false);
  });
});
