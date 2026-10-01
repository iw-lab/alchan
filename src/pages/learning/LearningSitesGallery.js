// src/pages/learning/LearningSitesGallery.js
// 🖼️ 학습 사이트 갤러리 — 사이드바의 «학습 사이트» 를 누르면 오른쪽 본문에 뜬다(2026-10-01 사용자 요청).
//
// 왜: 학습 사이트가 40개가 되어 사이드바 글자 목록만으로는 고르기 어렵다. 심티처처럼 썸네일 카드로
//     보고 고른다. 사이드바 목록은 그대로 둔다(익숙한 사람은 거기서 바로 누른다).
//
// 지켜야 할 것
//   · 목록의 출처는 사이드바와 같다(레지스트리 → 폴백). 교사의 메뉴 잠금(useMenuLocks)도 같은 규칙으로 적용한다 —
//     갤러리가 잠금을 우회하면 안 된다. 교사(관리자)는 잠겨도 보인다(사이드바와 같다).
//   · 앱 열기는 사이드바와 같은 `launchLearningApp` — **클릭 핸들러 안에서 동기로** 부른다(await 로 기다리면
//     사용자 제스처를 잃어 팝업이 막힌다 — appLaunch.js 주석). 열기 전에 `recordUse` 도 남긴다(「자주 쓴 것」 근거).
//   · 썸네일이 없거나 깨져도 카드는 깨지지 않는다(아이콘 타일로 대체).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useMenuLocks } from "../../contexts/MenuLocksContext";
import { getLearningAppItems, loadLearningAppItems, LEARNING_APPS_CHANGED } from "../../services/learningAppRegistry";
import { launchLearningApp } from "../../services/appLaunch";
import { loadFavorites, toggleFavorite, recordUse, pinnedSections } from "../../services/learningAppFavorites";
import { galleryInfoFor } from "../../config/learningGallery";

/** 검색: 이름·한 줄 소개에 들어 있으면 통과(대소문자·앞뒤 공백 무시). 빈 검색어는 전부. */
export function filterApps(apps, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return apps;
  return apps.filter((a) => {
    const info = galleryInfoFor(a.id);
    return `${a.label} ${info?.tagline || ""}`.toLowerCase().includes(q);
  });
}

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

function AppCard({ app, isFav, onOpen, onToggleFav }) {
  const info = galleryInfoFor(app.id);
  return (
    <div
      className="relative rounded-xl overflow-hidden transition-shadow"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-card)" }}
    >
      <button
        type="button"
        onClick={() => onOpen(app)}
        className="block w-full text-left focus:outline-none focus-visible:ring-2"
        style={{ "--tw-ring-color": "var(--accent)" }}
        aria-label={`${app.label} 열기`}
      >
        <Thumb app={app} info={info} />
        <div className="px-3 py-2.5">
          <div className="text-sm font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{app.label}</div>
          {info?.tagline ? (
            <div className="mt-1 text-xs leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>{info.tagline}</div>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFav(app.id); }}
        className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.9)", boxShadow: "var(--shadow-md)" }}
        aria-label={isFav ? `${app.label} 즐겨찾기 해제` : `${app.label} 즐겨찾기`}
        aria-pressed={isFav}
      >
        <Star className="w-4 h-4" style={{ color: isFav ? "#f59e0b" : "#94a3b8", fill: isFav ? "#f59e0b" : "none" }} />
      </button>
    </div>
  );
}

function Section({ title, apps, favs, onOpen, onToggleFav }) {
  if (!apps.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text-secondary)" }}>{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {apps.map((a) => (
          <AppCard key={a.id} app={a} isFav={favs.includes(a.id)} onOpen={onOpen} onToggleFav={onToggleFav} />
        ))}
      </div>
    </section>
  );
}

export default function LearningSitesGallery() {
  const { userDoc } = useAuth();
  const { lockedItemIds } = useMenuLocks();
  const isAdmin = !!(userDoc?.isAdmin || userDoc?.isSuperAdmin);
  const favUid = userDoc?.id || "";

  const [items, setItems] = useState(() => getLearningAppItems());
  useEffect(() => {
    let cancelled = false;
    loadLearningAppItems().then((it) => { if (!cancelled) setItems(it); });
    const handler = () => setItems(getLearningAppItems());
    window.addEventListener(LEARNING_APPS_CHANGED, handler);
    return () => { cancelled = true; window.removeEventListener(LEARNING_APPS_CHANGED, handler); };
  }, []);

  const [favs, setFavs] = useState([]);
  const [useTick, setUseTick] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => { setFavs(loadFavorites(favUid)); }, [favUid]);

  // 교사가 잠근 앱은 학생에게 숨긴다(사이드바와 같은 규칙). 교사 본인은 전부 본다.
  const visible = useMemo(
    () => items.filter((a) => a.externalUrl && (isAdmin || !(lockedItemIds || []).includes(a.id))),
    [items, isAdmin, lockedItemIds],
  );
  const filtered = useMemo(() => filterApps(visible, query), [visible, query]);
  const pinned = useMemo(() => {
    void useTick; void favs;      // 열 때마다·별을 바꿀 때마다 다시 센다
    return pinnedSections(favUid, visible);
  }, [favUid, visible, useTick, favs]);

  const onOpen = useCallback((app) => {
    recordUse(favUid, app.id);      // 열기 전에 남긴다(탭이 넘어가면 못 남긴다)
    setUseTick((t) => t + 1);
    void launchLearningApp(app);    // ⚠️ await 금지 — 사용자 제스처 안에서 동기로 탭을 연다
  }, [favUid]);
  const onToggleFav = useCallback((id) => setFavs(toggleFavorite(favUid, id)), [favUid]);

  const searching = query.trim().length > 0;
  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>학습 사이트</h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>카드를 누르면 새 탭에서 열려요 · {visible.length}개</p>
        </div>
        <label className="relative block w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·설명으로 찾기"
            aria-label="학습 사이트 검색"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
        </label>
      </div>

      {!searching && (
        <>
          <Section title="★ 내 즐겨찾기" apps={pinned.favorites} favs={favs} onOpen={onOpen} onToggleFav={onToggleFav} />
          <Section title="⏱ 자주 쓴 것" apps={pinned.frequent} favs={favs} onOpen={onOpen} onToggleFav={onToggleFav} />
        </>
      )}
      {filtered.length > 0 ? (
        <Section title={searching ? `검색 결과 ${filtered.length}개` : "전체"} apps={filtered} favs={favs} onOpen={onOpen} onToggleFav={onToggleFav} />
      ) : (
        <p className="text-sm py-10 text-center" style={{ color: "var(--text-muted)" }}>찾는 사이트가 없어요. 다른 말로 찾아보세요.</p>
      )}
    </div>
  );
}
