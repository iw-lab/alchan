// scripts/ops/monitoring-alerts.mjs
//
// 🚨 AAP 경보를 **사람이 실제로 받는 곳까지** 잇는다.
//
// 왜 필요한가: 보상 차단기는 `platformAlerts` 문서를 쓰고 `logger.error` 를 찍는다.
// 그런데 그 둘 다 **아무도 안 보면 없는 것과 같다.** Firestore 문서는 누가 열어야 보이고,
// 로그는 누가 조회해야 보인다. 파일럿을 여는 조건에 "경보를 실제로 수신"이 들어간 이유다.
//
// 이 스크립트가 만드는 것 셋 (전부 없으면 안 되고, 하나만 있어도 소용없다)
//   ① 로그 기반 지표 — `jsonPayload.event` 로 필터한 카운터
//   ② 알림 채널 — 이메일. **인증(verification)이 필요하다**: 코드가 든 메일이 실제로
//      도착해야 다음 단계로 갈 수 있다. 그 자체가 곧 수신 테스트다.
//   ③ 경보 정책 — 지표가 1 이라도 오르면 채널로 알린다
//
// 용법:
//   node scripts/ops/monitoring-alerts.mjs list
//   node scripts/ops/monitoring-alerts.mjs setup --email you@example.com
//   node scripts/ops/monitoring-alerts.mjs verify --code 123456
//   node scripts/ops/monitoring-alerts.mjs teardown        # 만든 것 되돌리기
import { accessToken } from "./_auth.mjs";

const P = process.env.GCLOUD_PROJECT || "inconomysu-class";
const MON = `https://monitoring.googleapis.com/v3/projects/${P}`;
const LOG = `https://logging.googleapis.com/v2/projects/${P}`;

/** 감시 대상 = 서버가 실제로 찍는 구조화 로그의 `event` 값. 코드와 여기가 짝이다. */
const WATCH = [
  {
    metric: "aap_reward_alert",
    event: "aap_reward_alert",
    title: "🚨 AAP 보상 차단기",
    why: "앱 하루 상한의 50%(경고)·80%(차단)를 넘었다. 차단은 breaker-reset 전까지 안 풀린다.",
    severity: "ERROR",
  },
  {
    metric: "aap_stats_denied",
    event: "aap_stats_denied",
    title: "📚 AAP 학습기록 거부",
    why: "정책이 닫혔거나 기록 스위치가 꺼진 채 앱이 계속 보내고 있다. 교사 신고보다 먼저 안다.",
    severity: "WARNING",
  },
];

async function api(url, init = {}) {
  const t = await accessToken();
  const r = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  // ⚠️ 응답 전체를 찍지 않는다 — 토큰이 섞여 나가는 사고를 원천 차단한다(_auth.mjs 규약).
  if (!r.ok) throw new Error(`${init.method || "GET"} ${url.split("/").slice(-1)[0]} → ${r.status} ${j?.error?.status || ""} ${String(j?.error?.message || "").slice(0, 200)}`);
  return j;
}

const listMetrics = () => api(`${LOG}/metrics`).then((j) => j.metrics || []);
const listChannels = () => api(`${MON}/notificationChannels`).then((j) => j.notificationChannels || []);
const listPolicies = () => api(`${MON}/alertPolicies`).then((j) => j.alertPolicies || []);

async function cmdList() {
  const [m, c, p] = await Promise.all([listMetrics(), listChannels(), listPolicies()]);
  console.log(`프로젝트 ${P}\n`);
  console.log(`로그 기반 지표 ${m.length}개`);
  for (const x of m) console.log(`  · ${x.name}`);
  console.log(`알림 채널 ${c.length}개`);
  for (const x of c) console.log(`  · ${x.displayName} [${x.type}] ${x.labels?.email_address || ""} — ${x.verificationStatus || "?"}`);
  console.log(`경보 정책 ${p.length}개`);
  for (const x of p) console.log(`  · ${x.displayName} ${x.enabled?.value === false ? "(꺼짐)" : ""}`);
  if (!m.length && !c.length && !p.length) {
    console.log("\n아무것도 없습니다. 차단기가 울려도 **아무도 못 받습니다.**");
    console.log("  node scripts/ops/monitoring-alerts.mjs setup --email 받을주소@example.com");
  }
}

