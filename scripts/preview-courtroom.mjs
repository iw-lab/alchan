#!/usr/bin/env node
/* eslint-disable */
// 재판방 레이아웃 합성 미리보기 → /tmp/courtroom_preview.png
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, "../public/courtroom");
const W = 800, H = 500;

const mod = await import(`file://${path.resolve(__dirname, "../src/data/courtroomLayout.js")}`);
const PROPS = mod.COURTROOM_PROPS;
const SEATS = mod.COURTROOM_SEATS;
const BADGES = mod.ROLE_BADGES;
const FRONT = new Set(mod.COURTROOM_FRONT_IDS || []);

// 배경 그라데이션
const bg = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0%" stop-color="#f4ecdc"/><stop offset="55%" stop-color="#efe2c8"/><stop offset="100%" stop-color="#e7d4b0"/>
   </linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`
);

const layers = [];
const BG = new Set(["panel_wall", "floor_wood"]);
const sorted = [...PROPS].sort((a, b) => (a.z || 0) - (b.z || 0));
const backLayers = [];
const frontLayers = [];
for (const p of sorted) {
  const pw = Math.round((p.w / 100) * W);
  const ph = Math.round(((p.h || p.w) / 100) * H);
  try {
    const buf = await sharp(path.join(DIR, `${p.id}.png`))
      .resize(pw, ph, { fit: BG.has(p.id) ? "fill" : "inside" })
      .toBuffer();
    const layer = {
      input: buf,
      left: Math.round((p.x / 100) * W - pw / 2),
      top: Math.round((p.y / 100) * H - ph / 2),
    };
    (FRONT.has(p.id) ? frontLayers : backLayers).push(layer);
  } catch (e) {
    console.warn("skip", p.id, e.message);
  }
}
layers.push(...backLayers);

// 좌석 마커 (SVG)
const seatMarkers = [];
const pushSeat = (role, s, idx) => {
  const b = BADGES[role] || { icon: "?", color: "#888", label: role };
  const cx = (s.x / 100) * W;
  const cy = (s.y / 100) * H;
  const r = ((s.w || 9) / 100) * W / 2;
  seatMarkers.push(
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,.78)" stroke="${b.color}" stroke-width="3"/>` +
    `<rect x="${cx - 24}" y="${cy - r - 15}" width="48" height="14" rx="7" fill="${b.color}"/>` +
    `<text x="${cx}" y="${cy - r - 4}" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">${b.label}${idx != null ? idx + 1 : ""}</text>`
  );
};
["judge", "prosecutor", "complainant", "lawyer", "defendant", "witness"].forEach((r) => {
  if (SEATS[r]) pushSeat(r, SEATS[r]);
});
(SEATS.jury || []).forEach((s, i) => pushSeat("jury", s, i));

const overlay = Buffer.from(`<svg width="${W}" height="${H}">${seatMarkers.join("")}</svg>`);
layers.push({ input: overlay, left: 0, top: 0 });
// 앞 가구는 좌석(캐릭터) 위에
layers.push(...frontLayers);

await sharp(bg).composite(layers).png().toFile("/tmp/courtroom_preview.png");
console.log("✅ /tmp/courtroom_preview.png");
