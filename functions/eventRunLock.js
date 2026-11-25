/**
 * 🔒 같은 학급의 경제 이벤트는 한 번에 하나만 돈다 — 학급별 실행 자물쇠.
 * 이벤트는 «지금 현금·남은 보험 한도»를 읽어 계산한 뒤 배치로 반영한다. 두 개가 겹치면(선생님이 두 번 누름 ·
 * 예약 실행과 겹침) 같은 잔액·같은 한도를 두 번 써서 보험 한도가 음수가 되고 두 번 걷는다.
 * 돌다가 죽으면 자물쇠가 남으므로 함수 최대 실행시간(540초)보다 긴 10분 뒤에는 저절로 풀린다.
 * 만료 판정은 **서버가 읽은 시각**(readTime)으로 한다 — 함수 인스턴스 시계가 어긋나도 남의 자물쇠를 만료로 보지 않는다(2026-11-25 codex).
 */
const { randomUUID } = require("node:crypto");
const { db, admin, logger } = require("./utils");

const EVENT_RUN_TTL_MS = 10 * 60 * 1000;
const eventRunRef = (classCode) => db.collection("schedulerLocks").doc(`economicEventRun_${classCode}`);

/** 자물쇠 문서를 읽은 서버 시각(ms). */
const serverNowMs = (snap) => (snap.readTime && typeof snap.readTime.toMillis === "function" ? snap.readTime.toMillis() : Date.now());

/** 이 학급에서 지금 이벤트가 돌고 있는가(트랜잭션에서 읽은 자물쇠 스냅샷으로 판정). */
function isEventRunning(snap) {
  const until = snap.exists ? snap.data().until : null;
  return !!until && typeof until.toMillis === "function" && until.toMillis() > serverNowMs(snap);
}

/** @return {Promise<string|null>} 자물쇠 표식. 이미 돌고 있으면 null */
async function claimEventRun(classCode) {
  const token = randomUUID();
  const Timestamp = admin.firestore.Timestamp;
  const claimed = await db.runTransaction(async (tx) => {
    const ref = eventRunRef(classCode);
    const snap = await tx.get(ref);
    if (isEventRunning(snap)) return false;
    const nowMs = serverNowMs(snap);
    tx.set(ref, { classCode, token, startedAt: Timestamp.fromMillis(nowMs), until: Timestamp.fromMillis(nowMs + EVENT_RUN_TTL_MS) });
    return true;
  });
  return claimed ? token : null;
}

/** 내 자물쇠만 푼다(10분이 지나 남이 새로 잡았으면 건드리지 않는다). 실패해도 이벤트 결과는 그대로다. */
async function releaseEventRun(classCode, token) {
  try {
    await db.runTransaction(async (tx) => {
      const ref = eventRunRef(classCode);
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().token === token) tx.delete(ref);
    });
  } catch (error) {
    logger.warn(`[경제이벤트] ${classCode}: 실행 자물쇠 해제 실패(10분 뒤 저절로 풀림)`, error.message);
  }
}

module.exports = { claimEventRun, releaseEventRun, isEventRunning, eventRunRef, EVENT_RUN_TTL_MS };
