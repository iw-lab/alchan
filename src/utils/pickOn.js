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
        // 상금 지급용. 링크에는 안 실린다(buildPickOnUrl 이 name·weight 만 싣는다).
        userId: String(d.userId ?? ""),
      });
    }
  }

  const entries = [...byUser.values()]
    .map((e) => ({ ...e, weight: Math.max(1, Math.min(Math.round(e.weight), MAX_WEIGHT)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_ENTRIES);

  // 이름이 겹치면 화면에서 누가 당첨인지 구분이 안 된다 — 뒤에 번호를 붙인다.
  // ⚠️ 번호를 붙인 결과가 또 겹칠 수 있다. "민수"가 둘이고 원래 이름이 "민수(2)"인
  //    학생이 있으면 둘 다 "민수(2)"가 된다. 그러면 추첨 사이트가 두 사람을 한 사람으로
  //    합쳐 버려(같은 이름은 한 사람으로 취급한다) 확률이 달라지고 당첨자도 모호해진다.
  //    그래서 "이미 쓴 최종 이름"을 기준으로 겹치지 않을 때까지 번호를 올린다.
  const taken = new Set();
  return entries.map((e) => {
    let name = e.name;
    let n = 1;
    while (taken.has(name)) {
      n += 1;
      name = `${e.name}(${n})`;
    }
    taken.add(name);
    return name === e.name ? e : { ...e, name };
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
  ret = "",
  rid = "",
}) {
  const payload = {
    t: String(title).slice(0, 60),
    n: entries.map((e) => [e.name, e.weight]),
    m: mode === "survival" ? "survival" : "race",
    w: winnerRule === "first" ? "first" : "last",
    c: Math.max(1, Math.min(Number(winnerCount) || 1, 20)),
    // 결과를 돌려받을 주소와 이번 추첨 번호. 상금 지급을 쓸 때만 넣는다.
    ...(ret ? { r: String(ret), i: String(rid) } : {}),
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


// ── 상금 자동 지급용: 결과를 돌려받는 길 ─────────────────────────
//
// 추첨 사이트는 서버가 없으므로 결과를 서버로 보낼 수 없다. 대신 창을 연 이 페이지에
// postMessage 로 알려 준다. 그래서 이 경로에서는 noopener 를 뺀다(빼야 opener 가 산다).
//
// 안전장치는 세 겹이다.
//  ① origin 대조 — 추첨 사이트가 아닌 곳에서 온 메시지는 버린다.
//  ② rid 대조 — 이번에 연 그 추첨의 결과만 받는다(오래된 창·중복 창 차단).
//  ③ 금액은 메시지에서 읽지 않는다 — 이 페이지가 아는 값으로만 지급한다.
//     메시지가 정할 수 있는 것은 '누가 1등인가'뿐이고, 실제 이체는 서버 함수가
//     학급·잔액·멱등을 다시 검사한다.
export const PICKON_ORIGIN = new URL(PICKON_URL).origin;

// 상금에 매기는 기본 세율(%). 교사가 추첨할 때마다 바꿀 수 있고, 마지막 값이 기억된다.
export const PICKON_DEFAULT_TAX = 33;

export function newDrawId() {
  const a = new Uint8Array(9);
  window.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36)).join("").slice(0, 12);
}

/**
 * 결과를 돌려받는 방식으로 추첨을 연다.
 * @returns {{ok:boolean, reason:string, rid:string, url:string}}
 */
export function openPickOnForPrize(entries, opts = {}) {
  if (!entries?.length) return { ok: false, reason: "empty", rid: "" };
  const rid = newDrawId();
  const url = buildPickOnUrl({
    ...opts,
    entries,
    ret: window.location.origin,
    rid,
  });
  // noopener 를 빼야 추첨 사이트가 결과를 돌려줄 수 있다.
  // 여는 곳은 우리가 만든 사이트 하나뿐이고 주소도 여기서 만든다.
  const win = window.open(url, "_blank");
  return { ok: !!win, reason: win ? "" : "blocked", rid, url };
}

/**
 * 추첨 결과를 기다린다. 정리 함수를 돌려준다.
 * @param {string} rid          openPickOnForPrize 가 준 번호
 * @param {Array}  entries      보낸 명단(이름 순서가 그대로여야 한다)
 * @param {Map}    nameToUserId 이름 → 학생 uid
 * @param {Function} onWinner   ({ userId, name }) => void
 */
export function listenForPickOnResult({ rid, entries, nameToUserId, onWinner }) {
  const done = new Set(); // 이미 지급한 판
  const handler = (ev) => {
    if (ev.origin !== PICKON_ORIGIN) return;      // ① 다른 사이트 메시지는 버린다
    const d = ev.data;
    if (!d || d.type !== "iwpick:result") return;
    // ② 이번 추첨의 판인지 본다. 같은 설정으로 여러 판을 돌리면
    //    판마다 "<rid>-2", "<rid>-3" 처럼 뒤에 번호가 붙어서 온다.
    const got = String(d.rid || "");
    if (got !== rid && !got.startsWith(`${rid}-`)) return;
    if (done.has(got)) return;  // 같은 판은 한 번만 처리한다(거절한 판도 포함)
    done.add(got);
    const names = Array.isArray(d.winners) ? d.winners : [];
    const idxs = Array.isArray(d.indexes) ? d.indexes : [];
    if (!names.length) return;

    // 자리 번호를 먼저 믿는다 — 그리고 **그 엔트리의 userId 를 그대로 쓴다**.
    // ⚠️ 여기서 다시 이름으로 Map 을 조회하면 자리 번호를 믿는 의미가 없다.
    //    표시용으로 붙는 "(2)" 접미사가 다른 학생의 실제 이름과 겹치면
    //    Map 의 그 키는 나중 사람으로 덮어써져 엉뚱한 학생에게 상금이 간다.
    const i = Number(idxs[0]);
    const byIndex = Number.isInteger(i) && i >= 0 && i < entries.length ? entries[i] : null;
    const reported = String(names[0] || "");
    // 🔴 자리 번호와 이름이 서로 다르면 둘 중 하나가 어긋난 것이다 — 믿지 말고 멈춘다.
    //    (추첨 화면에서 명단을 섞거나 고치면 번호가 밀릴 수 있다. 돈이 나가는 자리라
    //     "둘 중 그럴듯한 쪽"을 고르면 안 된다.)
    if (byIndex && reported && byIndex.name !== reported) {
      // 자리와 이름이 어긋났다는 것도 알려 준다 — 안 알리면 "응답 없음"과 구분이 안 된다
      try {
        ev.source?.postMessage({ type: "iwpick:ack", rid: got, refused: true }, ev.origin);
      } catch { /* 못 알려도 거절은 유효하다 */ }
      onWinner({ userId: "", name: reported, mismatch: true, round: got });
      return;
    }
    const name = byIndex ? byIndex.name : reported;
    const userId = byIndex ? byIndex.userId || "" : nameToUserId.get(name) || "";
    // 보낸 쪽에 잘 받았다고 알린다 — 이게 없으면 뽑기ON 은 아무도 안 듣고 있어도
    // "전달했습니다"라고 표시한다(postMessage 는 수신 여부를 알려 주지 않는다).
    try {
      ev.source?.postMessage({ type: "iwpick:ack", rid: got }, ev.origin);
    } catch { /* 못 알려도 지급은 계속한다 */ }
    onWinner({ userId, name, round: got });
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
