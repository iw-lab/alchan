// src/pages/plaza/AlchanPlaza.js
// 🏛️ 알찬광장 — **선생님들만의 공간**.
//
// 무엇을 하는 곳인가
//   ① 건의·불편: 앱을 쓰다 막힌 것, 있었으면 하는 것을 만든 사람에게 바로 말한다.
//      다른 선생님도 읽고 공감할 수 있다 — 같은 불편은 대개 여러 반에서 동시에 난다.
//   ② 선생님 사이트: 자기가 만든 학습 사이트를 올리면, 승인 후 사이드바의 '학습 사이트'에
//      **제작자 이름으로 묶여** 등재된다(AlchanSidebar 의 선생님별 묶음).
//
// 🔒 학생은 이 화면에 못 들어온다(라우트 가드) — 그리고 **규칙으로도 막혀 있다**
//    (firestore.rules 의 plazaPosts/plazaApps 는 read 를 isAdmin() 으로 잠근다).
//    화면 가드만 있으면 devtools 로 컬렉션을 그냥 읽을 수 있다. 두 겹이 맞다.
//
// 읽기 비용
//   구독(onSnapshot) 대신 **누를 때 한 번 읽는다.** 교사 전용 화면이고 글이 실시간으로
//   쏟아지는 곳이 아니다. 이 앱은 상시 리스너를 늘리다 읽기 폭주를 여러 번 겪었다.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageSquarePlus,
  Globe,
  Heart,
  Trash2,
  Send,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import {
  fetchPlazaPosts,
  createPlazaPost,
  setPlazaPostStatus,
  deletePlazaPost,
  togglePlazaLike,
  fetchPlazaComments,
  createPlazaComment,
  deletePlazaComment,
  fetchPlazaApps,
  createPlazaApp,
  deletePlazaApp,
} from "../../firebase/db/plaza";
import { LEARNING_APP_ICONS, DEFAULT_APP_OWNER } from "../../config/learningApps";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { logger } from "../../utils/logger";

const CATEGORIES = [
  { key: "improve", label: "이렇게 바꿔주세요" },
  { key: "bug", label: "안 돼요 / 이상해요" },
  { key: "question", label: "물어볼 게 있어요" },
  { key: "share", label: "이렇게 쓰고 있어요" },
];

// 상태는 슈퍼관리자만 바꾼다(rules). 여기 목록은 표시와 셀렉트 옵션용.
const STATUSES = [
  { key: "received", label: "접수됨", bg: "#eef2ff", fg: "#4338ca" },
  { key: "reviewing", label: "검토 중", bg: "#fef3c7", fg: "#b45309" },
  { key: "planned", label: "만들 예정", bg: "#ecfdf5", fg: "#047857" },
  { key: "done", label: "반영됨", bg: "#dcfce7", fg: "#15803d" },
  { key: "hold", label: "보류", bg: "#f1f5f9", fg: "#64748b" },
];
const statusOf = (key) => STATUSES.find((s) => s.key === key) || STATUSES[0];
const categoryLabel = (key) =>
  CATEGORIES.find((c) => c.key === key)?.label || "이야기";

const APP_STATUS_LABEL = {
  pending: "승인 기다리는 중",
  approved: "사이드바에 올라감",
  rejected: "거절됨",
  unpublished: "내려감",
};

