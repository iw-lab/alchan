// scripts/ops/scheduler-pause.mjs
//
// 예약 함수(Cloud Scheduler 잡)를 **일시정지/재개**한다. 마이그레이션·점검처럼
// "지금 아무것도 쓰지 마" 창이 필요할 때 쓴다.
//
//   node scripts/ops/scheduler-pause.mjs status
//   node scripts/ops/scheduler-pause.mjs status --fail-if-paused   # 하나라도 멈춰 있으면 exit 1
//   node scripts/ops/scheduler-pause.mjs pause
//   node scripts/ops/scheduler-pause.mjs resume
//
// ⚠️ **정지는 돈을 멈춘다.** 주급(월·금 08:30)·세금·이자·배당이 이 잡들로 나간다.
//    정지한 채로 잊으면 학생들에게 조용히 지급이 안 된다 — 실패가 **에러 없이** 일어나는 종류다.
//    그래서 정지 시 Firestore `systemState/schedulerPause` 에 마커를 남기고,
//    `status` 가 경과 시간을 같이 보여준다. CI(`.github/workflows/scheduler-guard.yml`)가
//    3시간마다 + 주급 30분 전(월·금 08:00 KST)에 `--fail-if-paused` 로 확인해 방치를 잡는다.
//
// ⚠️ **이건 완전한 쓰기 정지가 아니다.** 예약 함수만 멈춘다 —
//    브라우저의 클라이언트 직접 쓰기, onCall/onRequest 함수, 수동 GitHub Actions 는 그대로 열려 있다.
//    진짜 프리즈가 필요하면 규칙을 임시 deny 로 바꾸는 것까지 해야 한다(2026-08-19 이전 때는
//    방학 야간이라 사용자가 없었을 뿐, 장치로 막은 게 아니었다).
//
// ⚠️ jobs.list 는 이 계정 권한으로 **빈 배열**을 돌려준다(권한 부족을 에러 대신 빈 목록으로 표현).
//    그래서 이름을 직접 박아 개별 GET 한다 — 목록이 비었다고 "잡이 없다"고 읽으면 안 된다.
//    이름 규칙: firebase-schedule-<함수명>-<리전>

import { accessToken } from "./_auth.mjs";

const PROJECT = "inconomysu-class";
const REGION = "asia-northeast3";
const FUNCS = ["stockPriceSchedulerV2", "hourlySchedulerV2", "weeklyEconomySchedulerV2", "dividendSchedulerV2"];
const CMD = process.argv[2] || "status";
const FAIL_IF_PAUSED = process.argv.includes("--fail-if-paused");

// ⚠️ 화이트리스트가 없으면 `paus` 같은 오타가 **resume 으로 처리**된다 —
//    점검 중에 예약 함수를 되살려 쓰기가 다시 들어오는 최악의 오작동이다.
if (!["status", "pause", "resume"].includes(CMD)) {
  console.error(`알 수 없는 명령: ${CMD}\n  사용법: status | pause | resume  [--fail-if-paused]`);
  process.exit(2);
}

const MARKER = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/systemState/schedulerPause`;
const jobUrl = (fn, verb = "") =>
  `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs/firebase-schedule-${fn}-${REGION}${verb}`;

const t = await accessToken();
const H = { authorization: `Bearer ${t}`, "content-type": "application/json" };

async function readMarker() {
  const r = await fetch(MARKER, { headers: H });
  if (!r.ok) return null;
  const j = await r.json();
  return j.fields?.pausedAt?.timestampValue || null;
}
async function writeMarker(pausedAt) {
  await fetch(MARKER, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ fields: pausedAt
      ? { pausedAt: { timestampValue: pausedAt }, note: { stringValue: "scheduler-pause.mjs" } }
      : { note: { stringValue: "resumed" } } }),
  });
}

let changed = 0, paused = 0, seen = 0;

for (const fn of FUNCS) {
  const g = await fetch(jobUrl(fn), { headers: H });
  if (g.status === 404) { console.log(`  ⚪ ${fn.padEnd(26)} 잡 없음`); continue; }
  if (!g.ok) {
    // 조회 실패를 무시하면 "정지 안 된 잡"을 정지된 걸로 착각한다 — 치명적이라 즉시 멈춘다.
    console.error(`  ❌ ${fn.padEnd(26)} 조회 실패 ${g.status} — 상태를 알 수 없어 중단한다`);
    process.exit(1);
  }
  const job = await g.json();
  seen++;
  if (job.state !== "ENABLED") paused++;

  if (CMD === "status") { console.log(`  ${job.state === "ENABLED" ? "🟢" : "⏸️ "} ${fn.padEnd(26)} ${job.state} · ${job.schedule}`); continue; }

  const want = CMD === "pause" ? "PAUSED" : "ENABLED";
  if (job.state === want) { console.log(`  = ${fn.padEnd(26)} 이미 ${want}`); continue; }
  const p = await fetch(jobUrl(fn, CMD === "pause" ? ":pause" : ":resume"), { method: "POST", headers: H, body: "{}" });
  if (!p.ok) { console.log(`  ❌ ${fn.padEnd(26)} ${p.status} ${(await p.text()).slice(0, 160)}`); process.exitCode = 1; continue; }
  changed++;
  console.log(`  ${CMD === "pause" ? "⏸️ " : "▶️ "} ${fn.padEnd(26)} ${job.state} → ${(await p.json()).state}`);
}

if (CMD === "pause") {
  const now = new Date().toISOString();
  await writeMarker(now);
  console.error(`\n정지 ${changed}건 · 마커 systemState/schedulerPause = ${now}`);
  console.error("⚠️  주급·세금·이자·배당이 지금 멈춰 있다. 작업이 끝나면 반드시:");
  console.error("      node scripts/ops/scheduler-pause.mjs resume");
} else if (CMD === "resume") {
  await writeMarker(null);
  console.log(`\n재개 ${changed}건 · 마커 해제`);
} else {
  const since = await readMarker();
  if (paused > 0) {
    const mins = since ? Math.round((Date.now() - Date.parse(since)) / 60000) : null;
    console.log(`\n⏸️  ${paused}/${seen} 개가 멈춰 있다${mins !== null ? ` · 정지 후 ${mins}분 경과(${since})` : " · 정지 마커 없음(수동 정지?)"}`);
    console.log("    재개: node scripts/ops/scheduler-pause.mjs resume");
    if (FAIL_IF_PAUSED) process.exitCode = 1;
  } else {
    console.log(`\n🟢 ${seen}개 전부 정상 동작 중`);
  }
}
