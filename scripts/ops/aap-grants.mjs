// scripts/ops/aap-grants.mjs
// 🧾 학습앱 보상 지급 원장 조회 — **환수하려면 grantId 를 알아야 한다.**
//
// 왜 이게 필요한가
//   `clawbackAppReward` 는 `grantId`(sha256 64자)로 지급 1건을 지목한다. 그런데 그 값은
//   원장(`appRewardGrants`, 서버 전용)과 활동로그의 `metadata` 에만 있고, 학생 화면
//   (`src/pages/my-assets/MyAssets.js`)은 활동로그를 표시할 때 metadata 를 버린다.
//   즉 **교사가 grantId 를 얻을 방법이 앱 안에 없었다.** 환수 함수만 만들면 부를 수가 없어
//   기능이 없는 것과 같다(2026-08-21 Claude 리뷰 CRITICAL).
//
//   교사 화면(P1-5)이 붙기 전까지 이 스크립트가 그 자리를 메운다.
//
// 용법
//   node scripts/ops/aap-grants.mjs [--class <학급코드>] [--app <appId>] [--day <YYYYMMDD>] [--limit N]
//
// ⚠️ 이 스크립트는 **읽기만** 한다. 실제 환수는 `clawbackAppReward` 를 통해서만 일어난다 —
//    원장을 손으로 고치는 길은 rules 로 막혀 있고(슈퍼관리자도 못 쓴다), 그게 맞다.
import { firestoreBase, authHeaders, plain } from "./_firestore-rest.mjs";

const argv = process.argv.slice(2);
const opt = (name, def = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const wantClass = opt("class");
const wantApp = opt("app");
const wantDay = opt("day");
const limit = Number(opt("limit", "30")) || 30;

const BASE = firestoreBase();
const H = await authHeaders();

// 원장은 문서 id 가 해시라 날짜순 정렬이 없다 — 페이지를 받아 클라이언트에서 거른다.
// 파일럿 규모(교사 1명·학급 2개)에서는 이걸로 충분하고, 커지면 그때 인덱스를 만든다.
// ⚠️ CI 가 firestore:indexes 를 배포하지 않으므로 **새 복합 인덱스를 요구하는 쿼리는 쓰지 않는다.**
const r = await (await fetch(`${BASE}/appRewardGrants?pageSize=300`, { headers: H })).json();
if (r.error) {
  console.error(`✗ 조회 실패: ${r.error.message}`);
  process.exit(1);
}
const docs = (r.documents || []).map((d) => ({ id: d.name.split("/").pop(), ...plain(d.fields) }));

// 이미 환수된 건은 표시해 준다 — 두 번 부르면 멱등으로 막히지만, 미리 보이는 게 낫다.
const back = await (await fetch(`${BASE}/appRewardClawbacks?pageSize=300`, { headers: H })).json();
const clawed = new Map(
  (back.documents || []).map((d) => {
    const f = plain(d.fields);
    return [d.name.split("/").pop(), f];
  }),
);

const rows = docs
  .filter((g) => (!wantClass || g.classCode === wantClass))
  .filter((g) => (!wantApp || g.appId === wantApp))
  .filter((g) => (!wantDay || g.kstDay === wantDay))
  .sort((a, b) => String(b.kstDay).localeCompare(String(a.kstDay)))
  .slice(0, limit);

if (rows.length === 0) {
  console.log("조건에 맞는 지급 기록이 없습니다.");
  console.log("  (앱 11개가 전부 보상 꺼짐이면 원장이 비어 있는 게 정상입니다 — aap-switch.mjs list)");
  process.exit(0);
}

console.log(`지급 기록 ${rows.length}건 (전체 ${docs.length}건 중)\n`);
console.log("  날짜      학급     앱                    종류   금액     되돌리기  grantId");
for (const g of rows) {
  const done = clawed.get(g.id);
  const state = done
    ? `환수됨(${Number(done.recoveredAmount || 0).toLocaleString("ko-KR")})`
    : g.revocable === true
      ? "가능"
      : "불가";
  console.log(
    `  ${String(g.kstDay || "?").padEnd(9)} ${String(g.classCode || "?").padEnd(8)}` +
      ` ${String(g.appId || "?").padEnd(21)} ${String(g.rewardType || "?").padEnd(6)}` +
      ` ${String(Number(g.amount || 0).toLocaleString("ko-KR")).padStart(8)}` +
      ` ${state.padEnd(9)} ${g.id}`,
  );
}
console.log("\n환수는 교사 계정으로 `clawbackAppReward` 를 호출해야 한다(서버에서 학급을 대조한다).");
console.log("⚠️ 호출 UI 는 아직 없다 — 교사 화면(P1-5)에서 붙인다. 그전까지 파일럿을 열지 않는다.");
