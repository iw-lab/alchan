// src/utils/econQuiz.js — 「오늘의 경제 퀴즈」 판정(순수 함수).
// 정답 상금(2026-11-13)은 서버가 같은 규칙의 사본(functions/econQuizMath.js)으로 다시 판정해 준다 — 여기는 화면용.
// 문항은 src/data/econQuiz.json — validateBank 를 통과해야 실린다(시험이 강제).

export const TOPICS = {
  tax: "세금", interest: "이자·저축", invest: "투자", price: "물가", credit: "신용·대출",
  insurance: "보험", market: "수요와 공급", choice: "선택", work: "직업·소득", law: "법·투표",
};

/** 문항 은행 검사 → 문제 목록(빈 배열이면 통과). */
export function validateBank(bank) {
  const errs = [];
  if (!Array.isArray(bank)) return ["문항 은행이 배열이 아니다"];
  const seenQ = new Set(), seenId = new Set();
  bank.forEach((it, i) => {
    const at = `#${i}${it?.id ? `(${it.id})` : ""}`;
    if (!it || typeof it !== "object") return errs.push(`${at} 객체가 아니다`);
    if (typeof it.id !== "string" || !/^[a-z]+-\d{2,3}$/.test(it.id)) errs.push(`${at} id 형식(주제-번호)`);
    if (seenId.has(it.id)) errs.push(`${at} id 중복`);
    seenId.add(it.id);
    if (!TOPICS[it.topic]) errs.push(`${at} 모르는 주제 ${it.topic}`);
    if (typeof it.q !== "string" || it.q.trim().length < 8 || it.q.length > 120) errs.push(`${at} 질문 길이(8~120자)`);
    const key = String(it.q || "").replace(/\s+/g, "");
    if (seenQ.has(key)) errs.push(`${at} 질문 중복`);
    seenQ.add(key);
    if (!Array.isArray(it.choices) || it.choices.length !== 4) errs.push(`${at} 보기는 4개`);
    else {
      if (it.choices.some((c) => typeof c !== "string" || !c.trim() || c.length > 60)) errs.push(`${at} 보기 길이(1~60자)`);
      if (new Set(it.choices.map((c) => String(c).replace(/\s+/g, ""))).size !== 4) errs.push(`${at} 보기 중복`);
    }
    if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > 3) errs.push(`${at} 정답 위치(0~3)`);
    if (typeof it.explain !== "string" || it.explain.trim().length < 10 || it.explain.length > 200) errs.push(`${at} 해설 길이(10~200자)`);
    if (/정답은\s*\d|[①②③④]번/.test(String(it.explain))) errs.push(`${at} 해설이 보기 번호를 말한다(보기는 섞여 나온다)`);
  });
  return errs;
}

// 문자열 → 0 이상의 정수(FNV-1a). 같은 학생·같은 날이면 같은 문제.
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** 한국 시간 날짜 키(YYYY-MM-DD). */
export function dayKeyKST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 오늘의 문제 — 학생마다 다르고, 같은 날에는 같다. 금요일(주급·세금 날)에는 그 주제를 먼저.
 * 보기 순서도 학생·날짜로 섞어서 준다(옆 친구와 번호가 다르다).
 * @return {{id, topic, q, choices: string[], answerIndex: number, explain}|null}
 */
export function pickQuestion(bank, uid, dayKey) {
  if (!Array.isArray(bank) || bank.length === 0 || !uid || !dayKey) return null;
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  const prefer = dow === 5 ? bank.filter((b) => b.topic === "tax" || b.topic === "work") : [];
  const pool = prefer.length ? prefer : bank;
  const item = pool[hash(`${uid}|${dayKey}`) % pool.length];
  // 은행은 시험이 검사하지만, 깨진 항목이 와도 화면이 죽거나 틀리게 채점하지 않는다.
  if (!item || !Array.isArray(item.choices) || item.choices.length !== 4 || !Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) return null;
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = hash(`${uid}|${dayKey}|${item.id}|${i}`) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    id: item.id,
    topic: item.topic,
    q: item.q,
    choices: order.map((k) => item.choices[k]),
    answerIndex: order.indexOf(item.answer),
    explain: item.explain,
  };
}

const int = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, 100000) : 0);

/** 저장된 기록 읽기(문서에 이상한 값이 있어도 깨지지 않게). */
export function readStats(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    day: typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : null,
    lastCorrect: r.lastCorrect === true,
    total: int(r.total),
    correct: Math.min(int(r.correct), int(r.total)),
    streak: int(r.streak),
  };
}

const prevDay = (dayKey) => new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - 86400e3).toISOString().slice(0, 10);

/**
 * 오늘 답한 뒤의 기록. 하루에 한 번만 센다(같은 날 다시 부르면 그대로).
 * 연속 = 어제도 풀었으면 +1(맞고 틀리고는 상관없다 — 날마다 푸는 습관을 센다). 주말을 건너뛰면 다시 1.
 */
export function nextStats(raw, dayKey, isCorrect) {
  const s = readStats(raw);
  if (s.day === dayKey) return s;
  return {
    day: dayKey,
    lastCorrect: !!isCorrect,
    total: s.total + 1,
    correct: s.correct + (isCorrect ? 1 : 0),
    streak: s.day === prevDay(dayKey) ? s.streak + 1 : 1,
  };
}
