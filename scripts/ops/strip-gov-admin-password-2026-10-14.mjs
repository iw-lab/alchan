// scripts/ops/strip-gov-admin-password-2026-10-14.mjs
// 🔒 governmentSettings/{classCode}.adminPassword 필드를 지운다.
//
// 왜: 대통령실 «설정» 모달에 «관리자 비밀번호 변경» 칸이 있었고, 입력값이 이 문서에 **평문**으로
//   저장됐다. 그런데 이 문서는 같은 반 학생이 읽을 수 있고(rules: read if isSameClassFast),
//   그 비밀번호를 검사하는 코드는 어디에도 없다 — 쓰이지 않는 비밀번호가 학생에게만 보였다.
//   2026-10-14 코드에서 칸을 지웠고, 이미 저장된 값은 이 스크립트로 지운다.
//
// 기본은 dry-run(어느 학급 문서에 값이 있는지만 — **값은 출력하지 않는다**). 실제 삭제는 --apply.
//   node scripts/ops/strip-gov-admin-password-2026-10-14.mjs [--apply]
import { authHeaders, firestoreBase } from "./_firestore-rest.mjs";

const APPLY = process.argv.includes("--apply");
const headers = await authHeaders();
const base = firestoreBase();

const res = await fetch(`${base}:runQuery`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "governmentSettings" }],
      select: { fields: [{ fieldPath: "adminPassword" }] },
    },
  }),
});
if (!res.ok) throw new Error(`조회 실패 HTTP ${res.status}`);
const rows = (await res.json()).filter((r) => r.document);
const targets = rows.filter((r) => (r.document.fields?.adminPassword?.stringValue || "") !== "" ||
  (r.document.fields?.adminPassword && !("stringValue" in r.document.fields.adminPassword)));

console.log(`governmentSettings ${rows.length}건 중 adminPassword 값이 있는 문서 ${targets.length}건`);
for (const r of targets) {
  const name = r.document.name; // projects/.../documents/governmentSettings/{classCode}
  const id = name.split("/").pop();
  if (!APPLY) {
    console.log(`  [dry-run] ${id}`);
    continue;
  }
  // updateMask 에 이름만 있고 본문에 필드가 없으면 그 필드를 지운다. currentDocument.exists 로 새 문서 생성 방지.
  const url = `https://firestore.googleapis.com/v1/${name}?updateMask.fieldPaths=adminPassword&currentDocument.exists=true`;
  const p = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ fields: {} }) });
  console.log(`  ${p.ok ? "삭제" : `실패 HTTP ${p.status}`} ${id}`);
}
if (!APPLY && targets.length) console.log("실제로 지우려면 --apply");
