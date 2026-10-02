// 학급별 쿠폰 가치 — 서버의 단일 진실원.
// 🔴 2026-10-02: 종전엔 전역 settings/mainSettings.couponValue 하나를 모든 학급이 같이 썼다 —
//    한 교사가 쿠폰 가치를 바꾸면 다른 학급 학생들의 쿠폰 판매·기부·순자산 과세까지 바뀌었다.
//    이제 classSettings/{classCode}/settings/coupon 에서 학급마다 읽는다(클라이언트 src/utils/classCoupon.js 와 같은 경로).
const DEFAULT_COUPON_VALUE = 1000;
// 쿠폰 1개 = 현금이 만들어지는 비율이라 상한을 둔다(규칙도 같은 상한 — firestore.rules isValidClassCoupon).
const MAX_COUPON_VALUE = 1000000;

const classCouponPath = (classCode) => `classSettings/${classCode}/settings/coupon`;
const classCouponRef = (db, classCode) => db.doc(classCouponPath(classCode));

/** 저장된 값이 정상 범위의 정수면 그 값, 아니면 기본값. 위조·빈 문서·문자열을 현금 계산에 들이지 않는다. */
function couponValueFrom(snap) {
  const v = snap && snap.exists ? snap.data().couponValue : undefined;
  return Number.isInteger(v) && v > 0 && v <= MAX_COUPON_VALUE ? v : DEFAULT_COUPON_VALUE;
}

async function readClassCouponValue(db, classCode) {
  if (!classCode) return DEFAULT_COUPON_VALUE;
  return couponValueFrom(await classCouponRef(db, classCode).get());
}

module.exports = { DEFAULT_COUPON_VALUE, MAX_COUPON_VALUE, classCouponPath, classCouponRef, couponValueFrom, readClassCouponValue };
