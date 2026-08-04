#!/usr/bin/env node
/**
 * firebase.json 의 캐시 헤더가 **의도한 대로** 적용되는지 검사한다.
 *
 * 왜 검사가 필요한가:
 *   Firebase Hosting 은 같은 헤더 키에 대해 **뒤에 오는 규칙이 이긴다.** 그래서
 *   규칙을 추가하다 보면 앞에 적어 둔 규칙이 조용히 무효가 된다 — 배포는 성공하고,
 *   빌드도 통과하고, 아무 경고도 안 난다. 실제로 이 저장소에서 두 번 일어났다:
 *     · /sw.js 의 no-cache 가 뒤의 `**​/*.@(js|css)` 에 덮여 7일 캐시됨
 *       (라이브 실측: `curl -sI .../sw.js` → public, max-age=604800)
 *     · 새 앱에서 /index.html no-cache 가 SPA rewrite 때문에 아예 안 걸림
 *
 *   JSON 은 주석을 못 담으므로 "순서를 지켜라"라고 적어 둘 데가 없다. 적어 둔들
 *   읽지 않으면 그만이다. 그래서 주석 대신 **기대값을 여기 박아 두고 CI 가 검사**한다.
 *
 * 실행: node scripts/check-hosting-headers.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));
const rules = config.hosting?.headers ?? [];

/**
 * Hosting 의 glob 을 정규식으로 옮긴다.
 *  `**` = 슬래시 포함 아무거나 / `*` = 슬래시 뺀 아무거나 / `@(a|b)` = 택일
 * 아래 EXPECTED 가 라이브 실측값이라, 이 변환이 틀리면 그 자리에서 드러난다.
 */
function toRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "@" && pattern[i + 1] === "(") {
      const end = pattern.indexOf(")", i);
      re += "(?:" + pattern.slice(i + 2, end) + ")";
      i = end;
    } else if (".+^${}()|[]\\?".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  // 패턴이 `/` 로 시작하면 경로 전체를, 아니면 어디서든 끝까지 맞아야 한다.
  return new RegExp(pattern.startsWith("/") ? `^${re}$` : `^/?${re}$`);
}

/** 마지막으로 매치되는 규칙이 이긴다 — 그 순서까지 그대로 흉내낸다. */
function resolveCacheControl(path) {
  let winner = null;
  for (const rule of rules) {
    if (!rule.source || !toRegExp(rule.source).test(path)) continue;
    const h = (rule.headers ?? []).find(
      (x) => x.key.toLowerCase() === "cache-control",
    );
    if (h) winner = { value: h.value, source: rule.source };
  }
  return winner;
}

/**
 * 기대값. 앞 4개는 **라이브에서 curl 로 직접 확인한 값**이라 이 파일의 glob 해석이
 * 맞는지 검증하는 눈금 역할도 한다. 나머지는 이번 이관에서 새로 생긴 경로다.
 */
const EXPECTED = [
  { path: "/index.html", want: /no-cache/, why: "새 배포를 즉시 받아야 한다" },
  { path: "/manifest.json", want: /no-cache/, why: "PWA 메타" },
  { path: "/sw.js", want: /no-cache/, why: "서비스워커가 오래 묵으면 갱신이 그만큼 늦는다" },
  { path: "/firebase-messaging-sw.js", want: /no-cache/, why: "같은 이유" },
  {
    path: "/assets/index-abc123.js",
    want: /immutable/,
    why: "파일명에 내용 해시가 있으니 영구 캐시가 안전 — 재방문 비용이 여기서 갈린다",
  },
  {
    path: "/assets/index-abc123.css",
    want: /immutable/,
    why: "같은 이유",
  },
  {
    path: "/avatar-shop/base_male.png",
    want: /max-age=0|no-cache/,
    why: "해시가 없는 이름이라 갱신되어야 한다",
  },
  {
    path: "/dashboard/tasks",
    want: /no-cache/,
    why: "SPA 경로 — rewrite 전에 헤더가 정해지므로 `**` 가 잡아야 한다",
  },
];

let failed = 0;
console.log("\n🌐 Hosting 캐시 헤더 검사 (뒤에 오는 규칙이 이긴다)\n");

for (const { path, want, why } of EXPECTED) {
  const got = resolveCacheControl(path);
  const value = got?.value ?? "(규칙 없음)";
  if (want.test(value)) {
    console.log(`  \x1b[32m✓\x1b[0m ${path.padEnd(32)} ${value}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${path.padEnd(32)} ${value}`);
    console.log(`      기대: ${want}  ← ${why}`);
    console.log(`      이긴 규칙: ${got?.source ?? "없음"}`);
  }
}

if (failed) {
  console.log(
    `\n\x1b[31m${failed}개 경로의 캐시 헤더가 의도와 다릅니다.\x1b[0m\n` +
      `  대개 원인은 하나다: 나중에 추가한 넓은 규칙이 앞의 좁은 규칙을 덮었다.\n` +
      `  좁은 규칙(/sw.js 처럼)을 넓은 규칙(**/*.@(js|css)) **뒤로** 옮기세요.\n`,
  );
  process.exit(1);
}
console.log("\n통과 — 모든 경로가 의도한 헤더를 받습니다\n");
