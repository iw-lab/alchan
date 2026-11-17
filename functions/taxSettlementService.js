/**
 * 세금정산(2026-11-17 사용자 «관리자탭에 세금정산 · 사진을 찍어 넣으면 학생별로 세금·쿠폰을 자동으로»).
 *
 * 두 단계로 나눈다 — 사진을 읽는 일과 돈을 옮기는 일을 한 번에 하지 않는다.
 *   ① readTaxSheet   : 선생님이 찍은 주간 정산표 사진 → Gemini(Vertex AI)가 칸마다 글자·금액을 읽어 돌려준다.
 *                      돈은 하나도 움직이지 않는다. 사진은 저장하지 않는다(판독이 끝나면 버린다).
 *   ② applyTaxSettlement : 선생님이 화면에서 확인·고친 «학생별 합계»만 받아 옮긴다.
 *                      벌금 = 학생 → 국고(승인 교사 cash) · 세입 통계(otherTaxRevenue) · 마이너스 허용(processFine 과 같은 규칙)
 *                      상금 = 국고 → 학생(퀴즈 상금과 같은 길)
 *                      쿠폰 = 학생 쿠폰 +N
 *
 * 🔒 손글씨 판독은 틀린다. 그래서 AI 결과는 «초안»일 뿐이고, 서버는 사진에서 나온 숫자를 믿지 않는다 —
 *    ②는 선생님이 확인 버튼을 누른 숫자만 받는다(클라이언트가 보낸 합계를 범위·학급·권한으로 다시 검사).
 * 🔒 같은 정산을 두 번 넣지 않는다: 학생별 멱등키(`${key}_${uid}`) + 정산 기록(taxSettlements/{key}).
 *    같은 사진(sha256)을 다시 읽으면 ①이 «이미 넣은 사진»이라고 알려 준다.
 */
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  db, admin, logger, checkAuthAndGetUserData, hasAdminPower,
  findApprovedAdminSnap, checkIdempotent, markIdempotent, sanitizeInput,
} = require("./utils");
const { cleanSheet, validateSettlementItems, LIMITS } = require("./taxSettlementMath");

const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "inconomysu-class";
// 서울 리전엔 Gemini 가 없다(2026-11-17 실측: asia-northeast3·northeast1 모두 404) → 전역 엔드포인트.
const MODEL = process.env.TAX_SHEET_MODEL || "gemini-3.8-flash";
const DAILY_READS = 30; // 학급당 하루 판독 상한(비용·오남용 방지 — 한 장 약 1~2원)

