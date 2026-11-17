// 정산표 사진에서 «이름» 칸을 휴대폰 안에서 찾아 검게 가린다 — 이름이 외부 AI(국외 서버)로 나가지 않게.
//   외부 AI 로 이름 칸을 찾으면 찾는 순간 이름이 나간다. 그래서 순수 계산(브라우저·시험 공용, 의존 0)으로 한다.
//
// 방법: 표는 인쇄된 같은 양식이다 — 왼쪽부터 번호 · 이름 · 요일 5 × 벌금·상금·쿠폰(같은 폭 15칸).
//   ① 어두운 픽셀(주변보다 어두운 것)만 남긴다  ② 거의 세로인 직선을 허프 변환으로 찾는다(기울어진·원근 사진도 줄마다 각도)
//   ③ «좁은 번호 칸 → 이름 칸 → 같은 폭 금액 칸 10개+» 무늬를 찾는다(거꾸로 찍힌 사진은 반대 방향)
//   ④ 그 사각형을 돌려준다. 못 찾으면 ok:false — 화면이 선생님에게 직접 칠하게 한다(그냥 보내지 않는다).

// ±20° — 원근으로 바깥 선은 더 기울고, 사진도 비스듬히 찍힌다
const THETAS = (() => { const a = []; for (let t = -0.35; t <= 0.3501; t += 0.006) a.push(Math.tan(t)); return a; })();

/**
 * 세로선 픽셀 = 1: 왼쪽·오른쪽(k 픽셀 떨어진 곳)보다 둘 다 확실히 어두운 픽셀 — «가로로 가는» 어두운 띠.
 *   가로줄은 좌우도 똑같이 어두워 빠지고, 조명 얼룩(넓게 어두움)도 빠진다. 세로줄·글씨 세로획만 남는다.
 */
export function darkMap(gray, w, h) {
  const k = Math.max(3, Math.round(w / 250));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = k; x < w - k; x++) {
      const g = gray[o + x];
      if (g < gray[o + x - k] - 12 && g < gray[o + x + k] - 12) out[o + x] = 1;
    }
  }
  return out;
}

/** 거의 세로인 직선들: [{ x0(가운데 높이에서의 x), t(기울기 dx/dy), votes }] — x0 오름차순 */
export function verticalLines(dark, w, h) {
  const B = 2; // 칸 너비(px)
  const nb = Math.ceil(w / B) + 1;
  const acc = THETAS.map(() => new Int32Array(nb));
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      if (!dark[y * w + x]) continue;
      for (let i = 0; i < THETAS.length; i++) {
        const b = Math.round((x - dy * THETAS[i]) / B);
        if (b >= 0 && b < nb) acc[i][b]++;
      }
    }
  }
  // 칸마다 최고 각도, 선 두께(2~3칸)를 합쳐 본다
  const best = new Float64Array(nb); const bt = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    for (let i = 0; i < THETAS.length; i++) {
      const v = acc[i][b] + 0.5 * ((acc[i][b - 1] || 0) + (acc[i][b + 1] || 0));
      if (v > best[b]) { best[b] = v; bt[b] = THETAS[i]; }
    }
  }
  const max = Math.max(...best);
  const minVotes = Math.max(h * 0.25, max * 0.3);
  const sep = Math.max(3, Math.round(w / 250 / B));
  const lines = [];
  for (let b = 0; b < nb; b++) {
    if (best[b] < minVotes) continue;
    let peak = true;
    for (let k = -sep; k <= sep; k++) if (k && best[b + k] > best[b]) { peak = false; break; }
    if (peak && (!lines.length || b * B - lines[lines.length - 1].x0 > sep * B)) lines.push({ x0: b * B, t: bt[b], votes: best[b] });
  }
  return lines;
}

/**
 * 이름 칸 고르기. 이 양식에서 이름 칸은 금액 칸과 폭이 비슷해(실측 0.9칸) 폭만으로는 못 가른다.
 * 확실히 다른 건 «번호 칸이 좁다»(0.35~0.8칸)는 것 — 그래서 «좁은 칸 바로 안쪽 칸»을 이름 칸으로 본다.
 *   ① 진한 선만 남긴다(득표가 상위 선들 중앙값의 68% 미만 = 세로로 줄지은 글씨가 만든 가짜 선)
 *   ② 칸 폭의 중앙값 m = 금액 칸 폭(칸 대부분이 금액 칸)
 *   ③ 정방향: 좁은 칸 → 이름 칸 → 그 뒤로 m 쯤 되는 칸이 10개 넘게  /  거꾸로(180°): 그 반대
 */
