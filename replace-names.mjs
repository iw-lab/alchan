#!/usr/bin/env node
// replace-names.mjs — Firestore에서 실제 학생 이름을 데모 학생 이름으로 교체
// 실행: node --env-file=.env.local replace-names.mjs <admin_password>
// 1단계(--dry-run 기본): 실제 학생 이름 목록만 출력
// 2단계(--apply): 실제로 교체 실행

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "simssijjang@gmail.com";
const DEMO_NAMES = ["김민준", "이서연", "박지호", "최수아", "정예준"];
// 관리자 이름은 건드리지 않음
const SKIP_NAMES = new Set(["관리자", "선생님", "admin", "simssijjang", "", ...DEMO_NAMES]);

function log(msg) {
  console.log(`[replace] ${msg}`);
}

// 이름 매핑 (실제이름 → 데모이름, 랜덤 배정)
function buildNameMap(realNames) {
  const map = new Map();
  const available = [...DEMO_NAMES];
  let idx = 0;
  for (const name of realNames) {
    if (SKIP_NAMES.has(name)) continue;
    map.set(name, available[idx % available.length]);
    idx++;
  }
  return map;
}

// 컬렉션 스캔 + 이름 필드 찾기
async function scanCollection(collRef, nameFields) {
  const found = [];
  const snapshot = await getDocs(collRef);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    for (const field of nameFields) {
      const val = data[field];
      if (val && typeof val === "string" && !SKIP_NAMES.has(val)) {
        found.push({ docRef: docSnap.ref, field, currentValue: val });
      }
    }
  }
  return found;
}

// 배열 내 이름 필드 (donations 등)
async function scanArrayField(collRef, arrayField, nameField) {
  const found = [];
  const snapshot = await getDocs(collRef);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const arr = data[arrayField];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const val = arr[i]?.[nameField];
      if (val && typeof val === "string" && !SKIP_NAMES.has(val)) {
        found.push({ docRef: docSnap.ref, arrayField, index: i, nameField, currentValue: val, fullArray: arr });
      }
    }
  }
  return found;
}

