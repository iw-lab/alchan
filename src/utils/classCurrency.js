// 학급별 화폐 단위가 사는 자리 — 읽는 곳(CurrencyContext)과 쓰는 곳(AdminSettingsModal)이 같은 값을 쓰도록 한 곳에 둔다.
// 🔴 2026-10-02: 종전엔 전역 문서 settings/mainSettings.currencyUnit 하나를 모든 학급이 같이 썼다 —
//    다른 반 교사가 "복"으로 저장하자 심인수 클래스 아이들 화면까지 "복"이 됐다.
//    classSettings/{classCode}/settings/* 는 규칙상 «같은 학급 읽기 · 자기 학급 교사만 쓰기»라 규칙 변경이 필요 없다.
export const DEFAULT_CURRENCY_UNIT = "알찬";
export const classCurrencyPath = (classCode) => ["classSettings", classCode, "settings", "display"];
export const classCurrencyCacheKey = (classCode) => `classCurrency_${classCode}`;
// 기기 캐시도 학급을 함께 적는다. 키를 바꿔(v2) 예전 전역 값(«복»)이 남은 기기를 깨끗이 시작시킨다.
export const CURRENCY_LS_KEY = "alchan_currencyUnit_v2";
export const validClassCode = (cc) => (typeof cc === "string" && cc && cc !== "미지정" ? cc : null);
