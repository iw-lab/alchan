#!/usr/bin/env node
/**
 * 그림 문 검사 — firebase.json 이 /images/** · /avatar-shop/** 를 alchan-img.pages.dev 로 넘기므로,
 * build/ 의 그림이 그 문에 «같은 크기로» 다 있어야 한다. 없으면 배포 직후 그림이 깨진다.
 * 2026-11-12 Firebase Hosting 전송비 0 처방(scripts/deploy-img-door.sh). CI(deploy.yml) 배포 전 단계 — node_modules 없이 돈다.
 *   빠졌으면: 로컬에서 npm run build → bash scripts/deploy-img-door.sh → 커밋·push
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fb = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));
const reds = (fb.hosting?.redirects ?? []).filter((r) => String(r.destination).startsWith("https://"));
const DIRS = ["images", "avatar-shop"];
const miss = [];
for (const d of DIRS) {
  const r = reds.find((x) => x.source.startsWith(`/${d}/`));
  if (!r) { console.error(`❌ firebase.json 에 /${d}/** 넘김이 없다 — Firebase 가 그림을 직접 내보낸다(전송비)`); process.exit(1); }
}
const base = new URL(reds[0].destination).origin;
const files = [];
const walk = (p) => { for (const f of readdirSync(p)) { const q = join(p, f); if (statSync(q).isDirectory()) walk(q); else files.push(q); } };
for (const d of DIRS) walk(join(ROOT, "build", d));
let i = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++], rel = relative(join(ROOT, "build"), f).split("\\").join("/");
    try {
      // Pages 는 404.html 이 없으면 없는 파일에도 첫 페이지를 200 으로 준다 → 크기를 «꼭» 맞춘다(머리에 없으면 받아서 잰다)
      const url = `${base}/${rel.split("/").map(encodeURIComponent).join("/")}`;
      let r = await fetch(url, { method: "HEAD" });
      let len = r.headers.get("content-length");
      if (r.status === 200 && len == null) { r = await fetch(url); len = (await r.arrayBuffer()).byteLength; }
      len = Number(len);
      if (r.status !== 200 || len !== statSync(f).size) miss.push(`${rel} (${r.status} 크기 ${len}≠${statSync(f).size})`);
    } catch (e) { miss.push(`${rel} (${e.message})`); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
if (miss.length) {
  console.error(`❌ 그림 문(${base})에 없는·다른 그림 ${miss.length}개 — 로컬에서 bash scripts/deploy-img-door.sh 후 다시 push:\n  ` + miss.slice(0, 10).join("\n  "));
  process.exit(1);
}
console.log(`✅ 그림 문 ${files.length}개 일치 (${base})`);
