/**
 * 오늘의 경제 퀴즈 정답 상금(2026-11-13 사용자 «퀴즈 맞추면 상금을 소소하게라도 줘»).
 *
 * 돈의 길: 국고(승인 교사 cash) → 학생. 하루 첫 답 하나만 센다(틀려도 그날은 끝).
 * 판정은 서버가 한다 — 오늘(서버 시각 KST)·오늘의 문제(서버 사본 문항)·정답 위치를 서버가 다시 계산한다.
 * 하루 1회 자물쇠 = quizRewards/{uid}_{day} 문서(트랜잭션 안에서 없을 때만 만든다).
 *
 * ⚠️ 알고 받아들이는 위험: 정답은 해설을 바로 보여 주려고 화면 번들에 들어 있다. 개발자도구로 늘 맞힐 수 있다.
 *    그래서 상금은 «하루 1번 · 기본 1만 원(주급의 0.5%)»으로 작게 둔다. 크게 올리려면 판정을 바꿔야 한다.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, logger, checkAuthAndGetUserData, hasAdminPower, findApprovedAdminSnap } = require("./utils");
const { dayKeyKST, pickQuestion, nextStats, quizRewardAmount } = require("./econQuizMath");
const BANK = require("./data/econQuiz.json");

const claimQuizReward = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { day, questionId, choice } = request.data || {};
  if (!classCode || typeof classCode !== "string" || classCode.includes("/")) {
    throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
  }
  if (userData?.isAdmin === true || hasAdminPower(userData)) {
    throw new HttpsError("failed-precondition", "선생님 계정은 퀴즈 상금을 받지 않아요.");
  }
  if (typeof choice !== "string" || !choice || choice.length > 200) {
    throw new HttpsError("invalid-argument", "고른 답이 올바르지 않습니다.");
  }
  const today = dayKeyKST(Date.now());
  if (day !== today) {
    throw new HttpsError("failed-precondition", "날이 바뀌었어요. 화면을 새로 열면 오늘 문제가 나와요.");
  }
  const q = pickQuestion(BANK, uid, today);
  if (!q) throw new HttpsError("internal", "오늘 문제를 만들지 못했어요.");
  if (questionId !== q.id) {
    throw new HttpsError("failed-precondition", "문제가 바뀌었어요. 화면을 새로 열어 주세요.");
  }
  // 🔒 보기 «위치»가 아니라 «글»로 받는다(교차검증 codex·gemini, 2026-11-13). 문항·섞는 규칙이 바뀐 뒤 옛 화면이
  //    위치로 답하면 서버는 다른 보기로 읽어 오판정하고 하루 기회까지 태운다. 글이 오늘 보기에 없으면 기록 전에 거절.
  const picked = q.choices.indexOf(choice);
  if (picked < 0) {
    throw new HttpsError("failed-precondition", "문제가 바뀌었어요. 화면을 새로 열어 주세요.");
  }
  const correct = picked === q.answerIndex;

  const adminSnap = await findApprovedAdminSnap(classCode);
  if (adminSnap.empty) throw new HttpsError("failed-precondition", "선생님(국고) 계정을 찾을 수 없습니다.");
  const teacherId = adminSnap.docs[0].id;
  if (teacherId === uid) throw new HttpsError("failed-precondition", "선생님 계정은 퀴즈 상금을 받지 않아요.");

  const userRef = db.collection("users").doc(uid);
  const teacherRef = db.collection("users").doc(teacherId);
  const lockRef = db.collection("quizRewards").doc(`${uid}_${today}`);
  const settingsRef = db.collection("bankingSettings").doc(classCode);
  const inc = admin.firestore.FieldValue.increment;
  const sts = () => admin.firestore.FieldValue.serverTimestamp();

  try {
    let out = null;
    await db.runTransaction(async (tx) => {
      const [lock, uSnap, tSnap, sSnap] = await Promise.all([tx.get(lockRef), tx.get(userRef), tx.get(teacherRef), tx.get(settingsRef)]);
      if (lock.exists) throw new HttpsError("already-exists", "오늘 퀴즈는 이미 풀었어요. 내일 또 만나요!");
      if (!uSnap.exists) throw new HttpsError("not-found", "사용자 정보가 없습니다.");
      if (!tSnap.exists) throw new HttpsError("failed-precondition", "선생님(국고) 계정을 찾을 수 없습니다.");
      const u = uSnap.data();
      const t = tSnap.data();
      if (u.classCode !== classCode) throw new HttpsError("failed-precondition", "학급 정보가 일치하지 않습니다.");
      // 트랜잭션 안에서 읽은 최신 문서로 다시 본다(밖에서 본 뒤 관리자로 바뀌었을 수 있다 — LITE codex).
      if (u.isAdmin === true || hasAdminPower(u)) throw new HttpsError("failed-precondition", "선생님 계정은 퀴즈 상금을 받지 않아요.");
      if (t.classCode !== classCode || !hasAdminPower(t)) throw new HttpsError("failed-precondition", "유효한 국고(관리자) 계정이 아닙니다.");
      // 9e15 를 넘으면 +1만 원이 반올림으로 사라져 한쪽만 바뀐다(민팅·소각) — 정수가 정확한 범위만 받는다.
      const safe = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 9e15;
      if (!safe(u.cash)) throw new HttpsError("failed-precondition", "계정 잔액 데이터에 오류가 있습니다.");
      if (!safe(t.cash)) throw new HttpsError("failed-precondition", "국고 잔액 데이터에 오류가 있습니다.");

      const reward = correct ? quizRewardAmount(sSnap.exists ? sSnap.data() : null) : 0;
      const stats = nextStats(u.econQuiz, today, correct);

      tx.create(lockRef, { classCode, userId: uid, day: today, questionId: q.id, correct, reward, createdAt: sts() });
      tx.update(userRef, { econQuiz: stats, ...(reward > 0 ? { cash: inc(reward) } : {}), updatedAt: sts() });
      if (reward > 0) {
        tx.update(teacherRef, { cash: inc(-reward), updatedAt: sts() });
        tx.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: u.name || "사용자",
          type: "퀴즈 상금",
          description: `오늘의 경제 퀴즈 정답 상금 ${reward.toLocaleString()}원`,
          amount: reward,
          couponAmount: 0,
          metadata: { day: today, questionId: q.id, teacherId },
          timestamp: sts(),
          createdAt: sts(),
          expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 86400e3),
        });
      }
      out = { correct, reward, answerIndex: q.answerIndex, stats };
    });
    return { success: true, ...out };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`[claimQuizReward] ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "퀴즈 기록에 실패했습니다.");
  }
});

module.exports = { claimQuizReward };
