// src/components/NoRealNameNotice.js
// 자유 입력란 옆 안내 — «친구의 실제 이름·연락처를 쓰지 마세요».
// 신고·고소장은 같은 반이 함께 읽는 글이고, 내용이 «누가 무엇을 잘못했다»여서 실명이 들어가면
// 그대로 개인정보가 된다(학습지원 소프트웨어 필수기준의 최소 수집 — 2026-11-14).
// ⚠️ 안내만으로는 다 못 막는다(닉네임 칸 때 62명 중 28명이 실명을 적었다) — 사람은 목록에서 고르게 하는 것이 본체다.
import React from "react";

const NoRealNameNotice = ({ className = "" }) => (
  <p
    data-no-real-name
    className={`mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ${className}`}
  >
    ✋ 친구의 <b>실제 이름·전화번호·집 주소</b>는 쓰지 마세요. 사람은 위 목록에서 고르고, 글에는 «무슨 일이 있었는지»만 적어요.
  </p>
);

export default NoRealNameNotice;
