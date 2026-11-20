/* eslint-disable max-len */
// ===================================================================================
// ⚖️ 파산 처리 · 되돌리기 (2026-11-20)
//   왜: 파산 «신청»은 법정 문서 1건을 만들 뿐이고, 판결 뒤 자산을 정리하는 길이 없었다 —
//       선생님이 보내기·가져오기로 손수 맞춰야 했다.
//   규칙(사용자 결정): 현금·파킹·예적금·주식·부동산을 모두 거두고 빚(마이너스 현금·대출)을 지워 0에서 다시.
//       쿠폰은 남긴다. **선생님만** 실행한다(판사·대통령 불가).
//   안전:
//     · 대상은 사건 문서의 complainantId(생성 후 불변 — rules) 한 명. caseType 도 rules 로 잠근다.
//     · 서버가 순자산을 다시 계산해 마이너스일 때만 처리한다(신청 뒤 형편이 나아졌으면 거절).
//     · 읽기·판정·쓰기 전부 한 트랜잭션. 사건 문서의 bankruptcyProcessedAt 이 멱등 표식이다(두 번 눌러도 한 번).
//     · 처리 전 상태를 classes/{c}/bankruptcyRecords/{사건} 에 통째로 저장 → undoBankruptcy 로 되돌린다.
//     · 거둔 자산은 어디로도 가지 않는다(부동산만 정부 소유로). 국고가 늘지 않으므로 «파산시켜 돈 벌기»가 없다.
// ===================================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { checkAuthAndGetUserData, hasAdminPower, sanitizeInput, db, admin, logger } = require("./utils");
const { classCouponRef, couponValueFrom } = require("./classCoupon");
const { netAssetsOf, bankruptcyEligibility, MAX_DOCS } = require("./bankruptcyMath");

const REGION = "asia-northeast3";
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const del = () => admin.firestore.FieldValue.delete();
const increment = (n) => admin.firestore.FieldValue.increment(n);

function complaintIdOf(data) {
  const id = data && data.complaintId;
  if (typeof id !== "string" || !id || id.length > 64 || id.includes("/")) {
    throw new HttpsError("invalid-argument", "사건 번호가 올바르지 않습니다.");
  }
  return id;
}

function expireIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return admin.firestore.Timestamp.fromDate(d);
}

/**
 * 이 학생이 가진 부동산 — 트랜잭션 안에서 읽는다.
 * 정본은 `owner` 하나다(구매·제안 수락 등 서버 거래가 쓰는 유일한 필드). 옛 `ownerId` 는 거래 때 갱신되지 않아
 * 판 뒤에도 옛 주인 id 가 남을 수 있다 — 그걸로 압류하면 **남의 집**이 정부로 넘어간다(8way codex·grok CRITICAL).
 */
async function ownedProperties(tx, classCode, userId) {
  const col = db.collection("classes").doc(classCode).collection("realEstateProperties");
  const snap = await tx.get(col.where("owner", "==", userId));
  return snap.docs;
}

