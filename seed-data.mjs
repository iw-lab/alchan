#!/usr/bin/env node
// seed-data.mjs — 공모전 데모용 학생 시드 데이터 생성
// 실행: node --env-file=.env.local seed-data.mjs <admin_password>
//
// 관리자(simssijjang@gmail.com) 로그인 → classCode 가져옴
// → 학생 5명 Auth + Firestore 생성 + 샘플 거래/포트폴리오 데이터

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";

// Firebase 설정 (.env.local에서 로드)
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
const STUDENT_PASSWORD = "123456789";
const INITIAL_CASH = 100000;
const INITIAL_COUPONS = 10;

const STUDENTS = [
  { name: "김민준", studentNumber: 1 },
  { name: "이서연", studentNumber: 2 },
  { name: "박지호", studentNumber: 3 },
  { name: "최수아", studentNumber: 4 },
  { name: "정예준", studentNumber: 5 },
];

// 랜덤 거래 내역 템플릿
const TRANSACTION_TEMPLATES = [
  { description: "아르바이트 급여", amount: 2000, type: "income" },
  { description: "경찰청장 급여", amount: 4500, type: "income" },
  { description: "과자 구매", amount: -200, type: "expense" },
  { description: "자리 바꾸기 구매", amount: -500, type: "expense" },
  { description: "세금 납부", amount: -1000, type: "expense" },
  { description: "벌금 납부", amount: -500, type: "expense" },
  { description: "사탕 구매", amount: -200, type: "expense" },
  { description: "환경 미화원 급여", amount: 4000, type: "income" },
];

function log(msg) {
  console.log(`[seed] ${msg}`);
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const adminPassword = process.argv[2];
  if (!adminPassword) {
    console.error("사용법: node --env-file=.env.local seed-data.mjs <admin_password>");
    process.exit(1);
  }

  // 1. 관리자 로그인 → classCode 확인
  log("관리자 로그인...");
  const adminCred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPassword);
  const adminUid = adminCred.user.uid;
  const adminDoc = await getDoc(doc(db, "users", adminUid));
  if (!adminDoc.exists()) {
    console.error("관리자 문서를 찾을 수 없습니다.");
    process.exit(1);
  }
  const classCode = adminDoc.data().classCode;
  log(`학급 코드: ${classCode}`);

  // 기존 직업 목록 가져오기 (학생에게 배정용)
  const jobsSnap = await getDocs(query(collection(db, "jobs"), where("classCode", "==", classCode)));
  const jobIds = jobsSnap.docs.map((d) => d.id);
  log(`직업 ${jobIds.length}개 확인`);

  // 기존 주식(CentralStocks) 가져오기
  const stocksSnap = await getDocs(collection(db, "CentralStocks"));
  const stocks = stocksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  log(`주식 ${stocks.length}개 확인`);

  await signOut(auth);

  // 2. 학생 계정 생성
  const createdStudents = [];
  for (const student of STUDENTS) {
    const email = `${student.studentNumber}@${classCode.toLowerCase()}.alchan`;
    log(`학생 생성: ${student.name} (${email})`);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, STUDENT_PASSWORD);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: student.name });

      // 학생 Firestore 문서
      const cashVariation = Math.floor(Math.random() * 50000); // 0~50000 추가 보유금
      const studentCash = INITIAL_CASH + cashVariation;
      const assignedJobId = jobIds.length > 0 ? randomPick(jobIds) : null;

      await setDoc(doc(db, "users", uid), {
        name: student.name,
        nickname: student.name,
        email,
        classCode,
        studentNumber: student.studentNumber,
        isAdmin: false,
        isSuperAdmin: false,
        isTeacher: false,
        isApproved: true,
        cash: studentCash,
        coupons: INITIAL_COUPONS + Math.floor(Math.random() * 5),
        selectedJobIds: assignedJobId ? [assignedJobId] : [],
        myContribution: Math.floor(Math.random() * 3000),
        createdAt: serverTimestamp(),
      });

      createdStudents.push({ uid, ...student, email, cash: studentCash });

      // 거래 내역 5~8건
      const txCount = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < txCount; i++) {
        const template = randomPick(TRANSACTION_TEMPLATES);
        await addDoc(collection(db, "transactions"), {
          classCode,
          userId: uid,
          userName: student.name,
          description: template.description,
          amount: template.amount,
          type: template.type,
          createdAt: serverTimestamp(),
        });
      }
      log(`  → 거래 ${txCount}건 생성`);

      // 주식 포트폴리오 1~2개
      if (stocks.length > 0) {
        const portfolioCount = 1 + Math.floor(Math.random() * 2);
        const usedStockIds = new Set();
        for (let i = 0; i < portfolioCount && i < stocks.length; i++) {
          let stock;
          do {
            stock = randomPick(stocks);
          } while (usedStockIds.has(stock.id) && usedStockIds.size < stocks.length);
          usedStockIds.add(stock.id);

          const qty = 1 + Math.floor(Math.random() * 5);
          const buyPrice = stock.price || stock.currentPrice || 10000;
          await addDoc(collection(db, "users", uid, "portfolio"), {
            stockId: stock.id,
            stockName: stock.name || stock.stockName || "주식",
            quantity: qty,
            averageBuyPrice: buyPrice,
            totalInvested: buyPrice * qty,
            purchasedAt: serverTimestamp(),
          });
        }
        log(`  → 포트폴리오 ${portfolioCount}건 생성`);
      }

      await signOut(auth);
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        log(`  ⚠ 이미 존재: ${email} — 건너뜀`);
        await signOut(auth).catch(() => {});
        continue;
      }
      throw err;
    }
  }

  // 3. 학급 studentCount 업데이트
  log("학급 studentCount 업데이트...");
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPassword);
  const classRef = doc(db, "classes", classCode);
  const classDoc = await getDoc(classRef);
  if (classDoc.exists()) {
    await updateDoc(classRef, {
      studentCount: increment(createdStudents.length),
    });
  }

  // 4. 국고(treasury) 샘플 데이터
  log("국고 데이터 생성...");
  await setDoc(doc(db, "treasury", classCode), {
    classCode,
    balance: 500000,
    totalIncome: 800000,
    totalExpense: 300000,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // 국고 거래 내역
  const treasuryTxs = [
    { description: "세금 수입", amount: 500000, type: "income" },
    { description: "국고 초기 자금", amount: 300000, type: "income" },
    { description: "학급 행사 비용", amount: -200000, type: "expense" },
    { description: "우수 학생 포상", amount: -100000, type: "expense" },
  ];
  for (const tx of treasuryTxs) {
    await addDoc(collection(db, "treasuryTransactions"), {
      classCode,
      ...tx,
      createdAt: serverTimestamp(),
    });
  }
  log("  → 국고 거래 4건 생성");

  await signOut(auth);

  log("=== 시드 데이터 생성 완료 ===");
  log(`학급: ${classCode}`);
  log(`학생 ${createdStudents.length}명 생성:`);
  for (const s of createdStudents) {
    log(`  ${s.studentNumber}번 ${s.name} (${s.email}) — ${s.cash.toLocaleString()}원`);
  }
  log(`비밀번호: ${STUDENT_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] 에러:", err);
  process.exit(1);
});
