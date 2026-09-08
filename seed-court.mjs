#!/usr/bin/env node
// seed-court.mjs — 법원 데모 시드 (Cloud Function 호출)
// 실행: node --env-file=.env.local seed-court.mjs <admin_password>

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const ADMIN_EMAIL = "simssijjang@gmail.com";
const FUNCTION_URL = "https://asia-northeast3-inconomysu-class.cloudfunctions.net/seedCourtData";

async function main() {
  const adminPassword = process.argv[2];
  if (!adminPassword) {
    console.error("사용법: node --env-file=.env.local seed-court.mjs <admin_password>");
    process.exit(1);
  }

  console.log("[seed-court] 관리자 로그인...");
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPassword);
  const idToken = await cred.user.getIdToken();

  console.log("[seed-court] seedCourtData Cloud Function 호출...");
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { classCode: "CLASS2025" } }),
  });

  const json = await res.json();
  if (json.error) {
    console.error("[seed-court] 에러:", json.error.message || json.error);
    process.exit(1);
  }
  console.log("[seed-court] 결과:", json.result?.message || JSON.stringify(json));
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-court] 에러:", err.message || err);
  process.exit(1);
});
