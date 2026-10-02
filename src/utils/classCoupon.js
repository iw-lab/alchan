// 학급별 쿠폰 가치 — 클라이언트 쪽 단일 진실원(서버는 functions/classCoupon.js, 같은 경로·같은 상한).
// 🔴 2026-10-02: 종전엔 전역 settings/mainSettings.couponValue 를 모든 학급(3학급)이 같이 써서
//    한 교사가 바꾸면 다른 반의 쿠폰 판매·기부·순자산이 함께 바뀌었다.
export const DEFAULT_COUPON_VALUE = 1000;
export const MAX_COUPON_VALUE = 1000000;
export const classCouponPath = (classCode) => ["classSettings", classCode, "settings", "coupon"];
export const classCouponCacheKey = (classCode) => `classCoupon_${classCode}`;
/** 문서 데이터 → 쿠폰 가치. 범위 밖·빈 값은 기본값(서버 couponValueFrom 과 같은 판정). */
export const couponValueFrom = (data) => {
  const v = data?.couponValue;
  return Number.isInteger(v) && v > 0 && v <= MAX_COUPON_VALUE ? v : DEFAULT_COUPON_VALUE;
};

/** 이 학급의 쿠폰 가치를 읽는다(문서가 없거나 학급이 없으면 기본값). 화면 표시·낙관적 갱신용 — 실제 현금 계산은 서버가 한다. */
export async function fetchClassCouponValue(db, classCode) {
  if (!db || !classCode || classCode === "미지정") return DEFAULT_COUPON_VALUE;
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, ...classCouponPath(classCode)));
  return couponValueFrom(snap.exists() ? snap.data() : null);
}
