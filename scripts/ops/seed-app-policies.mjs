#!/usr/bin/env node
/**
 * platformAppPolicies/{appId} 시드 — 카탈로그(platformApps/_registry)에 있는 앱마다
 * **집행 정책 문서**를 하나씩 만든다.
 *
 * 왜 카탈로그를 읽어서 만드는가: 앱 목록의 정본은 이미 그 문서다. 여기서 목록을 다시
 * 적으면 두 벌이 되고, 두 벌은 반드시 어긋난다.
 *
 * ⚠️ **이미 있는 문서는 건드리지 않는다**(createDocument = 있으면 409).
 *    status·aapEnabled 는 운영 중 손으로 바뀌는 값이라, 시드가 덮으면
 *    "꺼둔 앱이 시드 한 번에 되살아나는" 사고가 된다.
 *    URL 만 갱신하려면 --sync-url 을 쓴다(그 필드만 PATCH).
 *
 * 기본값이 왜 이런가
 *   · aapEnabled: false — **아직 어떤 앱도 AAP 로 이관되지 않았다.** 파일럿(P1-4)에서
 *     구구성 수호대만 true 로 올린다. 기본이 true 면 이관 안 된 앱에 토큰이 나간다.
 *   · trustLevel: "L0" — 성취를 알찬이 독립 검증할 수 없다는 뜻. 서버를 가졌다고 L2 가
 *     아니라 **서버가 성취를 독립 검증**할 때만 L2 다(계획서 §3.1 C3).
 *   · dailyCashCap: 0 — L0 는 경제적 가치가 큰 보상 금지. 보상은 P1-2/P1-7 에서 켠다.
 *
 * 실행: node scripts/ops/seed-app-policies.mjs [--dry] [--sync-url]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const BASE = firestoreBase();

const DRY = process.argv.includes("--dry");
const SYNC_URL = process.argv.includes("--sync-url");
const H = await authHeaders();

// 1) 카탈로그에서 앱 목록을 읽는다(정본).
const regRes = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
// ⚠️ res.ok 를 안 보면 403/만료 토큰이 "앱 0개"로 보인다 — 권한 문제를 데이터 문제로 오진한다.
if (!regRes.ok) {
  throw new Error(`카탈로그 조회 실패 ${regRes.status}: ${(await regRes.text()).slice(0, 200)}`);
}
const reg = await regRes.json();
const raw = reg?.fields?.apps?.arrayValue?.values || [];
const apps = raw
  .map((v) => {
    const f = v?.mapValue?.fields; // map 이 아닌 원소가 섞여도 죽지 않는다
    if (!f) return null;
    return { id: f.id?.stringValue, label: f.label?.stringValue, url: f.url?.stringValue };
  })
  .filter((a) => a && a.id && a.url);
if (apps.length === 0) throw new Error("카탈로그에서 앱을 하나도 읽지 못했습니다");
// ⚠️ **조용한 부분 스킵 금지.** 하나라도 걸러졌으면 나머지가 성공해도 그건 완전한 시드가 아니다.
//    아무 말 없이 성공으로 끝나면 "정책이 없는 앱"이 생기고, 그 앱은 토큰 발급이 통째로 막힌다.
if (apps.length !== raw.length) {
  console.error(`⛔ 카탈로그 ${raw.length}개 중 ${raw.length - apps.length}개가 id/url 누락으로 걸러졌습니다.`);
  console.error("   먼저 platformApps/_registry 를 고치세요 — 부분 시드는 조용한 사고가 됩니다.");
  process.exit(1);
}

console.log(`카탈로그 앱 ${apps.length}개`);

const S = (v) => ({ stringValue: v });
const B = (v) => ({ booleanValue: v });
const I = (v) => ({ integerValue: String(v) });

let created = 0; let skipped = 0; let synced = 0;
for (const app of apps) {
  if (DRY) { console.log(`  · ${app.id.padEnd(22)} ${app.url}`); continue; }

  const body = {
    fields: {
      appId: S(app.id),
      label: S(app.label || app.id),
      // 🔴 kill switch. "active" 가 아니면 토큰이 안 나간다.
      status: S("active"),
      // 🔒 아직 이관 전. 파일럿에서 하나씩 켠다.
      aapEnabled: B(false),
      launchUrl: S(app.url),
      trustLevel: S("L0"),
      allowedClaims: { arrayValue: { values: [] } },
      dailyCashCap: I(0),
      dailyCouponCap: I(0),
      createdAt: { timestampValue: new Date().toISOString() },
      note: S("AAP v1 집행 정책. 캐시 금지 — 서버가 실행·지급 때마다 직접 읽는다."),
    },
  };

  const res = await fetch(`${BASE}/platformAppPolicies?documentId=${encodeURIComponent(app.id)}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });

  if (res.ok) { created += 1; console.log(`  ✅ 신규 ${app.id}`); continue; }
  if (res.status === 409) {
    if (!SYNC_URL) { skipped += 1; console.log(`  ⏭  기존 ${app.id} (건드리지 않음)`); continue; }
    // URL 만 맞춘다. status·aapEnabled 는 절대 건드리지 않는다.
    const p = await fetch(
      `${BASE}/platformAppPolicies/${encodeURIComponent(app.id)}?updateMask.fieldPaths=launchUrl`,
      { method: "PATCH", headers: H, body: JSON.stringify({ fields: { launchUrl: S(app.url) } }) },
    );
    if (p.ok) { synced += 1; console.log(`  🔄 URL 갱신 ${app.id}`); }
    else console.error(`  ✗ URL 갱신 실패 ${app.id}: ${p.status}`);
    continue;
  }
  console.error(`  ✗ ${app.id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

if (DRY) { console.log("\n--dry 이므로 쓰지 않았습니다."); process.exit(0); }
console.log(`\n✅ 신규 ${created} · 기존유지 ${skipped}${SYNC_URL ? ` · URL갱신 ${synced}` : ""}`);
