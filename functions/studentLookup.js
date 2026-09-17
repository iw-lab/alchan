/**
 * 학급코드 없는 학생 로그인 — 순수 판정부 (2026-09-17).
 *
 * 무엇을 하나: 학생이 아이디만 넣었을 때 어느 학급 계정인지 후보를 좁혀 준다.
 * 로그인 자체(비밀번호 확인)는 Firebase Auth 가 그대로 한다 — 이 모듈은 비밀번호를 만지지 않는다.
 *
 * ⚠️ 이게 무엇을 여는지 분명히 해 둔다: 아이디 → 학급코드가 **미인증으로** 풀린다.
 *    2026-08-03 에 이 경로를 막았던 이유(아이디 → 학급 파악 → repairStudentLogin 으로
 *    비밀번호 덮어쓰기 → 계정 탈취)의 두 번째 고리는 그날 함께 막혀 지금은 성립하지 않는다.
 *    남는 위험은 하나다 — 비밀번호가 아이디와 같은 계정(2026-08-31 실측 47명 중 41명)은
 *    아이디만 알면 열린다. 사용자에게 수치를 제시했고 2026-09-17 판단은 "로그인 편의 먼저"였다.
 *    비밀번호 일괄 재설정이 끝나면 이 주석의 경고는 사라져도 된다.
 *
 * 그래서 이 모듈이 지키는 것은 **열거 속도**다. 아이디를 순서대로 넣어 보는 스캔은
 * 학급 명부를 통째로 뽑아 가는 짓인데, 한 아이디당·한 창당 횟수를 세어 늦춘다.
 */

/** 아이디 형식 — 이메일 로컬파트로 쓰이므로 안전한 문자만 허용한다. */
const ID_RE = /^[a-z0-9._-]{2,30}$/;

function normalizeStudentId(raw) {
  if (typeof raw !== "string") return null;
  const sid = raw.trim().toLowerCase();
  return ID_RE.test(sid) ? sid : null;
}

/**
 * 조회 한도 판정.
 * @param doc 기존 카운터 문서({windowStartMs, count}) 또는 null
 * @param nowMs 현재 시각
 * @param opts.windowMs 창 길이(기본 10분) / opts.limit 창당 허용 횟수(기본 12)
 * @returns {{allow: boolean, next: {windowStartMs, count}, retryAfterSec: number}}
 */
function decideLookupQuota(doc, nowMs, opts = {}) {
  const windowMs = opts.windowMs || 10 * 60 * 1000;
  const limit = opts.limit || 300;
  const rawStart = doc?.windowStartMs;
  const rawCount = doc?.count;
  const hasDoc = doc !== null && doc !== undefined;

  // 🔒 손상된 카운터는 **막는 쪽**으로 읽는다(2026-09-17 교차검증 지적).
  //    `Number(x) || 0` 은 "abc"·null·NaN 을 전부 0 으로 만들어, 값 하나만 망가뜨리면
  //    이미 소진한 한도가 다시 열렸다. 대신 이번 요청은 거부하고 창을 새로 깔아
  //    영구 잠김도 안 생기게 한다(다음 창은 깨끗한 값으로 시작).
  const startOk = typeof rawStart === "number" && Number.isFinite(rawStart);
  const countOk =
    rawCount === undefined ||
    (typeof rawCount === "number" && Number.isInteger(rawCount) && rawCount >= 0);
  if (hasDoc && (!startOk || !countOk)) {
    return {
      allow: false,
      next: { windowStartMs: nowMs, count: limit },
      retryAfterSec: Math.ceil(windowMs / 1000),
      reason: "corrupt",
    };
  }

  const start = startOk ? rawStart : NaN;
  const count = countOk && typeof rawCount === "number" ? rawCount : 0;
  const fresh = !Number.isFinite(start) || nowMs - start >= windowMs;
  if (fresh) {
    return { allow: true, next: { windowStartMs: nowMs, count: 1 }, retryAfterSec: 0 };
  }
  if (count >= limit) {
    return {
      allow: false,
      // 막힌 요청은 **세지 않는다** — 계속 두드리는 것만으로 창이 연장되면 안 된다.
      next: { windowStartMs: start, count },
      retryAfterSec: Math.ceil((start + windowMs - nowMs) / 1000),
      reason: "limit",
    };
  }
  return { allow: true, next: { windowStartMs: start, count: count + 1 }, retryAfterSec: 0 };
}

/**
 * 한도 키 — **호출자(IP) 기준**이 본선이다.
 *
 * 처음엔 아이디(sid)를 키로 썼는데 교차검증 3계열이 같은 구멍을 짚었다:
 *   ① 아이디를 바꿔 가며 부르면 한도가 한 번도 안 걸린다(열거를 못 막는다)
 *   ② 반대로 남의 아이디를 12번 두드려 **그 학생만** 10분간 막는 표적 방해가 된다.
 * 그래서 센다 = 호출자. 아이디 키는 쓰지 않는다.
 */
function quotaKeyForIp(ip) {
  // ⚠️ **인프라가 확정한 IP 만 쓴다.** x-forwarded-for 를 폴백으로 받으면 호출자가 헤더를
  //    바꿔 가며 버킷을 무한히 만들어 한도를 통째로 우회한다(2026-09-17 교차검증 CRITICAL).
  //    IP 를 못 얻으면 공용 버킷 하나로 묶는다 — 우회가 아니라 더 좁은 한도가 되게.
  const raw = typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
  // Firestore 문서 id 로 안전한 형태로만(., / 금지, 길이 제한). IPv6 의 : 도 치환된다.
  return `ip_${raw.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 120)}`;
}

/**
 * 이메일 접두어 범위 쿼리의 경계값. `{sid}@` 로 시작하는 문서만 집는다.
 * ( 는 Firestore 문자열 정렬의 사실상 최댓값)
 */
function emailPrefixRange(sid) {
  return { start: `${sid}@`, end: `${sid}@` };
}

/**
 * 후보 계정 선별 — 학생 계정만, 학급코드가 있는 것만.
 * 교사·관리자 계정은 학급코드 없는 로그인의 대상이 아니다(이메일이 실제 주소라 형식부터 다르다).
 */
function pickStudentCandidates(docs, { max = 3 } = {}) {
  return docs
    .filter((d) => {
      const u = d || {};
      if (!u.email || typeof u.email !== "string") return false;
      if (!u.email.endsWith(".alchan")) return false;
      if (u.isTeacher || u.isAdmin || u.isSuperAdmin) return false;
      return true;
    })
    .map((u) => u.email)
    .sort()
    .slice(0, max);
}

module.exports = {
  ID_RE,
  quotaKeyForIp,
  normalizeStudentId,
  decideLookupQuota,
  emailPrefixRange,
  pickStudentCandidates,
};
