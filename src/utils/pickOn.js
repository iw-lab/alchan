// 🎰 뽑기ON 연동 — 쿠폰 응모자 명단을 추첨 사이트로 넘긴다.
//
// 설계 원칙(개인정보):
//  · 명단은 URL 의 **해시(#) 뒤**에 싣는다. 해시는 브라우저가 서버로 전송하지 않는다 —
//    추첨 사이트의 서버 로그·리퍼러·접속 기록 어디에도 학생 이름이 남지 않는다.
//  · 추첨 사이트는 정적 페이지다(로그인·DB 없음). 받은 즉시 주소창에서도 해시를 지운다.
//  · 그래도 이름이 화면에 뜨는 건 사실이므로, 이 함수는 이름을 **가공하지 않고 그대로**
//    넘기되 호출부가 무엇을 넘기는지 알 수 있게 반환값에 목록을 함께 준다.

export const PICKON_URL = "https://iwpick.pages.dev/";

const MAX_ENTRIES = 300;
// 응모권 장수는 자르지 않는다. 여기서 100 같은 값으로 clamp 하면 많이 낸 학생의
// 당첨 확률이 아무 안내 없이 깎인다. 화면에 굴릴 구슬 개수는 추첨 사이트가
// 비율을 지키며 알아서 줄인다(그리고 줄였다고 화면에 알려 준다).
const MAX_WEIGHT = 1000000;

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 쿠폰 응모 내역(donations)을 사람 단위로 합산해 추첨용 명단을 만든다.
 * @param {Array} donations  [{ userId, userName, amount }]
 * @returns {Array} [{ name, weight }]  weight = 응모한 쿠폰 장수
 */
export function buildEntriesFromDonations(donations) {
  const byUser = new Map();
  for (const d of donations || []) {
    const amount = Number(d?.amount) || 0;
    if (amount <= 0) continue;
    // userId 로 묶는다 — 이름이 같은 학생이 둘이어도 섞이지 않는다.
    // 문자열로 정규화한다: 같은 학생의 id 가 1 과 "1" 로 섞여 들어오면
    // 서로 다른 키가 되어 한 사람이 두 명으로 갈라진다(그만큼 확률도 갈라진다).
    const key = String(d.userId ?? "") || String(d.userName ?? "");
    if (!key) continue;
    const prev = byUser.get(key);
    if (prev) {
      prev.weight += amount;
    } else {
      byUser.set(key, {
        name: String(d.userName || "이름없음").slice(0, 20),
        weight: amount,
      });
    }
  }

  const entries = [...byUser.values()]
    .map((e) => ({ ...e, weight: Math.max(1, Math.min(Math.round(e.weight), MAX_WEIGHT)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_ENTRIES);

  // 이름이 겹치면 화면에서 누가 당첨인지 구분이 안 된다 — 뒤에 번호를 붙인다
  const used = new Map();
  return entries.map((e) => {
    const n = (used.get(e.name) || 0) + 1;
    used.set(e.name, n);
    return n > 1 ? { ...e, name: `${e.name}(${n})` } : e;
  });
}

/**
 * 추첨 사이트 링크를 만든다.
 * @param {Object} opts
 * @param {Array}  opts.entries      [{name, weight}]
 * @param {string} opts.title        화면에 띄울 제목
 * @param {string} opts.mode         "race" | "survival"
 * @param {string} opts.winnerRule   "last" | "first"
 * @param {number} opts.winnerCount  당첨자 수
 */
export function buildPickOnUrl({
  entries,
  title = "",
  mode = "race",
  winnerRule = "last",
  winnerCount = 1,
}) {
  const payload = {
    t: String(title).slice(0, 60),
    n: entries.map((e) => [e.name, e.weight]),
    m: mode === "survival" ? "survival" : "race",
    w: winnerRule === "first" ? "first" : "last",
    c: Math.max(1, Math.min(Number(winnerCount) || 1, 20)),
  };
  return PICKON_URL + "#d=" + b64urlEncode(JSON.stringify(payload));
}

/**
 * 명단 → 새 탭으로 추첨 시작. 열지 못하면 ok:false 를 돌려준다(팝업 차단 등).
 * entries 를 직접 받는다 — 호출부가 확인창에 보여 준 그 명단이 그대로 전달되어야 한다
 * (여기서 다시 집계하면 확인하는 사이에 응모가 들어와 화면과 결과가 어긋난다).
 */
export function openPickOn(entries, opts = {}) {
  if (!entries?.length) return { ok: false, reason: "empty", entries };
  const url = buildPickOnUrl({ entries, ...opts });
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return { ok: !!win, reason: win ? "" : "blocked", entries, url };
}
