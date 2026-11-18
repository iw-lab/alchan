// 정산표 사진 → (휴대폰 안에서) 이름 칸을 검게 칠한 캔버스. 이 캔버스만 서버(→ Google 판독)로 나간다.
//   이름 칸 찾기는 nameMask.js(순수 계산). 세로로 찍은 사진은 눕혀서 본다(표는 가로가 긴 양식).
import { findNameColumn } from "./nameMask";

const MAX = 2000;   // 보낼 사진 긴 변
const PROBE = 1000; // 이름 칸 찾을 때 쓰는 폭(빠르게)

function drawRotated(bmp, deg) {
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k); const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  const side = deg % 180 !== 0;
  c.width = side ? h : w; c.height = side ? w : h;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180);
  g.drawImage(bmp, -w / 2, -h / 2, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0); // 돌리기 변환을 남기면 뒤에 칠하는 검은 띠가 밀려 이름이 그대로 보인다(2026-11-17 실측)
  return c;
}

function grayOf(canvas) {
  const w = PROBE; const h = Math.round((canvas.height * PROBE) / canvas.width);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return { gray: out, w, h };
}

export function fillPoly(canvas, poly, scale) {
  const g = canvas.getContext("2d");
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#000"; g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x * scale, y * scale) : g.moveTo(x * scale, y * scale)));
  g.closePath(); g.fill(); g.restore();
}

/**
 * 파일 → { canvas, auto, plain } — auto=true 면 이름 칸을 찾아 칠했다(plain = 칠하기 전 픽셀, 기기 밖으로 안 나간다). false 면 못 찾았다(선생님이 손으로 칠해야 보낼 수 있다).
 * 가로 사진은 그대로·거꾸로(180°는 찾기가 알아서 본다), 세로 사진은 90° 눕혀 본다. 못 찾으면 나머지 방향도 본다.
 */
export async function maskNamesInPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const order = bmp.height > bmp.width ? [90, 0] : [0, 90];
    let first = null;
    for (const deg of order) {
      const c = drawRotated(bmp, deg);
      if (!first) first = c;
      const { gray, w, h } = grayOf(c);
      const r = findNameColumn(gray, w, h);
      if (r.ok) {
        // 가리기 전 모습 — 자동으로 고른 자리가 틀렸을 때 선생님이 지우고 직접 칠할 수 있게(2026-11-18 «이름을 잘못 가리거나 반대쪽을 가려»)
        const plain = c.getContext("2d").getImageData(0, 0, c.width, c.height);
        fillPoly(c, r.poly, c.width / w);
        return { canvas: c, auto: true, plain };
      }
    }
    return { canvas: first, auto: false, plain: null };
  } finally {
    bmp.close?.();
  }
}

export const canvasToBase64 = (canvas) => {
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return url.slice(url.indexOf(",") + 1);
};
