import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
const app = initializeApp({ apiKey: "fake", projectId: "inconomysu-class" });
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
const [email, pw, name, data] = process.argv.slice(2);
await signInWithEmailAndPassword(auth, email, pw);
try { const r = await httpsCallable(fns, name)(data ? JSON.parse(data) : {}); console.log("OK", JSON.stringify(r.data).slice(0, 800)); }
catch (e) { console.log("ERR", e.code, e.message, JSON.stringify(e.details || null)); }
process.exit(0);