exports.processBankruptcy = onCall({ region: REGION }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  if (!hasAdminPower(userData)) throw new HttpsError("permission-denied", "파산 처리는 선생님만 할 수 있습니다.");
  const complaintId = complaintIdOf(request.data);

  // 다시 처리(되돌린 뒤 한 번 더)는 화면이 again:true 를 실어 보낼 때만 — 되돌리기 전에 보낸 요청이 늦게 도착해
  //   자산을 또 지우는 일을 막는다(8way codex).
  const again = request.data && request.data.again === true;

  const classRef = db.collection("classes").doc(classCode);
  const caseRef = classRef.collection("courtComplaints").doc(complaintId);
  const recordRef = classRef.collection("bankruptcyRecords").doc(complaintId);

  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      // ── 읽기(전부 쓰기보다 먼저) ──
      const caseDoc = await tx.get(caseRef);
      if (!caseDoc.exists) throw new HttpsError("not-found", "사건을 찾을 수 없습니다.");
      const c = caseDoc.data();
      if (c.caseType !== "bankruptcy") throw new HttpsError("failed-precondition", "파산 사건이 아닙니다.");
      if (c.bankruptcyProcessedAt) throw new HttpsError("already-exists", "이미 파산 처리된 사건입니다.");
      const studentId = c.complainantId;
      if (typeof studentId !== "string" || !studentId || studentId.includes("/")) throw new HttpsError("failed-precondition", "신청한 학생을 알 수 없습니다.");

      const userRef = db.collection("users").doc(studentId);
      const parkingRef = userRef.collection("financials").doc("parkingAccount");
      if (c.bankruptcyUndoneAt && !again) throw new HttpsError("failed-precondition", "한 번 되돌린 사건입니다. 다시 처리하려면 화면에서 «다시 파산 처리»를 눌러 주세요.");
      // 시세·쿠폰 가치도 같은 트랜잭션에서 읽는다 — 밖에서 읽으면 그 사이 시세가 올라 순자산이 플러스가 된 학생의 자산을 지울 수 있다(8way codex·grok·meta).
      const [userDoc, parkingDoc, productsSnap, portfolioSnap, props, mirror, couponDoc, oldRecord] = await Promise.all([
        tx.get(userRef), tx.get(parkingRef), tx.get(userRef.collection("products")), tx.get(userRef.collection("portfolio")),
        ownedProperties(tx, classCode, studentId),
        tx.get(db.collection("Settings").doc("centralStocksCache")), tx.get(classCouponRef(db, classCode)), tx.get(recordRef),
      ]);
      const stockMap = {};
      if (mirror.exists) (mirror.data().stocks || []).forEach((s) => { if (s.isListed !== false) stockMap[s.id] = Number(s.price) || 0; });
      const couponValue = couponValueFrom(couponDoc);
      if (oldRecord.exists && !oldRecord.data().undoneAt) throw new HttpsError("already-exists", "이미 파산 처리된 사건입니다.");
      if (!userDoc.exists) throw new HttpsError("not-found", "학생을 찾을 수 없습니다.");
      const u = userDoc.data();
      if (u.classCode !== classCode) throw new HttpsError("permission-denied", "같은 학급의 학생만 처리할 수 있습니다.");
      if (u.isAdmin || u.isSuperAdmin || u.isTeacher) throw new HttpsError("failed-precondition", "선생님 계정은 파산 처리할 수 없습니다.");
      if (productsSnap.size + portfolioSnap.size + props.length > MAX_DOCS) throw new HttpsError("failed-precondition", "정리할 자산 문서가 너무 많습니다. 관리자에게 알려 주세요.");

      const parking = parkingDoc.exists ? Number(parkingDoc.data().balance) || 0 : 0;
      const parts = netAssetsOf({
        cash: u.cash, coupons: u.coupons, couponValue, parking, stockMap,
        products: productsSnap.docs.map((d) => d.data()),
        portfolio: portfolioSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        properties: props.map((d) => d.data()),
      });
      const eligible = bankruptcyEligibility(u.cash, parts);
      if (!eligible.ok) throw new HttpsError("failed-precondition", eligible.reason);

      // ── 쓰기 ──
      // 1) 되돌리기용 원본(지우기 전 그대로). 되돌린 옛 기록은 덮지 않고 옆에 보관한다(감사 흔적).
      if (oldRecord.exists) tx.set(classRef.collection("bankruptcyRecords").doc(`${complaintId}__${Date.now()}`), { ...oldRecord.data(), archivedFrom: complaintId });
      tx.set(recordRef, {
        classCode, complaintId, userId: studentId, userName: u.name || "",
        processedBy: uid, processedAt: serverTimestamp(),
        net: parts,
        caseBefore: { status: c.status ?? null, judgment: c.judgment ?? null, resolvedAt: c.resolvedAt ?? null },
        before: {
          cash: u.cash,
          parking: parkingDoc.exists ? parking : null,
          products: productsSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
          portfolio: portfolioSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
          properties: props.map((d) => {
            const p = d.data();
            return { id: d.id, owner: p.owner ?? null, ownerId: p.ownerId ?? null, ownerName: p.ownerName ?? null, forSale: p.forSale === true, salePrice: p.salePrice ?? null };
          }),
        },
      });
      // 2) 현금 0 · 파킹 0 (트랜잭션 안에서 읽은 값을 기준으로 한 절대값 — 경합 시 통째로 재실행된다)
      tx.update(userRef, { cash: 0, updatedAt: serverTimestamp() });
      if (parkingDoc.exists) tx.update(parkingRef, { balance: 0, updatedAt: serverTimestamp() });
      // 3) 예적금·대출·주식 삭제
      productsSnap.docs.forEach((d) => tx.delete(d.ref));
      portfolioSnap.docs.forEach((d) => tx.delete(d.ref));
      // 4) 부동산은 정부 소유로(세입자는 그대로 — 월세는 정부로 간다)
      props.forEach((d) => {
        // seizedByBankruptcy = 이 처리가 거둔 집이라는 표식. 되돌리기는 이 표식이 그대로일 때만 돌려준다 —
        //   그 사이 다른 학생이 샀다가 그 학생의 파산으로 다시 정부에 온 집을 엉뚱한 옛 주인에게 넘기지 않는다(8way codex).
        tx.update(d.ref, { owner: "government", ownerName: "정부", forSale: false, salePrice: 0, seizedByBankruptcy: complaintId, updatedAt: serverTimestamp() });
      });
      // 5) 사건에 표식(멱등) + 판결 완료
      const casePatch = { bankruptcyProcessedAt: serverTimestamp(), bankruptcyProcessedBy: uid, bankruptcyUndoneAt: del(), status: "resolved" };
      if (!c.resolvedAt) casePatch.resolvedAt = serverTimestamp();
      if (!c.judgment) casePatch.judgment = "파산을 선고합니다. 현금·예금·주식·부동산을 모두 거두고 빚을 지워 0에서 다시 시작합니다. (쿠폰은 그대로)";
      tx.update(caseRef, casePatch);
      // 6) 기록 — 돈이 실제로 움직인 만큼만 거래내역에 남긴다
      tx.set(db.collection("activity_logs").doc(), {
        userId: studentId, userName: u.name || "", timestamp: serverTimestamp(), type: "BANKRUPTCY_PROCESSED", classCode,
        description: sanitizeInput(`${u.name || "학생"}님이 파산 처리되었습니다. 순자산 ${Math.round(parts.net).toLocaleString()}원 → 0원 (현금 ${Math.round(parts.cash).toLocaleString()} · 파킹 ${Math.round(parts.parking).toLocaleString()} · 예적금 ${Math.round(parts.depositSavings).toLocaleString()} · 주식 ${Math.round(parts.stocks).toLocaleString()} · 부동산 ${Math.round(parts.realEstate).toLocaleString()} · 대출 ${Math.round(parts.loans).toLocaleString()})`),
        metadata: { issuedBy: uid, complaintId, previousCash: u.cash, newCash: 0, net: parts.net },
        expireAt: expireIn(90),
      });
      if (u.cash !== 0) {
        tx.set(db.collection("transactions").doc(), {
          userId: studentId, amount: -u.cash, type: u.cash < 0 ? "income" : "expense", category: "bankruptcy",
          description: "파산 처리", timestamp: serverTimestamp(), metadata: { issuedBy: uid, complaintId },
        });
      }
      return { userId: studentId, userName: u.name || "", net: parts.net, products: productsSnap.size, holdings: portfolioSnap.size, properties: props.length };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`[processBankruptcy] ${uid} → ${complaintId} 실패:`, error);
    throw new HttpsError("internal", "파산 처리에 실패했습니다. 아무것도 바뀌지 않았습니다.");
  }
  return { success: true, ...result };
});

