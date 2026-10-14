// 에뮬레이터 전용 우회 — 운영 코드와 무관하다.
// firebase-tools 의 Functions 에뮬레이터는 `admin.firestore` 를 `value.bind(target)` 로 감싸 돌려준다
// (functionsEmulatorRuntime.js Proxied.getOriginal). bind 된 함수에는 정적 속성이 없어서
// `admin.firestore.FieldValue.serverTimestamp()` 가 에뮬레이터에서만 «undefined 의 serverTimestamp» 로 죽는다.
// 운영(Cloud Functions)에는 이 프록시가 없으므로 정상이다. 여기서는 bind 결과에 원본의 정적 속성을 복사한다.
const origBind = Function.prototype.bind;
Function.prototype.bind = function (...args) {
  const bound = origBind.apply(this, args);
  if (this && (this.FieldValue || this.Timestamp)) {
    for (const k of Object.getOwnPropertyNames(this)) {
      if (k in bound) continue;
      try { Object.defineProperty(bound, k, Object.getOwnPropertyDescriptor(this, k)); } catch { /* 읽기 전용 무시 */ }
    }
  }
  return bound;
};