async function main() {
  const adminPassword = process.argv[2];
  const applyMode = process.argv.includes("--apply");

  if (!adminPassword) {
    console.error("사용법: node --env-file=.env.local replace-names.mjs <admin_password> [--apply]");
    console.error("  기본: 이름 목록만 출력 (dry-run)");
    console.error("  --apply: 실제로 교체 실행");
    process.exit(1);
  }

  log("관리자 로그인...");
  const adminCred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPassword);
  const adminDoc = await getDoc(doc(db, "users", adminCred.user.uid));
  const classCode = adminDoc.data().classCode;
  log(`학급: ${classCode}`);

  // 모든 이름 수집
  const allFinds = [];
  const uniqueNames = new Set();

  // === 1. classes/{classCode}/nationalAssemblyLaws ===
  log("스캔: nationalAssemblyLaws...");
  const nalRef = collection(db, "classes", classCode, "nationalAssemblyLaws");
  const nalFinds = await scanCollection(nalRef, ["proposerName"]);
  allFinds.push(...nalFinds);
  nalFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 2. classes/{classCode}/policeReports ===
  log("스캔: policeReports...");
  const prRef = collection(db, "classes", classCode, "policeReports");
  const prFinds = await scanCollection(prRef, ["reporterName", "defendantName"]);
  allFinds.push(...prFinds);
  prFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 3. classes/{classCode}/courtComplaints ===
  log("스캔: courtComplaints...");
  const ccRef = collection(db, "classes", classCode, "courtComplaints");
  const ccFinds = await scanCollection(ccRef, ["complainantName", "defendantName"]);
  allFinds.push(...ccFinds);
  ccFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 4. classes/{classCode}/trialRooms ===
  log("스캔: trialRooms...");
  const trRef = collection(db, "classes", classCode, "trialRooms");
  const trSnap = await getDocs(trRef);
  const trFinds = await scanCollection(trRef, ["judgeName", "prosecutorName"]);
  allFinds.push(...trFinds);
  trFinds.forEach(f => uniqueNames.add(f.currentValue));

  // trialRooms/{roomId}/messages
  for (const trDoc of trSnap.docs) {
    const msgRef = collection(db, "classes", classCode, "trialRooms", trDoc.id, "messages");
    const msgFinds = await scanCollection(msgRef, ["userName"]);
    allFinds.push(...msgFinds);
    msgFinds.forEach(f => uniqueNames.add(f.currentValue));
  }

  // === 5. classes/{classCode}/trialResults ===
  log("스캔: trialResults...");
  const tresRef = collection(db, "classes", classCode, "trialResults");
  const tresFinds = await scanCollection(tresRef, ["judgeName"]);
  allFinds.push(...tresFinds);
  tresFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 6. classes/{classCode}/auctions ===
  log("스캔: auctions...");
  const aucRef = collection(db, "classes", classCode, "auctions");
  const aucFinds = await scanCollection(aucRef, ["seller", "sellerName", "highestBidder"]);
  allFinds.push(...aucFinds);
  aucFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 7. personalShops (classCode filter) ===
  log("스캔: personalShops...");
  const psRef = query(collection(db, "personalShops"), where("classCode", "==", classCode));
  const psFinds = await scanCollection(psRef, ["ownerName"]);
  allFinds.push(...psFinds);
  psFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 8. activity_logs (classCode filter) ===
  log("스캔: activity_logs...");
  const alRef = query(collection(db, "activity_logs"), where("classCode", "==", classCode));
  const alFinds = await scanCollection(alRef, ["userName"]);
  allFinds.push(...alFinds);
  alFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 9. transactions (classCode filter) ===
  log("스캔: transactions...");
  const txRef = query(collection(db, "transactions"), where("classCode", "==", classCode));
  const txFinds = await scanCollection(txRef, ["userName"]);
  allFinds.push(...txFinds);
  txFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 10. laws (classCode filter) ===
  log("스캔: laws...");
  const lawsRef = query(collection(db, "laws"), where("classCode", "==", classCode));
  const lawsFinds = await scanCollection(lawsRef, ["proposerName"]);
  allFinds.push(...lawsFinds);
  lawsFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 11. classes/{classCode}/learningBoards 하위 ===
  log("스캔: learningBoards...");
  const lbRef = collection(db, "classes", classCode, "learningBoards");
  const lbSnap = await getDocs(lbRef);
  for (const board of lbSnap.docs) {
    const postsRef = collection(db, "classes", classCode, "learningBoards", board.id, "posts");
    const postFinds = await scanCollection(postsRef, ["author", "authorName"]);
    allFinds.push(...postFinds);
    postFinds.forEach(f => uniqueNames.add(f.currentValue));
  }

  // === 12. groupPurchases ===
  log("스캔: groupPurchases...");
  const gpRef = query(collection(db, "groupPurchases"), where("classCode", "==", classCode));
  const gpFinds = await scanCollection(gpRef, ["creatorName"]);
  allFinds.push(...gpFinds);
  gpFinds.forEach(f => uniqueNames.add(f.currentValue));

  // === 13. donations ===
  log("스캔: donations...");
  const donRef = query(collection(db, "donations"), where("classCode", "==", classCode));
  const donFinds = await scanCollection(donRef, ["userName"]);
  allFinds.push(...donFinds);
  donFinds.forEach(f => uniqueNames.add(f.currentValue));

  // 결과 출력
  log("========================================");
  log(`발견된 고유 실제 이름: ${uniqueNames.size}개`);
  for (const name of uniqueNames) {
    log(`  - "${name}"`);
  }
  log(`총 교체 대상 필드: ${allFinds.length}개`);

  // 이름 매핑 생성
  const nameMap = buildNameMap(uniqueNames);
  log("이름 매핑:");
  for (const [real, demo] of nameMap) {
    log(`  "${real}" → "${demo}"`);
  }

  if (!applyMode) {
    log("========================================");
    log("⚠ DRY-RUN 모드입니다. 실제 교체를 하려면 --apply 플래그를 추가하세요.");
    log("  node --env-file=.env.local replace-names.mjs <password> --apply");
    await signOut(auth);
    process.exit(0);
  }

  // 실제 교체 실행
  log("========================================");
  log("교체 실행 중...");
  let updated = 0;
  let failed = 0;

  for (const find of allFinds) {
    const newName = nameMap.get(find.currentValue);
    if (!newName) continue;

    try {
      await updateDoc(find.docRef, { [find.field]: newName });
      updated++;
      if (updated % 20 === 0) log(`  진행: ${updated}/${allFinds.length}`);
    } catch (err) {
      log(`  ⚠ 실패: ${find.docRef.path}.${find.field} — ${err.message}`);
      failed++;
    }
  }

  log("========================================");
  log(`완료: ${updated}개 교체, ${failed}개 실패`);

  await signOut(auth);
  process.exit(0);
}

main().catch((err) => {
  console.error("[replace] 에러:", err);
  process.exit(1);
});