const PROMPT = `이 사진은 초등학교 학급경제 «주간 정산표»를 찍은 것이다(사진이 옆으로 누워 있을 수 있다). 표의 왼쪽에 번호 열이 있고(그 옆 이름 열은 개인정보라 검게 칠해져 있다 — 검은 띠는 무시하라), 그 오른쪽에 요일(월·화·수·목·금)마다 «벌금·상금·쿠폰» 세 칸이 있다. 칸에는 선생님이 손글씨로 금액을 적었다.

할 일: 모든 학생 줄을 위에서 아래로 읽어, 비어 있지 않은 칸만 적어라.
- day: 월|화|수|목|금 · col: 벌금|상금|쿠폰 (칸이 경계에 걸쳐 있으면 머리글과 가장 가까운 칸)
- text: 칸에 적힌 글자를 보이는 그대로(예: "2X 10만", "5만, 10만", "100만")
- items: 그 칸의 금액을 하나씩. won = 원 단위 정수(«만»=10000, «천»=1000. 10만 → 100000, 100만 → 1000000, 5만 → 50000), times = 앞이나 위에 붙은 «2X»·«3x»·«4X» 같은 배수(없으면 1). 쉼표로 여러 개면 items 를 여러 개. 쿠폰 칸이 개수(«3개»)면 won 대신 count 에 개수.
- sure: 글씨가 확실히 읽히면 true, 조금이라도 애매하면 false.
- 학생 번호만 no 에 적는다. 이름이 보여도 절대 읽거나 적지 마라(개인정보). 번호를 못 읽으면 no 를 0 으로. 빈 줄(적힌 칸이 하나도 없는 학생)은 cells 를 빈 배열로 두고 줄은 그대로 넣는다.
- 지워진 글씨(줄 그어 지운 것)·네모 상자 표시는 text 에 «(지움)»·«(상자)»를 붙이고, 지운 것은 items 에 넣지 않는다.
추측으로 칸을 만들지 마라. JSON 만 출력한다.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          no: { type: "INTEGER" },
          cells: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                day: { type: "STRING", enum: ["월", "화", "수", "목", "금"] },
                col: { type: "STRING", enum: ["벌금", "상금", "쿠폰"] },
                text: { type: "STRING" },
                items: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { won: { type: "INTEGER" }, count: { type: "INTEGER" }, times: { type: "INTEGER" } },
                    required: ["times"],
                  },
                },
                sure: { type: "BOOLEAN" },
              },
              required: ["day", "col", "text", "items", "sure"],
            },
          },
        },
        required: ["no", "cells"],
      },
    },
  },
  required: ["rows"],
};

/** Cloud Run 메타데이터 서버에서 함수 서비스 계정 토큰을 받는다(키 파일 0). */
async function accessToken() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!r.ok) throw new Error(`토큰 발급 실패(${r.status})`);
  return (await r.json()).access_token;
}

async function askGemini(imageBase64, mimeType) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 100000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`판독 서버 ${r.status}: ${txt.slice(0, 300)}`);
    const data = JSON.parse(txt);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const out = parts.map((p) => p.text || "").join("").trim();
    return JSON.parse(out);
  } finally {
    clearTimeout(timer);
  }
}

const dayKeyKST = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

const requireTeacher = async (request) => {
  const ctx = await checkAuthAndGetUserData(request);
  if (!hasAdminPower(ctx.userData)) {
    throw new HttpsError("permission-denied", "선생님(관리자)만 세금정산을 할 수 있습니다.");
  }
  if (!ctx.classCode || typeof ctx.classCode !== "string" || ctx.classCode.includes("/")) {
    throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
  }
  return ctx;
};

const readTaxSheet = onCall({ region: "asia-northeast3", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  const { classCode } = await requireTeacher(request);
  const { image, mimeType = "image/jpeg" } = request.data || {};
  if (typeof image !== "string" || image.length < 1000) {
    throw new HttpsError("invalid-argument", "사진이 비었습니다.");
  }
  if (image.length > 8 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "사진이 너무 큽니다(8MB 이하).");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new HttpsError("invalid-argument", "JPG·PNG·WEBP 사진만 읽을 수 있습니다.");
  }
  const sheetHash = crypto.createHash("sha256").update(image).digest("hex").slice(0, 32);

  // 하루 상한 — 판독은 유료 API 라 학급마다 센다(트랜잭션으로 정확히)
  const usageRef = db.collection("taxSheetUsage").doc(`${classCode}_${dayKeyKST(Date.now())}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(usageRef);
    const n = s.exists ? Number(s.data().count) || 0 : 0;
    if (n >= DAILY_READS) {
      throw new HttpsError("resource-exhausted", `오늘은 사진 판독을 ${DAILY_READS}번 했어요. 내일 다시 해 주세요.`);
    }
    tx.set(usageRef, {
      classCode, count: n + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 86400e3),
    }, { merge: true });
  });

  let raw;
  try {
    raw = await askGemini(image, mimeType);
  } catch (e) {
    logger.error(`[readTaxSheet] ${classCode} 판독 실패`, e);
    throw new HttpsError("unavailable", "사진을 읽지 못했어요. 표가 화면에 꽉 차게, 밝은 곳에서 다시 찍어 주세요.");
  }
  const rows = cleanSheet(raw);
  if (!rows.length) {
    throw new HttpsError("failed-precondition", "표에서 학생 줄을 찾지 못했어요. 표 전체가 나오게 다시 찍어 주세요.");
  }
  // 같은 사진을 이미 넣었나(사진 바이트가 같을 때만 — 다시 찍으면 다른 사진이다)
  const prev = await db.collection("taxSettlements")
    .where("classCode", "==", classCode).where("sheetHash", "==", sheetHash).limit(1).get();   // 기록은 학생 트랜잭션 안에서 쌓인다 — 일부만 넣었어도 남는다
  const applied = prev.empty ? null : {
    at: prev.docs[0].data().createdAt?.toMillis?.() || null,
    label: prev.docs[0].data().label || "",
  };
  return { rows, sheetHash, model: MODEL, applied };
});

