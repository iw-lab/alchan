// src/utils/retention.js
// 신고·고소장 보관 기한 — 접수 뒤 180일. Firestore TTL 정책(policeReports·courtComplaints 의 expireAt)이 지운다.
// 실명이 섞일 수 있는 글이라 기한 없이 쌓아 두지 않는다(2026-11-14 사용자 결정 «삭제기한은 두면 되고»).
// ⚠️ 기한을 바꾸면 개인정보처리방침(src/pages/legal/PrivacyPolicy.js)의 숫자도 같이 바꾼다 — 시험이 잡는다.
export const RECORD_RETENTION_DAYS = 180;

export const recordExpireAt = (now = Date.now()) =>
  new Date(now + RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