export function pickNameColumn(lines) {
  if (lines.length < 12) return null;
  const vs = lines.map((l) => l.votes).sort((a, b) => b - a);
  const ref = vs[Math.floor(Math.min(vs.length, 16) / 2)];
  const strong = lines.filter((l) => l.votes >= ref * 0.68);
  if (strong.length < 12) return null;
  const gaps = strong.slice(1).map((l, i) => l.x0 - strong[i].x0);
  const m = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const isMoney = (g) => g >= m * 0.75 && g <= m * 1.3;
  const isNarrow = (g) => g >= m * 0.35 && g <= m * 0.8;
  const isName = (g) => g >= m * 0.6 && g <= m * 2.4;
  let best = null;
  for (let i = 0; i + 1 < gaps.length; i++) {
    // 정방향: gaps[i]=번호, gaps[i+1]=이름, 뒤로 금액 칸
    if (isNarrow(gaps[i]) && isName(gaps[i + 1])) {
      const after = gaps.slice(i + 2, i + 17);
      const n = after.filter(isMoney).length;
      if (n >= 10 && (!best || n > best.n)) best = { left: strong[i + 1], right: strong[i + 2], n };
    }
    // 거꾸로: gaps[i]=이름, gaps[i+1]=번호, 앞으로 금액 칸
    if (isName(gaps[i]) && isNarrow(gaps[i + 1])) {
      const before = gaps.slice(Math.max(0, i - 15), i);
      const n = before.filter(isMoney).length;
      if (n >= 10 && (!best || n > best.n)) best = { left: strong[i], right: strong[i + 1], n };
    }
  }
  return best;
}

/**
 * 종이가 휘면 표 선도 휜다 — 직선 하나로 그으면 위·아래에서 옆 칸(금액)을 덮는다.
 * 높이 구간마다 예상 위치 ±s 안에서 세로선 픽셀이 가장 많은 x 를 다시 찾아 [y, x] 점들로 돌려준다.
 */
export function traceLine(dark, w, h, line) {
  const band = Math.max(16, Math.round(h / 18)); const sr = Math.max(4, Math.round(w / 120));
  const cy = h / 2; const pts = [];
  let prevDx = 0;
  for (let y0 = 0; y0 < h; y0 += band) {
    const y1 = Math.min(h, y0 + band);
    let best = -1; let bdx = prevDx;
    for (let dx = -sr; dx <= sr; dx++) {
      let c = 0;
      for (let y = y0; y < y1; y++) {
        const x = Math.round(line.x0 + (y - cy) * line.t + dx);
        if (x >= 1 && x < w - 1) c += dark[y * w + x] | dark[y * w + x - 1] | dark[y * w + x + 1];
      }
      if (c > best || (c === best && Math.abs(dx - prevDx) < Math.abs(bdx - prevDx))) { best = c; bdx = dx; }
    }
    if (best < (y1 - y0) * 0.25) bdx = prevDx; // 이 구간엔 선이 안 보인다(글씨·그림자) — 앞 구간을 따른다
    prevDx = bdx;
    const ym = (y0 + y1) / 2;
    pts.push([ym, line.x0 + (ym - cy) * line.t + bdx]);
  }
  pts.unshift([0, pts[0][1] + (0 - pts[0][0]) * line.t]);
  const L = pts[pts.length - 1]; pts.push([h, L[1] + (h - L[0]) * line.t]);
  return pts;
}

/**
 * 흑백 픽셀 → 이름 칸 다각형(그림 좌표 [x,y] 점들) 또는 ok:false.
 *   번호 쪽으로만 조금 넓히고(padOut), 금액 쪽은 선 안쪽으로 1px 물린다 — 금액 손글씨가 선에 붙어 있어도 안 가리게.
 */
export function findNameColumn(gray, w, h) {
  const dark = darkMap(gray, w, h);
  const lines = verticalLines(dark, w, h);
  const col = pickNameColumn(lines);
  if (!col) return { ok: false, lines };
  const flipped = col.left.x0 > (lines[0].x0 + lines[lines.length - 1].x0) / 2; // 거꾸로 찍힘 — 번호 칸이 오른쪽
  const padNo = Math.max(2, Math.round((col.right.x0 - col.left.x0) * 0.05));
  const L = traceLine(dark, w, h, col.left); const R = traceLine(dark, w, h, col.right);
  const lp = flipped ? 1 : -padNo; const rp = flipped ? padNo : -1; // 번호 쪽 바깥으로 padNo, 금액 쪽 안으로 1px
  const poly = [...L.map(([y, x]) => [x + lp, y]), ...R.reverse().map(([y, x]) => [x + rp, y])];
  return { ok: true, poly, lines, moneyCols: col.n };
}