exports.undoBankruptcy = onCall({ region: REGION }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  if (!hasAdminPower(userData)) throw new HttpsError("permission-denied", "파산 되돌리기는 선생님만 할 수 있습니다.");
  const complaintId = complaintIdOf(request.data);
  const classRef = db.collection("classes").doc(classCode);
  const caseRef = classRef.collection("courtComplaints").doc(complaintId);
  const recordRef = classRef.collection("bankruptcyRecords").doc(complaintId);

  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      const [recDoc, caseDoc] = await Promise.all([tx.get(recordRef), tx.get(caseRef)]);
      if (!recDoc.exists) throw new HttpsError("not-found", "되돌릴 파산 처리 기록이 없습니다.");
      const rec = recDoc.data();
      if (rec.undoneAt) throw new HttpsError("already-exists", "이미 되돌린 처리입니다.");
      if (rec.classCode !== classCode) throw new HttpsError("permission-denied", "같은 학급의 기록만 되돌릴 수 있습니다.");
      const b = rec.before || {};
      const userRef = db.collection("users").doc(rec.userId);
      const parkingRef = userRef.collection("financials").doc("parkingAccount");
      const propCol = classRef.collection("realEstateProperties");
      const products = Array.isArray(b.products) ? b.products : [];
      const portfolio = Array.isArray(b.portfolio) ? b.portfolio : [];
      const properties = Array.isArray(b.properties) ? b.properties : [];
      const [userDoc, productDocs, holdingDocs, propDocs] = await Promise.all([
        tx.get(userRef),
        Promise.all(products.map((p) => tx.get(userRef.collection("products").doc(p.id)))),
        Promise.all(portfolio.map((p) => tx.get(userRef.collection("portfolio").doc(p.id)))),
        Promise.all(properties.map((p) => tx.get(propCol.doc(p.id)))),
      ]);
      if (!userDoc.exists) throw new HttpsError("not-found", "학생을 찾을 수 없습니다.");
      if (userDoc.data().classCode !== classCode) throw new HttpsError("permission-denied", "학생이 다른 학급으로 옮겨 되돌릴 수 없습니다.");

      // 처리 뒤에 생긴 것은 건드리지 않는다 — 그때 뺀 만큼만 «더한다»(절대값으로 덮지 않는다).
      const skipped = [];
      const cashBack = typeof b.cash === "number" && Number.isFinite(b.cash) ? b.cash : 0;
      tx.update(userRef, { cash: increment(cashBack), updatedAt: serverTimestamp() });
      if (typeof b.parking === "number" && b.parking !== 0) tx.set(parkingRef, { balance: increment(b.parking), updatedAt: serverTimestamp() }, { merge: true });
      products.forEach((p, i) => {
        if (productDocs[i].exists) skipped.push(`예적금·대출 ${p.id}`);
        else tx.set(productDocs[i].ref, p.data);
      });
      portfolio.forEach((p, i) => {
        if (!holdingDocs[i].exists) { tx.set(holdingDocs[i].ref, p.data); return; }
        // 그 뒤 같은 종목을 다시 샀으면 건너뛰지 않고 합친다(매수 코드와 같은 가중평균) — 건너뛰면 거둔 주식이 영영 사라진다(8way codex·grok).
        const cur = holdingDocs[i].data();
        const q0 = Number(cur.quantity) || 0;
        const q1 = Number(p.data && p.data.quantity) || 0;
        if (q1 <= 0) return;
        const a0 = Number(cur.averagePrice) || 0;
        const a1 = Number(p.data.averagePrice) || 0;
        tx.update(holdingDocs[i].ref, { quantity: q0 + q1, averagePrice: q0 + q1 > 0 ? (a0 * q0 + a1 * q1) / (q0 + q1) : 0 });
      });
      properties.forEach((p, i) => {
        const cur = propDocs[i].exists ? propDocs[i].data() : null;
        if (!cur || cur.owner !== "government" || cur.seizedByBankruptcy !== complaintId) { skipped.push(`부동산 ${p.id}(그 뒤 주인이 바뀜)`); return; }
        tx.update(propDocs[i].ref, { owner: p.owner || rec.userId, ownerName: p.ownerName || rec.userName || "", forSale: p.forSale === true, salePrice: p.salePrice ?? 0, seizedByBankruptcy: del(), updatedAt: serverTimestamp() });
      });
      tx.update(recordRef, { undoneAt: serverTimestamp(), undoneBy: uid, undoSkipped: skipped });
      if (caseDoc.exists) {
        // 처리가 세운 «재판완료·선고»도 처리 전으로 돌린다 — 안 그러면 되돌린 사건이 선고된 채로 남는다(8way grok).
        const cb = rec.caseBefore || {};
        tx.update(caseRef, {
          bankruptcyProcessedAt: del(), bankruptcyProcessedBy: del(), bankruptcyUndoneAt: serverTimestamp(),
          status: cb.status || "pending", judgment: cb.judgment ?? null, resolvedAt: cb.resolvedAt ?? del(),
        });
      }
      tx.set(db.collection("activity_logs").doc(), {
        userId: rec.userId, userName: rec.userName || "", timestamp: serverTimestamp(), type: "BANKRUPTCY_UNDONE", classCode,
        description: sanitizeInput(`${rec.userName || "학생"}님의 파산 처리를 되돌렸습니다. 현금 ${Math.round(cashBack).toLocaleString()}원 복원${skipped.length ? ` · 복원 못 한 것 ${skipped.length}건` : ""}`),
        metadata: { issuedBy: uid, complaintId, restoredCash: cashBack, skipped },
        expireAt: expireIn(90),
      });
      if (cashBack !== 0) {
        tx.set(db.collection("transactions").doc(), {
          userId: rec.userId, amount: cashBack, type: cashBack > 0 ? "income" : "expense", category: "bankruptcy",
          description: "파산 처리 되돌리기", timestamp: serverTimestamp(), metadata: { issuedBy: uid, complaintId },
        });
      }
      return { userName: rec.userName || "", restoredCash: cashBack, skipped };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`[undoBankruptcy] ${uid} → ${complaintId} 실패:`, error);
    throw new HttpsError("internal", "되돌리기에 실패했습니다. 아무것도 바뀌지 않았습니다.");
  }
  return { success: true, ...result };
});
