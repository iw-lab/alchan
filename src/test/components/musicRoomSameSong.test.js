// 2026-11-25 — 같은 노래가 연달아 신청되면 두 번째 곡이 재생되지 않고 멈췄다.
// 원인: 재생 효과가 «영상 주소»가 바뀔 때만 돌았다. 다음 곡의 주소가 같으면 아무 일도 안 일어난다.
// 재생은 «곡(신청 건)»이 바뀔 때마다 시작해야 하고, 재생 중에 새 신청이 들어온 것만으로 처음부터 다시 틀면 안 된다.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ snap: null, yt: null, player: null, deleted: [] }));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...a) => a.slice(1).join("/"),
  collection: (...a) => a.slice(1).join("/"),
  query: (x) => x,
  orderBy: () => null,
  getDoc: async (p) => ({ exists: () => true, id: "room1", data: () => (String(p).startsWith("users") ? { isAdmin: true } : { name: "음악방", teacherId: "t1" }) }),
  getDocs: async () => ({ docs: [] }),
  deleteDoc: async (p) => { h.deleted.push(p); },
  onSnapshot: (_q, cb) => { h.snap = cb; return () => {}; },
}));
vi.mock("react-youtube", () => ({ default: (props) => { h.yt = props; return <div data-testid="yt">{props.videoId}</div>; } }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ roomId: "room1" }), useNavigate: () => () => {} }));
vi.mock("../../components/AlchanLayout", () => ({ AlchanLoading: () => <div>불러오는 중</div> }));
vi.mock("../../hooks/usePolling", () => ({ usePolling: (fn) => { const first = React.useRef(fn); React.useEffect(() => { first.current(); }, []); return { refetch: () => {} }; } }));
vi.mock("../../hooks/usePageCss", () => ({ usePageCss: () => {} }));
vi.mock("../../MusicRoom.css?inline", () => ({ default: "" }));

import MusicRoom from "../../pages/music/MusicRoom";

const song = (id, videoId, more) => ({ id, data: () => ({ videoId, title: id, requesterName: "학생", ...more }) });
const show = (...docs) => act(async () => { h.snap({ docs }); });
const V = "jNQXAC9IVRw", W = "dQw4w9WgXcQ";

async function open(...docs) {
  h.player = { loadVideoById: vi.fn(), playVideo: vi.fn() };
  render(<MusicRoom user={{ uid: "t1" }} />);
  await act(async () => {});
  await show(...docs);
  await act(async () => { h.yt.onReady({ target: h.player }); });
  h.player.loadVideoById.mockClear(); h.player.playVideo.mockClear();
}

describe("음악방 — 같은 노래 연속 자동재생", () => {
  beforeEach(() => { h.snap = null; h.yt = null; h.deleted = []; });

  it("곡이 끝나고 다음 곡이 같은 영상이면 처음부터 다시 재생한다", async () => {
    await open(song("a", V), song("b", V));
    await act(async () => { h.yt.onStateChange({ data: 0 }); });
    expect(h.deleted).toEqual(["musicRooms/room1/playlist/a"]);
    await show(song("b", V));
    expect(h.player.loadVideoById).toHaveBeenCalledWith(V);
    expect(h.player.playVideo).toHaveBeenCalled();
  });

  it("세 번 연달아도 매번 재생한다", async () => {
    await open(song("a", V), song("b", V), song("c", V));
    await show(song("b", V), song("c", V));
    await show(song("c", V));
    expect(h.player.loadVideoById).toHaveBeenCalledTimes(2);
  });

  it("재생 중에 새 신청이 들어와도 지금 곡을 처음으로 되돌리지 않는다", async () => {
    await open(song("a", V));
    await show(song("a", V), song("b", V));
    await show(song("a", V), song("b", V), song("c", W, { isPriority: true }));
    expect(h.player.loadVideoById).not.toHaveBeenCalled();
    expect(screen.getByTestId("yt").textContent).toBe(V);
  });

  it("다른 영상으로 넘어갈 때도 종전대로 재생한다", async () => {
    await open(song("a", V), song("b", W));
    await show(song("b", W));
    expect(h.player.loadVideoById).toHaveBeenCalledWith(W);
  });

  it("목록이 비었다가 같은 노래가 다시 신청되면 없어진 재생기가 아니라 새 재생기로 튼다", async () => {
    await open(song("a", V));
    const old = h.player;
    await show();
    await show(song("b", V));
    expect(old.loadVideoById).not.toHaveBeenCalled();
    const fresh = { loadVideoById: vi.fn(), playVideo: vi.fn() };
    await act(async () => { h.yt.onReady({ target: fresh }); });
    expect(fresh.loadVideoById).toHaveBeenCalledWith(V);
  });
});
