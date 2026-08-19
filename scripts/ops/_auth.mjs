// scripts/ops/_auth.mjs
//
// ops 스크립트 공용 — Google API 액세스 토큰 하나만 만든다.
//
// 왜 공용 모듈인가: 같은 8~10줄이 스크립트마다 복붙되면 "에러 응답을 통째로 로깅하지 않는다"
// 같은 불변식을 한 곳에서 깨도 나머지가 못 잡는다. 토큰 획득 경로는 한 곳에서만 관리한다.
//
// 자격증명 우선순위
//   1) `FIREBASE_TOKEN` 환경변수 — `firebase login:ci` 가 발급한 refresh token.
//      GitHub Actions 처럼 홈 디렉터리 설정이 없는 환경에서 쓴다.
//   2) `~/.config/configstore/firebase-tools.json` — 로컬 `firebase login` 상태.
//
// client_id/secret 은 firebase-tools 에 들어 있는 **공개 installed-app 값**이라 시크릿이 아니다.
// 실제 토큰 값은 이 저장소 어디에도 없다(런타임에 로컬 설정이나 환경변수에서만 읽는다).

import { createRequire } from "module";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let cached = null, cachedAt = 0, inFlight = null;

function refreshToken() {
  if (process.env.FIREBASE_TOKEN) return process.env.FIREBASE_TOKEN;
  const p = join(homedir(), ".config/configstore/firebase-tools.json");
  try {
    const st = JSON.parse(readFileSync(p, "utf8"));
    if (st?.tokens?.refresh_token) return st.tokens.refresh_token;
  } catch {
    /* 아래 공통 에러로 떨어진다 */
  }
  throw new Error(`자격증명 없음 — FIREBASE_TOKEN 을 주거나 'firebase login' 후 다시 실행 (${p})`);
}

function clientCreds() {
  const require = createRequire(import.meta.url);
  const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const api = require(join(gRoot, "firebase-tools/lib/api.js"));
  return { client_id: api.clientId(), client_secret: api.clientSecret() };
}

/** 45분 캐시. 동시 호출은 하나로 합친다(토큰 교환을 N번 하지 않도록). */
export async function accessToken() {
  if (cached && Date.now() - cachedAt < 45 * 60 * 1000) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { client_id, client_secret } = clientCreds();
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken(), client_id, client_secret, grant_type: "refresh_token" }),
    });
    const j = await r.json();
    // ⚠️ 응답 전체를 찍지 않는다 — 성공 응답에는 access_token 이 들어 있다.
    if (!j.access_token) throw new Error(`토큰 교환 실패: ${r.status} ${j.error || ""} ${j.error_description || ""}`.trim());
    cached = j.access_token; cachedAt = Date.now(); inFlight = null;
    return cached;
  })();
  return inFlight;
}

/** 401 을 만났을 때 캐시를 버리고 다시 받게 한다. */
export function invalidateToken() {
  cached = null; cachedAt = 0;
}