async function cmdSetup(email) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("--email 이 필요합니다. 경보를 받을 주소를 명시하세요.");
    process.exit(1);
  }

  // ① 로그 기반 지표
  const have = new Set((await listMetrics()).map((x) => x.name));
  for (const w of WATCH) {
    if (have.has(w.metric)) { console.log(`· 지표 ${w.metric} 이미 있음`); continue; }
    await api(`${LOG}/metrics`, {
      method: "POST",
      body: JSON.stringify({
        name: w.metric,
        description: `${w.title} — ${w.why}`,
        // Cloud Functions v2 는 Cloud Run 위에서 돈다. 리소스 타입이 cloud_run_revision 인 이유다.
        filter: `resource.type="cloud_run_revision" AND jsonPayload.event="${w.event}"`,
        metricDescriptor: { metricKind: "DELTA", valueType: "INT64", unit: "1" },
      }),
    });
    console.log(`✅ 지표 생성: ${w.metric}`);
  }

  // ② 알림 채널
  let ch = (await listChannels()).find((x) => x.type === "email" && x.labels?.email_address === email);
  if (!ch) {
    ch = await api(`${MON}/notificationChannels`, {
      method: "POST",
      body: JSON.stringify({
        type: "email",
        displayName: `알찬 플랫폼 경보 (${email})`,
        description: "AAP 보상 차단기·학습기록 거부. 이 채널이 죽으면 파일럿을 열지 않는다.",
        labels: { email_address: email },
        enabled: true,
      }),
    });
    console.log(`✅ 채널 생성: ${ch.name.split("/").pop()}`);
  } else {
    console.log(`· 채널 이미 있음: ${ch.name.split("/").pop()}`);
  }

  if (ch.verificationStatus !== "VERIFIED") {
    await api(`https://monitoring.googleapis.com/v3/${ch.name}:sendVerificationCode`, { method: "POST", body: "{}" });
    console.log(`\n📮 ${email} 로 **인증 코드 메일**을 보냈습니다.`);
    console.log("   이 메일이 도착하는 것이 곧 수신 테스트입니다. 코드를 받으면:");
    console.log("   node scripts/ops/monitoring-alerts.mjs verify --code <6자리>");
    console.log("   ⚠️ 인증 전에는 경보가 이 주소로 **안 갑니다.**");
  } else {
    console.log("· 채널 인증됨 (VERIFIED)");
  }

  // ③ 경보 정책
  const havePolicy = new Set((await listPolicies()).map((x) => x.displayName));
  for (const w of WATCH) {
    if (havePolicy.has(w.title)) { console.log(`· 정책 ${w.title} 이미 있음`); continue; }
    await api(`${MON}/alertPolicies`, {
      method: "POST",
      body: JSON.stringify({
        displayName: w.title,
        documentation: { content: `${w.why}\n\n확인: Firestore \`platformAlerts\` 컬렉션 · 복구: scripts/ops/aap-switch.mjs breaker-reset <appId>`, mimeType: "text/markdown" },
        combiner: "OR",
        conditions: [{
          displayName: `${w.metric} 발생`,
          conditionThreshold: {
            filter: `metric.type="logging.googleapis.com/user/${w.metric}" AND resource.type="cloud_run_revision"`,
            comparison: "COMPARISON_GT",
            thresholdValue: 0,
            duration: "0s",
            // 한 건이라도 오르면 알린다. 차단기는 드물게 울리는 것이 정상이고,
            // 드문 신호를 평균으로 뭉개면 그 한 번을 놓친다.
            aggregations: [{ alignmentPeriod: "300s", perSeriesAligner: "ALIGN_SUM" }],
            trigger: { count: 1 },
          },
        }],
        notificationChannels: [ch.name],
        alertStrategy: { autoClose: "86400s" },
        enabled: true,
      }),
    });
    console.log(`✅ 정책 생성: ${w.title}`);
  }
  console.log("\n다음: 채널 인증을 마치면 `list` 로 VERIFIED 를 확인하세요.");
}

async function cmdVerify(code) {
  if (!code) { console.error("--code 가 필요합니다(메일로 온 6자리)."); process.exit(1); }
  const ch = (await listChannels()).find((x) => x.type === "email");
  if (!ch) { console.error("이메일 채널이 없습니다. 먼저 setup 을 실행하세요."); process.exit(1); }
  await api(`https://monitoring.googleapis.com/v3/${ch.name}:verify`, {
    method: "POST",
    body: JSON.stringify({ code: String(code).trim() }),
  });
  console.log(`✅ 인증 완료 — ${ch.labels?.email_address} 로 경보가 갑니다.`);
}

async function cmdTeardown() {
  for (const p of await listPolicies()) {
    if (!WATCH.some((w) => w.title === p.displayName)) continue;
    await api(`https://monitoring.googleapis.com/v3/${p.name}`, { method: "DELETE" });
    console.log(`🗑️ 정책 삭제: ${p.displayName}`);
  }
  for (const m of await listMetrics()) {
    if (!WATCH.some((w) => w.metric === m.name)) continue;
    await api(`${LOG}/metrics/${m.name}`, { method: "DELETE" });
    console.log(`🗑️ 지표 삭제: ${m.name}`);
  }
  console.log("채널은 남겨 둡니다(다른 정책이 쓸 수 있음). 지우려면 콘솔에서.");
}

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0];

try {
  if (cmd === "setup") await cmdSetup(flag("--email"));
  else if (cmd === "verify") await cmdVerify(flag("--code"));
  else if (cmd === "teardown") await cmdTeardown();
  else await cmdList();
} catch (e) {
  console.error(`실패: ${e.message}`);
  process.exit(1);
}
