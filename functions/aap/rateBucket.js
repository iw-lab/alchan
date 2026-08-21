// functions/aap/rateBucket.js
// 🪣 token bucket **하나의 구현**. 발급·지급·학습기록이 전부 이걸 쓴다.
//
// 왜 따로 뺐나 (2026-08-21 codex 라운드)
//   같은 트랜잭션 코드가 handlers.js·reward.js 에 두 벌 있었고, 학습기록이 세 번째로
//   붙으려던 참이었다. 세 벌이 되면 "거부 시 쓰기를 건너뛴다" 같은 수정이 **한 벌에만**
//   들어가는 사고가 난다 — 이 저장소가 이미 겪은 종류다.
//
// 이 파일이 지키는 것 둘
//   ① **통을 나눈다.** 빈도가 다른 동작은 다른 문서를 쓴다. 같은 통을 쓰면 시끄러운 쪽이
//      조용한 쪽을 굶긴다 — 학습 이벤트 30건이 그 뒤의 실제 지급을 막았다(codex 재현).
//   ② **상태가 바뀔 때만 쓴다.** 거부가 이어지는 동안 새 상태는 저장값과 똑같다. 그런데도
//      매번 쓰면 차단된 요청 1건마다 쓰기 1회가 청구된다(1,000회 차단 = 1,000쓰기, codex 실측).
//      단, 저장값이 미래·손상이면 새 상태가 달라지므로 그때는 쓴다 → **치유는 살아 있다.**
const { db, admin } = require("../utils");
const R = require("./rewardRules");

const { FieldValue, Timestamp } = admin.firestore;

/** 버킷 문서는 순수 캐시다 — 지워져도 최악이 "가득 찬 상태로 시작"이라 안전하다. */
const BUCKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 버킷 하나를 소비한다. **호출부의 본 트랜잭션 밖**에서 도는 짧은 트랜잭션이다
 * (안에 두면 실패한 호출이 롤백되어 공격이 카운트되지 않는다 — 설계 2판 CRITICAL).
 *
 * @param {object} p 인자
 * @param {string} p.docId 버킷 문서 id (통을 가르는 것이 이 값이다)
 * @param {number} p.nowMs 현재 시각
 * @param {{CAPACITY: number, REFILL_MS: number}} p.limit 버킷 설정
 * @param {object} [p.extra] 문서에 같이 남길 진단용 필드(키에 이미 반영된 값들)
 * @return {Promise<boolean>} 통과하면 true
 */
function passBucket({ docId, nowMs, limit, extra = {} }) {
  const ref = db.collection("aapRateLimits").doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { allowed, next, changed } = R.consumeBucket(
      snap.exists ? snap.data() : null,
      nowMs,
      limit,
    );
    // 🔴 `changed` 가 판정이 아니라 **쓰기 필요 여부**다. allowed 로 갈음하면 안 된다 —
    //    허용인데 안 바뀌는 경우는 없지만, 거부인데 **바뀌는**(치유) 경우가 있다.
    if (changed || !snap.exists) {
      tx.set(
        ref,
        { ...next, ...extra, expireAt: Timestamp.fromMillis(nowMs + BUCKET_TTL_MS) },
        { merge: true },
      );
    }
    return allowed;
  });
}

/** 💸 지급용 통. 키 = 토큰의 `sub`(이미 학생×앱 단위라 세션 문서를 안 읽어도 된다). */
function passRewardBucket(sub, appId, nowMs) {
  return passBucket({ docId: String(sub), nowMs, limit: R.RATE_LIMIT, extra: { appId } });
}

/** 📚 학습기록용 통. 지급과 **다른 문서** — 여기가 비어도 돈은 나간다. */
function passLearningBucket(sub, appId, nowMs) {
  return passBucket({
    docId: R.bucketKeyForLearning(sub),
    nowMs,
    limit: R.LEARNING_RATE_LIMIT,
    extra: { appId },
  });
}

/** 🎫 발급용 통. 키는 uid 를 해시한다(`bucketKeyForUid` 주석 참고). */
function passIssueBucket(uid, nowMs) {
  return passBucket({
    docId: R.bucketKeyForUid(uid),
    nowMs,
    limit: R.TOKEN_RATE_LIMIT,
    extra: { updatedAt: FieldValue.serverTimestamp() },
  });
}

module.exports = {
  passBucket,
  passRewardBucket,
  passLearningBucket,
  passIssueBucket,
  BUCKET_TTL_MS,
};
