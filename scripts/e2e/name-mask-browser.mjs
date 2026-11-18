// 이름 칸 가리기 — 진짜 브라우저(캔버스)에서 «보낼 사진»의 이름 칸이 검은지 잰다.
//   왜: 노드 시험(src/test/utils/nameMask.test.js)은 찾기 계산만 본다. 2026-11-17 캔버스 변환이 남아
//   검은 띠가 (1000,563)만큼 밀려 그려졌는데(이름은 그대로 보임) 노드 시험은 초록이었다.
//   공개 저장소라 실제 사진 대신 같은 양식의 표를 브라우저에서 그려 쓴다(가로·세로 사진 둘 다).
// 실행: npx vite --port 5317 & → node scripts/e2e/name-mask-browser.mjs   (종료코드 0 = 통과)
import { chromium } from "playwright";

const URL = process.env.MASK_URL || "http://localhost:5317/";
const b = await chromium.launch();
let fail = 0;
try {
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  // big = 휴대폰 카메라 원본 크기(4000px)·가는 선 — 2026-11-18 «사진 찍기로 하니까 이름을 잘못 가려»: 큰 사진을 빠른 축소로 줄이면
  //   픽셀을 건너뛰어 가는 칸 선이 통째로 사라졌다(메신저로 받은 작은 사진은 멀쩡). 축소 품질 high 로 고쳤다.
  for (const [portrait, big] of [[false, false], [true, false], [false, true]]) {
    const r = await p.evaluate(async ([portrait, big]) => {
      const m = await import("/src/utils/maskPhoto.js");
      // 1600×900 표: 번호(48) · 이름(77) · 금액 15칸(83)
      const Z = big ? 2.5 : 1; const W = 1600 * Z; const H = 900 * Z; const L = 140 * Z; const LW = big ? 3 : 3;
      const cols = [L, L + 48 * Z, L + 125 * Z]; for (let i = 1; i <= 15; i++) cols.push(L + 125 * Z + i * 83 * Z);
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#3c3c3c";
      for (const x of cols) g.fillRect(Math.round(x), 50 * Z, LW, H - 80 * Z);
      for (let y = 50 * Z; y < H - 30 * Z; y += 38 * Z) g.fillRect(cols[0], y, cols[cols.length - 1] - cols[0], LW);
      g.font = `${26 * Z}px sans-serif`;
      for (let r = 0; r < 21; r++) { g.fillText(String(r + 1), cols[0] + 10 * Z, (80 + r * 38) * Z); g.fillText("김민재", cols[1] + 4 * Z, (80 + r * 38) * Z); }
      let src = c;
      if (portrait) { // 세로로 찍은 사진: 90° 돌린 그림
        src = document.createElement("canvas"); src.width = H; src.height = W;
        const s = src.getContext("2d"); s.translate(H, 0); s.rotate(Math.PI / 2); s.drawImage(c, 0, 0);
      }
      const blob = await new Promise((res) => src.toBlob(res, "image/png"));
      const { canvas, auto } = await m.maskNamesInPhoto(blob);
      const k = canvas.width / W; const gg = canvas.getContext("2d");
      const px = (x, y) => { const d = gg.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };
      const ys = [100, 300, 500, 700].map((y) => y * Z);
      const flip = px(cols[1] + 38 * Z, 300 * Z) > 40 && px(W - 1 - (cols[1] + 38 * Z), H - 300 * Z) < 40; // 세로 사진은 어느 쪽으로 눕혔는지 모른다
      const X = (x) => (flip ? W - 1 - x : x); const Y = (y) => (flip ? H - y : y);
      return {
        auto, w: canvas.width, h: canvas.height,
        name: ys.map((y) => px(X(cols[1] + 38 * Z), Y(y))),      // 이름 칸 가운데 → 검정(<40)
        no: ys.map((y) => px(X(cols[0] + 24 * Z), Y(y))),         // 번호 칸 가운데 → 안 검정
        money: ys.map((y) => px(X(cols[2] + 40 * Z), Y(y))),      // 첫 금액 칸 → 안 검정
      };
    }, [portrait, big]);
    const ok = r.auto && r.w > r.h && r.name.every((v) => v < 40) && r.no.every((v) => v > 120) && r.money.every((v) => v > 120);
    console.log(`${ok ? "PASS" : "FAIL"} ${big ? "카메라 크기(4000px) 사진" : portrait ? "세로 사진" : "가로 사진"} auto=${r.auto} ${r.w}x${r.h} 이름=${r.name.map(Math.round)} 번호=${r.no.map(Math.round)} 금액=${r.money.map(Math.round)}`);
    if (!ok) fail++;
  }
} finally {
  await b.close();
}
process.exit(fail ? 1 : 0);