const fmtDate = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const AlchanPlaza = () => {
  const { userDoc } = useAuth();
  const myUid = userDoc?.id;
  // 🪪 규칙(firestore.rules `isMyDisplayName`)이 이 값을 내 user 문서의 name/nickname 과
  //    **대조한다.** 그래서 여기서 "선생님" 같은 폴백을 섞으면 안 된다 — 둘 다 없는 계정이
  //    글을 쓰려는 순간 규칙이 거부한다. 폴백은 **그릴 때** 한다(아래 `|| "선생님"`).
  const myName = userDoc?.name || userDoc?.nickname || "";
  const isSuperAdmin = userDoc?.isSuperAdmin === true;

  const [tab, setTab] = useState("posts");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState(false);

  const publishPlazaApp = useMemo(
    () => httpsCallable(functions, "publishPlazaApp"),
    [],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, a] = await Promise.all([fetchPlazaPosts(), fetchPlazaApps()]);
    // null = 못 읽었다. 빈 배열로 뭉개면 "글이 하나도 없네요"가 되어 사용자가
    // 조회 실패를 '아무도 안 썼다'로 읽는다.
    if (p === null || a === null) {
      toast.error("광장을 불러오지 못했어요. 잠시 후 새로고침해 주세요.");
    }
    setPosts(p || []);
    setApps(a || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          🏛️ 알찬광장
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          선생님들만 보이는 공간이에요. 불편한 점·바라는 점을 남겨 주세요.
          만든 학습 사이트도 올릴 수 있어요.
        </p>
      </header>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: "posts", label: "건의·불편", icon: MessageSquarePlus },
          { key: "apps", label: "선생님 사이트", icon: Globe },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              tab === key
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-slate-200 text-slate-500"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        <button
          onClick={reload}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-500 border border-slate-200 bg-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          새로고침
        </button>
      </div>

      {tab === "posts" ? (
        <PostsTab
          posts={posts}
          myUid={myUid}
          myName={myName}
          isSuperAdmin={isSuperAdmin}
          loading={loading}
          busy={busy}
          setBusy={setBusy}
          reload={reload}
          setPosts={setPosts}
        />
      ) : (
        <AppsTab
          apps={apps}
          myUid={myUid}
          myName={myName}
          isSuperAdmin={isSuperAdmin}
          loading={loading}
          busy={busy}
          setBusy={setBusy}
          reload={reload}
          publishPlazaApp={publishPlazaApp}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 건의·불편
// ────────────────────────────────────────────────────────────
function PostsTab({ posts, myUid, myName, isSuperAdmin, loading, busy, setBusy, reload, setPosts }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [openId, setOpenId] = useState(null);

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error("제목을 적어 주세요.");
      return;
    }
    if (busy) return; // 연타 잠금 — 같은 건의가 두 번 올라가면 답하는 쪽이 헷갈린다
    setBusy(true);
    try {
      await createPlazaPost({
        authorUid: myUid,
        authorName: myName,
        title: t.slice(0, 120),
        content: content.trim().slice(0, 4000),
        category,
      });
      setTitle("");
      setContent("");
      toast.success("올렸어요. 확인하고 답을 남길게요.");
      await reload();
    } catch (e) {
      logger.error("[plaza] 글 작성 실패:", e);
      toast.error(e?.message || "올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const onLike = async (post) => {
    const liked = (post.likedBy || []).includes(myUid);
    // 낙관적 갱신 — 공감은 즉시 반응해야 손맛이 난다. 실패하면 되돌린다.
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likedBy: liked
                ? (p.likedBy || []).filter((u) => u !== myUid)
                : [...(p.likedBy || []), myUid],
            }
          : p,
      ),
    );
    try {
      await togglePlazaLike(post.id, myUid, liked);
    } catch (e) {
      logger.warn("[plaza] 공감 실패:", e);
      toast.error("공감을 저장하지 못했어요.");
      await reload();
    }
  };

  const onStatus = async (post, status) => {
    try {
      await setPlazaPostStatus(post.id, status);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status } : p)));
    } catch (e) {
      toast.error("상태를 바꾸지 못했어요.");
    }
  };

  const onDelete = async (post) => {
    const ok = await confirmDialog("이 글을 지울까요? 되돌릴 수 없어요.", {
      confirmText: "지우기",
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePlazaPost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      toast.error("지우지 못했어요.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex gap-2 mb-3 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                category === c.key
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="한 줄로 말하면? (예: 주급 날짜를 반마다 다르게 하고 싶어요)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="어떤 상황이었는지 적어 주시면 고치기 쉬워요. (선택)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-y"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
          >
            <Send size={14} />
            {busy ? "올리는 중..." : "올리기"}
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400 px-1">불러오는 중...</p>}
      {!loading && posts.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          아직 올라온 이야기가 없어요. 첫 글을 남겨 주세요.
        </div>
      )}

      {posts.map((post) => {
        const st = statusOf(post.status);
        const liked = (post.likedBy || []).includes(myUid);
        const likeCount = (post.likedBy || []).length;
        const mine = post.authorUid === myUid;
        return (
          <article key={post.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-2 flex-wrap">
              <span
                className="px-2 py-0.5 rounded text-[11px] font-bold"
                style={{ backgroundColor: st.bg, color: st.fg }}
              >
                {st.label}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500">
                {categoryLabel(post.category)}
              </span>
              <h3 className="w-full font-semibold text-slate-800 mt-1">{post.title}</h3>
            </div>
            {post.content && (
              <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{post.content}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 flex-wrap">
              <span>{post.authorName || "선생님"}</span>
              <span>{fmtDate(post.createdAt)}</span>
              <button
                onClick={() => onLike(post)}
                className={`flex items-center gap-1 ${liked ? "text-rose-500" : "text-slate-400"}`}
              >
                <Heart size={13} fill={liked ? "currentColor" : "none"} />
                {likeCount > 0 ? likeCount : "공감"}
              </button>
              <button
                onClick={() => setOpenId(openId === post.id ? null : post.id)}
                className="text-slate-500 underline"
              >
                {openId === post.id ? "댓글 접기" : "댓글"}
              </button>
              {isSuperAdmin && (
                <select
                  value={post.status || "received"}
                  onChange={(e) => onStatus(post, e.target.value)}
                  className="ml-auto text-xs border border-slate-200 rounded px-2 py-1"
                >
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              {(mine || isSuperAdmin) && (
                <button onClick={() => onDelete(post)} className="text-slate-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {openId === post.id && (
              <Comments postId={post.id} myUid={myUid} myName={myName} isSuperAdmin={isSuperAdmin} />
            )}
          </article>
        );
      })}
    </div>
  );
}

function Comments({ postId, myUid, myName, isSuperAdmin }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setItems(await fetchPlazaComments(postId));
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await createPlazaComment(postId, {
        authorUid: myUid,
        authorName: myName,
        content: t.slice(0, 2000),
        isSuperAdmin,
      });
      setText("");
      await load();
    } catch (e) {
      toast.error("댓글을 남기지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
      {items === null && <p className="text-xs text-slate-400">댓글을 불러오는 중...</p>}
      {items?.map((c) => (
        <div key={c.id} className="text-sm flex items-start gap-2">
          <span className="text-xs text-slate-400 shrink-0 mt-0.5 flex items-center gap-1">
            {c.isOfficial && <ShieldCheck size={12} className="text-indigo-500" />}
            {c.authorName || "선생님"}
          </span>
          <span className="text-slate-600 whitespace-pre-wrap flex-1">{c.content}</span>
          {(c.authorUid === myUid || isSuperAdmin) && (
            <button
              onClick={async () => {
                await deletePlazaComment(postId, c.id);
                load();
              }}
              className="text-slate-300 hover:text-red-500 shrink-0"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={2000}
          placeholder="댓글 남기기"
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
        />
        <button
          onClick={send}
          disabled={sending}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm disabled:opacity-50"
        >
          등록
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 선생님이 만든 학습 사이트
// ────────────────────────────────────────────────────────────
function AppsTab({ apps, myUid, myName, isSuperAdmin, loading, busy, setBusy, reload, publishPlazaApp }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Globe");
  const [ownerTab, setOwnerTab] = useState("all");

  // 🧑‍🏫 제작자별 탭. 사이드바의 묶음과 **같은 기준(ownerName)** 을 쓴다 —
  //    두 화면이 다른 기준으로 묶으면 "여기선 내 사이트인데 저기선 아니네"가 된다.
  const owners = useMemo(() => {
    const set = new Set(apps.map((a) => a.ownerName || DEFAULT_APP_OWNER));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [apps]);

  const visible = useMemo(
    () =>
      ownerTab === "all"
        ? apps
        : apps.filter((a) => (a.ownerName || DEFAULT_APP_OWNER) === ownerTab),
    [apps, ownerTab],
  );

  const submit = async () => {
    const l = label.trim();
    const u = url.trim();
    if (!l) {
      toast.error("사이트 이름을 적어 주세요.");
      return;
    }
    // 🔒 https 만 받는다. 규칙(rules)과 등재 CF 와 표시 시점(normalizeLearningApps)에도
    //    같은 검사가 있다 — 여기 검사는 편의(즉시 안내)일 뿐 보안 경계가 아니다.
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      toast.error("주소가 올바르지 않아요. https:// 로 시작하는 주소를 넣어 주세요.");
      return;
    }
    if (parsed.protocol !== "https:") {
      toast.error("https:// 주소만 올릴 수 있어요.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await createPlazaApp({
        ownerUid: myUid,
        ownerName: myName,
        label: l.slice(0, 60),
        url: parsed.href,
        description: description.trim().slice(0, 300),
        icon,
      });
      setLabel("");
      setUrl("");
      setDescription("");
      toast.success("올렸어요. 확인한 뒤 사이드바에 올릴게요.");
      await reload();
    } catch (e) {
      logger.error("[plaza] 사이트 신청 실패:", e);
      toast.error(e?.message || "올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (app, action) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await publishPlazaApp({ appId: app.id, action });
      toast.success(res?.data?.message || "처리했어요.");
      await reload();
    } catch (e) {
      toast.error(e?.message || "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (app) => {
    const ok = await confirmDialog(
      app.status === "approved"
        ? "사이드바에 올라가 있는 사이트예요. 먼저 '내리기'를 한 뒤 지워 주세요."
        : "이 신청을 지울까요?",
      { confirmText: "지우기", danger: true },
    );
    if (!ok || app.status === "approved") return;
    try {
      await deletePlazaApp(app.id);
      await reload();
    } catch (e) {
      toast.error("지우지 못했어요.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">내가 만든 사이트 올리기</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="사이트 이름 (예: 낱말퍼즐)"
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          placeholder="어떤 사이트인가요? (선택)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mt-2"
        />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-slate-400">아이콘</span>
          {Object.keys(LEARNING_APP_ICONS).map((name) => {
            const Icon = LEARNING_APP_ICONS[name];
            return (
              <button
                key={name}
                onClick={() => setIcon(name)}
                title={name}
                className={`p-1.5 rounded-lg border ${
                  icon === name ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
                }`}
              >
                <Icon size={15} className="text-slate-600" />
              </button>
            );
          })}
          <button
            onClick={submit}
            disabled={busy}
            className="ml-auto px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "올리는 중..." : "올리기"}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          승인되면 왼쪽 <b>학습 사이트</b> 메뉴에 <b>선생님 이름으로 묶여</b> 나타나요.
          각 반에서 보일지 말지는 <b>관리자 설정 → 메뉴 잠금</b>에서 반마다 정할 수 있어요.
        </p>
      </div>

      {owners.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {["all", ...owners].map((o) => (
            <button
              key={o}
              onClick={() => setOwnerTab(o)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                ownerTab === o
                  ? "bg-slate-800 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-500"
              }`}
            >
              {o === "all" ? "전체" : o}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400 px-1">불러오는 중...</p>}
      {!loading && visible.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          아직 올라온 사이트가 없어요.
        </div>
      )}

      {visible.map((app) => {
        const Icon = LEARNING_APP_ICONS[app.icon] || Globe;
        const mine = app.ownerUid === myUid;
        return (
          <div key={app.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-50 shrink-0">
              <Icon size={18} className="text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{app.label}</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500">
                  {APP_STATUS_LABEL[app.status] || app.status}
                </span>
                <span className="text-xs text-slate-400">{app.ownerName || DEFAULT_APP_OWNER}</span>
              </div>
              {app.description && (
                <p className="text-sm text-slate-500 mt-1">{app.description}</p>
              )}
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-500 inline-flex items-center gap-1 mt-1 break-all"
              >
                {app.url}
                <ExternalLink size={11} />
              </a>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {isSuperAdmin && app.status !== "approved" && (
                <button
                  onClick={() => act(app, "approve")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 disabled:opacity-50"
                >
                  사이드바에 올리기
                </button>
              )}
              {isSuperAdmin && app.status === "approved" && (
                <button
                  onClick={() => act(app, "unpublish")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 disabled:opacity-50"
                >
                  내리기
                </button>
              )}
              {isSuperAdmin && app.status === "pending" && (
                <button
                  onClick={() => act(app, "reject")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 disabled:opacity-50"
                >
                  거절
                </button>
              )}
              {(mine || isSuperAdmin) && app.status !== "approved" && (
                <button
                  onClick={() => remove(app)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-500"
                >
                  지우기
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AlchanPlaza;
