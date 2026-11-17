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
  for (const portrait of [false, true]) {
    const r = await p.evaluate(async (portrait) => {
      const m = await import("/src/utils/maskPhoto.js");
      // 1600×900 표: 번호(48) · 이름(77) · 금액 15칸(83)
      const W = 1600; const H = 900; const L = 140;
      const cols = [L, L + 48, L + 125]; for (let i = 1; i <= 15; i++) cols.push(L + 125 + i * 83);
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#3c3c3c";
      for (const x of cols) g.fillRect(x, 50, 3, H - 80);
      for (let y = 50; y < H - 30; y += 38) g.fillRect(cols[0], y, cols[cols.length - 1] - cols[0], 3);
      g.font = "26px sans-serif";
      for (let r = 0; r < 21; r++) { g.fillText(String(r + 1), cols[0] + 10, 80 + r * 38); g.fillText("김민재", cols[1] + 4, 80 + r * 38); }
      let src = c;
      if (portrait) { // 세로로 찍은 사진: 90° 돌린 그림
        src = document.createElement("canvas"); src.width = H; src.height = W;
        const s = src.getContext("2d"); s.translate(H, 0); s.rotate(Math.PI / 2); s.drawImage(c, 0, 0);
      }
      const blob = await new Promise((res) => src.toBlob(res, "image/png"));
      const { canvas, auto } = await m.maskNamesInPhoto(blob);
      const k = canvas.width / W; const gg = canvas.getContext("2d");
      const px = (x, y) => { const d = gg.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };
      const ys = [100, 300, 500, 700];
      const flip = px(cols[1] + 38, 300) > 40 && px(W - 1 - (cols[1] + 38), H - 300) < 40; // 세로 사진은 어느 쪽으로 눕혔는지 모른다
      const X = (x) => (flip ? W - 1 - x : x); const Y = (y) => (flip ? H - y : y);
      return {
        auto, w: canvas.width, h: canvas.height,
        name: ys.map((y) => px(X(cols[1] + 38), Y(y))),      // 이름 칸 가운데 → 검정(<40)
        no: ys.map((y) => px(X(cols[0] + 24), Y(y))),         // 번호 칸 가운데 → 안 검정
        money: ys.map((y) => px(X(cols[2] + 40), Y(y))),      // 첫 금액 칸 → 안 검정
      };
    }, portrait);
    const ok = r.auto && r.w > r.h && r.name.every((v) => v < 40) && r.no.every((v) => v > 120) && r.money.every((v) => v > 120);
    console.log(`${ok ? "PASS" : "FAIL"} ${portrait ? "세로 사진" : "가로 사진"} auto=${r.auto} ${r.w}x${r.h} 이름=${r.name.map(Math.round)} 번호=${r.no.map(Math.round)} 금액=${r.money.map(Math.round)}`);
    if (!ok) fail++;
  }
} finally {
  await b.close();
}
process.exit(fail ? 1 : 0);