const applyTaxSettlement = onCall({ region: "asia-northeast3", timeoutSeconds: 300 }, async (request) => {
  const { uid, classCode, userData } = await requireTeacher(request);
  const { items, idempotencyKey, label = "", sheetHash = "" } = request.data || {};
  const problem = validateSettlementItems(items);
  if (problem) throw new HttpsError("invalid-argument", problem);
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) {
    throw new HttpsError("invalid-argument", "요청 번호가 올바르지 않습니다.");
  }
  const safeLabel = sanitizeInput(String(label || "").slice(0, 40)) || "세금정산";
  const safeHash = /^[0-9a-f]{32}$/.test(String(sheetHash)) ? String(sheetHash) : "";

  const adminSnap = await findApprovedAdminSnap(classCode);
  if (adminSnap.empty) throw new HttpsError("failed-precondition", "국고(승인된 선생님) 계정을 찾을 수 없습니다.");
  const treasuryUserId = adminSnap.docs[0].id;
  const treasuryUserRef = db.collection("users").doc(treasuryUserId);
  const statsRef = db.collection("nationalTreasuries").doc(classCode);
  // 정산 기록은 학급별 문서(다른 학급이 같은 키를 써도 섞이지 않게 — 8way codex·gemini)이고, 학생 트랜잭션 안에서 함께 쌓는다:
  //   돈과 기록이 한 번에 커밋되므로 중간에 끊겨도 «돈은 갔는데 기록엔 없음»이 생기지 않는다(8way 3계열).
  const recRef = db.collection("taxSettlements").doc(`${classCode}_${idempotencyKey}`);
  const inc = admin.firestore.FieldValue.increment;
  const sts = () => admin.firestore.FieldValue.serverTimestamp();
  const expire90 = () => admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 86400e3);

  const done = []; const skipped = []; const failures = [];
  let fineSum = 0; let prizeSum = 0; let couponSum = 0;
  for (const it of items) {
    const { userId, fine, prize, coupon } = it;
    if (userId === treasuryUserId || userId === uid) { skipped.push({ userId, reason: "선생님 계정" }); continue; }
    try {
      const r = await db.runTransaction(async (tx) => {
        const keyRef = await checkIdempotent(tx, `${idempotencyKey}_${userId}`);
        const userRef = db.collection("users").doc(userId);
        const [uSnap, tSnap, recSnap] = await Promise.all([tx.get(userRef), tx.get(treasuryUserRef), tx.get(recRef)]);
        if (recSnap.exists && recSnap.data().classCode !== classCode) throw new HttpsError("permission-denied", "정산 기록이 다른 학급 것입니다.");
        if (!uSnap.exists) throw new HttpsError("not-found", "학생을 찾을 수 없습니다.");
        if (!tSnap.exists) throw new HttpsError("failed-precondition", "국고 계정을 찾을 수 없습니다.");
        const u = uSnap.data(); const t = tSnap.data();
        if (u.classCode !== classCode) throw new HttpsError("permission-denied", "다른 학급 학생입니다.");
        if (hasAdminPower(u) || u.isAdmin === true) throw new HttpsError("failed-precondition", "선생님 계정에는 넣지 않습니다.");
        if (t.classCode !== classCode || !hasAdminPower(t)) throw new HttpsError("failed-precondition", "유효한 국고 계정이 아닙니다.");
        // 정수가 정확한 범위만(9e15 넘으면 +1만 원이 반올림으로 사라져 한쪽만 바뀐다 — 민팅·소각)
        const safe = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 9e15;
        if (!safe(u.cash)) throw new HttpsError("failed-precondition", "학생 잔액 데이터에 오류가 있습니다.");
        if (!safe(t.cash)) throw new HttpsError("failed-precondition", "국고 잔액 데이터에 오류가 있습니다.");
        const coupons0 = u.coupons == null ? 0 : u.coupons;
        if (coupon > 0 && !safe(coupons0)) throw new HttpsError("failed-precondition", "학생 쿠폰 데이터에 오류가 있습니다.");

        const net = prize - fine; // 학생 현금 변화(벌금은 마이너스 허용 — 벌금은 빈털터리라고 피할 수 없다)
        const upd = { updatedAt: sts() };
        if (net !== 0) upd.cash = inc(net);
        if (coupon > 0) upd.coupons = inc(coupon);
        tx.update(userRef, upd);
        if (net !== 0) tx.update(treasuryUserRef, { cash: inc(-net), updatedAt: sts() });
        if (fine > 0) tx.set(statsRef, { otherTaxRevenue: inc(fine), lastUpdated: sts() }, { merge: true });

        // 원장 = activity_logs 하나(최상위 amount·couponAmount — 거래내역 화면이 읽는 곳). 다른 원장엔 안 쓴다(두 줄 방지).
        const meta = { settlementId: idempotencyKey, label: safeLabel, issuedBy: uid, issuedByName: userData.name || "", treasuryUserId };
        const log = (type, description, amount, couponAmount) => tx.set(db.collection("activity_logs").doc(), {
          classCode, userId, userName: u.name || "학생", type, description: sanitizeInput(description),
          amount, couponAmount, metadata: meta, timestamp: sts(), createdAt: sts(), expireAt: expire90(),
        });
        if (fine > 0) log("벌금 납부", `${safeLabel} 벌금 ${fine.toLocaleString()}원`, -fine, 0);
        if (prize > 0) log("상금", `${safeLabel} 상금 ${prize.toLocaleString()}원`, prize, 0);
        if (coupon > 0) log("쿠폰 획득", `${safeLabel} 쿠폰 ${coupon}개`, 0, coupon);
        tx.set(recRef, {
          classCode, label: safeLabel, sheetHash: safeHash, issuedBy: uid,
          fine: inc(fine), prize: inc(prize), coupon: inc(coupon), students: inc(1),
          ...(recSnap.exists ? {} : { createdAt: sts() }), updatedAt: sts(),
        }, { merge: true });
        markIdempotent(tx, keyRef, 24 * 30);
        return { newCash: u.cash + net };
      });
      done.push({ userId, fine, prize, coupon, newCash: r.newCash });
      fineSum += fine; prizeSum += prize; couponSum += coupon;
    } catch (e) {
      if (e instanceof HttpsError && e.code === "already-exists") { skipped.push({ userId, reason: "이미 넣음" }); continue; }
      logger.error(`[applyTaxSettlement] ${uid} → ${userId}`, e);
      failures.push({ userId, reason: e.message || "처리 실패" });
    }
  }

  return {
    count: done.length, fineSum, prizeSum, couponSum,
    negative: done.filter((d) => d.newCash < 0).map((d) => d.userId),
    skipped, failures,
  };
});

module.exports = { readTaxSheet, applyTaxSettlement, LIMITS };
