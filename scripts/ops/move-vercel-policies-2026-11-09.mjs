#!/usr/bin/env node
/**
 * platformAppPolicies/{appId} 안의 Vercel 주소 문자열 필드를 Cloudflare korea Pages 주소로 (2026-11-09 Vercel 이사).
 * 최상위 문자열 필드 중 값이 옛 주소로 시작하는 것만 바꾼다(경로·쿼리는 보존). updateTime 전제조건으로 쓴다.
 * 실행: node scripts/ops/move-vercel-policies-2026-11-09.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const MAP = [
  ["https://zep-chi.vercel.app", "https://yeolsoemal-school.pages.dev"],
  ["https://yeolsoemal-school.vercel.app", "https://yeolsoemal-school.pages.dev"],
  ["https://numrush.vercel.app", "https://numrush-2qi.pages.dev"],
  ["https://muhan-pi.vercel.app", "https://muhan-61w.pages.dev"],
  ["https://oreudap.vercel.app", "https://muhan-61w.pages.dev"],
  ["https://spanland.vercel.app", "https://spanland.pages.dev"],
  ["https://vocaworm-defense.vercel.app", "https://vocaworm-defense.pages.dev"],
  ["https://yutdash.vercel.app", "https://yutdash.pages.dev"],
  ["https://narae-teal.vercel.app", "https://narae-4fe.pages.dev"],
  ["https://koreahis.vercel.app", "https://koreahis.pages.dev"],
  ["https://hop-squad-mu.vercel.app", "https://hop-squad.pages.dev"],
  ["https://racket-rush.vercel.app", "https://racket-rush.pages.dev"],
];
const BASE = firestoreBase(), H = await authHeaders();
let tok = "", changed = 0;
do {
  const d = await (await fetch(`${BASE}/platformAppPolicies?pageSize=300${tok ? "&pageToken=" + tok : ""}`, { headers: H })).json();
  for (const doc of d.documents || []) {
    const fields = {}, mask = [];
    for (const [k, v] of Object.entries(doc.fields || {})) {
      const s = v.stringValue; if (typeof s !== "string") continue;
      const hit = MAP.find(([o]) => s === o || s.startsWith(o + "/") || s.startsWith(o + "?"));
      if (!hit) continue;
      fields[k] = { stringValue: hit[1] + s.slice(hit[0].length) }; mask.push(k);
      console.log(`${doc.name.split("/").pop()}.${k}: ${s} → ${fields[k].stringValue}`);
    }
    if (!mask.length || DRY) continue;
    const u = `${BASE}/platformAppPolicies/${doc.name.split("/").pop()}?${mask.map((m) => "updateMask.fieldPaths=" + m).join("&")}&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
    const w = await fetch(u, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 200)}`);
    changed++;
  }
  tok = d.nextPageToken || "";
} while (tok);
console.log(DRY ? "--dry 이므로 쓰지 않았습니다" : `✅ 문서 ${changed}개 바꿈`);
