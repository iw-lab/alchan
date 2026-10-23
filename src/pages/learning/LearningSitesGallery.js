// src/pages/learning/LearningSitesGallery.js
// 🖼️ 학습 사이트 — 사이드바의 «학습 사이트» 를 누르면 오른쪽 본문에 뜬다(2026-10-01 사용자 요청).
//
// 2026-10-23 사용자 «첫째 선행쌤, 둘째 킹수학 — 나머지는 정리해, 과목·종류·이름 같은 거 필요없잖아, 저 안에서 분류돼 있음».
//   카드가 두 개(모음 사이트)라 검색·과목/종류 칸·즐겨찾기·자주 쓴 것을 뺐다 — 분류는 각 모음 사이트 안에서 한다.
//
// 지켜야 할 것
//   · 목록의 출처는 사이드바와 같다(레지스트리 → 폴백). 교사의 메뉴 잠금(useMenuLocks)도 같은 규칙으로 적용한다 —
//     갤러리가 잠금을 우회하면 안 된다. 교사(관리자)는 잠겨도 보인다(사이드바와 같다).
//   · 앱 열기는 사이드바와 같은 `launchLearningApp` — **클릭 핸들러 안에서 동기로** 부른다(await 로 기다리면
//     사용자 제스처를 잃어 팝업이 막힌다 — appLaunch.js 주석). 열기 전에 `recordUse` 로 사용 기록을 남긴다.
//   · 썸네일이 없거나 깨져도 카드는 깨지지 않는다(아이콘 타일로 대체).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useMenuLocks } from "../../contexts/MenuLocksContext";
import { getLearningAppItems, loadLearningAppItems, LEARNING_APPS_CHANGED } from "../../services/learningAppRegistry";
import { launchLearningApp } from "../../services/appLaunch";
import { recordUse } from "../../services/learningAppFavorites";
import { galleryInfoFor } from "../../config/learningGallery";

function Thumb({ app, info }) {
  const [broken, setBroken] = useState(false);
  const Icon = app.icon;
  if (!info?.image || broken) {
    return (
      <div className="flex items-center justify-center w-full aspect-[16/10]" style={{ background: "var(--accent-bg)" }} aria-hidden="true">
        {Icon ? <Icon className="w-10 h-10" style={{ color: "var(--accent)" }} /> : null}
      </div>
    );
  }
  return (
    <img
      src={info.image}
      alt=""
      loading="lazy"
      decoding="async"
      width="1200"
      height="750"
      onError={() => setBroken(true)}
      className="block w-full aspect-[16/10] object-cover"
      style={{ background: "var(--bg-tertiary)" }}
    />
  );
}

function AppCard({ app, onOpen }) {
  const info = galleryInfoFor(app.id);
  return (
    <button
      type="button"
      onClick={() => onOpen(app)}
      className="block w-full text-left rounded-xl overflow-hidden transition-shadow focus:outline-none focus-visible:ring-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-card)", "--tw-ring-color": "var(--accent)" }}
      aria-label={`${app.label} 열기`}
    >
      <Thumb app={app} info={info} />
      <div className="px-4 py-3">
        <div className="text-base font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{app.label}</div>
        {info?.tagline ? (
          <div className="mt-1 text-sm leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>{info.tagline}</div>
        ) : null}
      </div>
    </button>
  );
}

export default function LearningSitesGallery() {
  const { userDoc } = useAuth();
  const { lockedItemIds } = useMenuLocks();
  const isAdmin = !!(userDoc?.isAdmin || userDoc?.isSuperAdmin);
  const uid = userDoc?.id || "";

  const [items, setItems] = useState(() => getLearningAppItems());
  useEffect(() => {
    let cancelled = false;
    loadLearningAppItems().then((it) => { if (!cancelled) setItems(it); });
    const handler = () => setItems(getLearningAppItems());
    window.addEventListener(LEARNING_APPS_CHANGED, handler);
    return () => { cancelled = true; window.removeEventListener(LEARNING_APPS_CHANGED, handler); };
  }, []);

  // 교사가 잠근 앱은 학생에게 숨긴다(사이드바와 같은 규칙). 교사 본인은 전부 본다.
  const visible = useMemo(
    () => items.filter((a) => a.externalUrl && (isAdmin || !(lockedItemIds || []).includes(a.id))),
    [items, isAdmin, lockedItemIds],
  );

  const onOpen = useCallback((app) => {
    recordUse(uid, app.id);         // 열기 전에 남긴다(탭이 넘어가면 못 남긴다)
    void launchLearningApp(app);    // ⚠️ await 금지 — 사용자 제스처 안에서 동기로 탭을 연다
  }, [uid]);

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-6">
      <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>학습 사이트</h1>
      <p className="text-xs mt-1 mb-5" style={{ color: "var(--text-muted)" }}>카드를 누르면 새 탭에서 열려요</p>
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {visible.map((a) => <AppCard key={a.id} app={a} onOpen={onOpen} />)}
        </div>
      ) : (
        <p className="text-sm py-10 text-center" style={{ color: "var(--text-muted)" }}>열 수 있는 학습 사이트가 없어요.</p>
      )}
    </div>
  );
}
