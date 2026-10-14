import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
const app = initializeApp({ apiKey: "fake", projectId: "inconomysu-class" });
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8080);
const [email, pw, classCode] = process.argv.slice(2);
const cred = await signInWithEmailAndPassword(auth, email, pw);
const uid = cred.user.uid;
console.log("uid", uid, "claims", JSON.stringify((await cred.user.getIdTokenResult()).claims).slice(0, 300));
const u = await getDoc(doc(db, "users", uid)); console.log("userDoc", u.exists(), JSON.stringify(u.data()).slice(0, 300));
const tries = [
  ["full", { ownerId: uid, ownerName: "x", visibility: "private", createdAt: serverTimestamp() }],
  ["min", { visibility: "private" }],
];
for (const [n, data] of tries) {
  try { await setDoc(doc(db, "classes", classCode, "personalBoards", uid), data); console.log(n, "OK"); break; }
  catch (e) { console.log(n, "FAIL", e.code, e.message.slice(0, 300)); }
}
process.exit(0);
