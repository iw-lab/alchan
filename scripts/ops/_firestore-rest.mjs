// scripts/ops/_firestore-rest.mjs
// 🔑 운영 스크립트 공용 — firebase CLI 로그인으로 Firestore REST 를 부른다.
//
// 왜 서비스계정 키를 안 쓰나: 저장소가 PUBLIC 이고, 키 파일을 하나 만드는 순간
// "그 파일이 어디 있는지"를 관리해야 하는 물건이 하나 더 는다. `firebase login` 은
// 이미 이 기계에 있고, 만료·회수도 CLI 가 관리한다.
//
// 왜 모듈로 뺐나: 같은 20줄(전역 firebase-tools 에서 clientId/Secret 를 꺼내 refresh
// 토큰을 access 토큰으로 바꾸는 절차)이 seed-app-policies·aap-switch 에 복붙돼 있었고,
// 세 번째 스크립트를 쓰면서 네 번째 사본이 될 참이었다. 이 저장소는 복붙 다섯 줄이
// 주급 과다지급으로 돌아온 전례가 있다(functions/jobUtils.js clampMaxJobs 참고).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** .firebaserc 의 기본 프로젝트. 스크립트마다 프로젝트 id 를 적어두지 않는다. */
export const PROJECT = JSON.parse(
  readFileSync(join(ROOT, ".firebaserc"), "utf8"),
).projects.default;

/** Firestore REST 문서 루트. `(default)` = 2026-08-19 서울 이전 후의 유일한 DB. */
export const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/**
 * firebase CLI 로그인에서 access 토큰을 얻어 요청 헤더를 만든다.
 *
 * @return {Promise<{authorization: string, "content-type": string}>} 헤더
 */
export async function authHeaders() {
  const require = createRequire(import.meta.url);
  const api = require(
    join(execSync("npm root -g", { encoding: "utf8" }).trim(), "firebase-tools/lib/api.js"),
  );
  const store = JSON.parse(
    readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"),
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: store.tokens.refresh_token,
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const tk = await res.json();
  if (!tk.access_token) {
    throw new Error("토큰 갱신 실패 — `firebase login` 을 다시 하세요.");
  }
  return { authorization: `Bearer ${tk.access_token}`, "content-type": "application/json" };
}

// ── Firestore 값 래퍼. REST 는 타입을 명시해야 한다. ──
export const S = (v) => ({ stringValue: v });
export const B = (v) => ({ booleanValue: v });
export const I = (v) => ({ integerValue: String(v) });
export const A = (arr) => ({ arrayValue: { values: arr } });

/**
 * REST 문서 fields → 평범한 객체.
 *
 * ⚠️ **Admin SDK 가 주는 것과 같은 타입이어야 한다.** 운영 스크립트는 이 값을 서버와 **같은
 *    검증 함수**에 넣어 "서버가 받아 줄 문서인가"를 미리 판정한다. 타입이 어긋나면 그 판정이
 *    거짓말을 한다.
 *    실제로 그랬다: 배열 원소를 `x.stringValue ?? x.integerValue` 로 꺼내는 바람에 정수 원소가
 *    **문자열**로 나왔고, `prerequisites:[123]` 을 CLI 는 ✅ 로, 서버는 `bad_prerequisites` 로
 *    판정했다(2026-08-20 codex WARNING, 재현 확인). Admin SDK 는 int64 를 JS number 로 준다.
 *
 * 중첩 map 은 여기서 풀지 않는다(지금 쓰는 문서에 없다) — 필요해지면 그때 재귀로 넓힌다.
 */
export function plain(fields = {}) {
  const one = (v) => {
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return v.doubleValue;
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(one);
    return v;
  };
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = one(v);
  return out;
}
