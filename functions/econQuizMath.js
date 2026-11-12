/**
 * 오늘의 경제 퀴즈 — 서버 판정(순수 함수). 화면 사본 = src/utils/econQuiz.js (같은 해시·같은 순서).
 * 문항 = functions/data/econQuiz.json (src/data/econQuiz.json 과 바이트가 같아야 한다 — 시험이 지킨다).
 * 상금은 여기서 정하지 않는다: quizRewardAmount 가 학급 설정을 0~30,000 정수로 다듬기만 한다.
 */
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

function dayKeyKST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}


function pickQuestion(bank, uid, dayKey) {
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
function readStats(raw) {
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
function nextStats(raw, dayKey, isCorrect) {
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

const DEFAULT_REWARD = 10000;
// 상한 3만 원 — 정답이 화면에 있어 늘 맞힐 수 있으므로 주 최대(7회) 21만 원 ≈ 주급의 10% 안쪽으로 묶는다(교차검증 codex).
const MAX_REWARD = 30000;
/** 학급 설정 → 정답 상금(원). 없으면 기본 10,000, 이상한 값은 0~30,000 정수로. */
function quizRewardAmount(bankingData) {
  const raw = bankingData && bankingData.quizReward ? bankingData.quizReward.amount : undefined;
  if (raw === undefined || raw === null) return DEFAULT_REWARD;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_REWARD, Math.floor(raw)));
}

module.exports = { dayKeyKST, pickQuestion, readStats, nextStats, quizRewardAmount, DEFAULT_REWARD, MAX_REWARD };
