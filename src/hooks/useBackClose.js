// src/hooks/useBackClose.js
// 브라우저·폰 «뒤로가기» = 앱 안의 바로 전 화면.
//
// 상세 화면·모달·단계 화면처럼 URL 은 그대로 두고 React 상태로만 여는 화면은, 뒤로가기를 누르면
// 그 화면이 닫히는 게 아니라 페이지 밖(이전 메뉴)으로 나가 버렸다(2026-10-01 사용자 지적).
// 이 훅은 화면이 열릴 때 기록을 한 칸 쌓고, 뒤로가기가 그 칸을 빼면 onClose 를 부른다.
//
//   useBackClose(!!selected, () => setSelected(null));
//   useBackClose(isOpen, () => (busy ? false : onClose()));   // false 를 돌려주면 «닫기 거부»
//
// - 겹친 화면(상세 위에 모달)은 깊이로 구분한다 — 뒤로가기 한 번에 맨 위 하나만 닫힌다.
// - 닫기를 거부하면(onClose 가 false) 빠진 칸을 다시 쌓는다 — 안 그러면 다음 뒤로가기에 처리 중인
//   화면을 통째로 떠난다(2026-10-01 교차검증 3계열 공통 지적).
// - 단추로 닫으면 쌓았던 칸을 지운다. 같은 순간에 여러 화면이 닫히면 모아서 history.go(-n) 한 번으로
//   지운다(하나씩 back 하면 칸이 남아 «눌러도 아무 일 없는» 뒤로가기가 생긴다).
// - 다른 메뉴로 이동해서 닫힌 경우(현재 칸이 레이어 칸이 아님)엔 지우지 않는다(이동을 되돌리지 않게).
// - 앞으로가기·되돌아오기로 이미 닫힌 화면의 칸(주인 없는 칸)에 내려앉으면 자동으로 건너뛴다.
// - 지우기(go)는 비동기라, 그 사이 새로 여는 화면은 지우기가 끝난 뒤에 칸을 쌓는다.
import { useEffect, useRef } from "react";

const KEY = "__alchanLayer";
const depthOf = (st) => (st && typeof st[KEY] === "number" ? st[KEY] : 0);
const pushLayer = (depth) => window.history.pushState({ ...(window.history.state || {}), [KEY]: depth }, "");

const openDepths = new Set(); // 지금 열려 있는 레이어 깊이
let pendingPops = 0; // 우리가 일으킨 go/back 중 아직 popstate 가 안 온 수
const waiters = [];
let rewindKeep = null; // 이번 틱에 닫힌 레이어들 중 «남길 깊이»(가장 낮은 깊이 - 1)

const maxOpen = () => (openDepths.size ? Math.max(...openDepths) : 0);

const rewind = (keep) => {
  const cur = depthOf(window.history.state);
  if (cur <= keep) return false;
  pendingPops += 1;
  window.history.go(-(cur - keep));
  return true;
};

const runWaiters = () => waiters.splice(0).forEach((fn) => fn());

const flushRewind = () => {
  const keep = rewindKeep;
  rewindKeep = null;
  // 지울 칸이 없으면(이미 다른 메뉴로 이동 등) 미뤄 둔 새 칸을 바로 쌓는다
  if (keep === null || !rewind(keep)) {
    if (pendingPops === 0) runWaiters();
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (pendingPops > 0) {
      pendingPops -= 1;
      if (pendingPops === 0) runWaiters();
      return;
    }
    // 주인 없는 칸 — 열린 레이어보다 깊은 칸에 내려앉았다(앞으로가기, 다른 메뉴에서 되돌아옴)
    const top = maxOpen();
    if (depthOf(window.history.state) > top) rewind(top);
  });
}

export function useBackClose(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    let depth = 0;
    let pushed = false;
    let closedByBack = false;

    const onPop = () => {
      if (pendingPops > 0 || closedByBack) return;
      if (depthOf(window.history.state) >= depth) return;
      if (closeRef.current?.() === false) {
        pushLayer(depth); // 닫기 거부 — 빠진 칸을 되살린다
        return;
      }
      closedByBack = true;
      openDepths.delete(depth);
    };
    const push = () => {
      depth = depthOf(window.history.state) + 1;
      pushLayer(depth);
      pushed = true;
      openDepths.add(depth);
      window.addEventListener("popstate", onPop);
    };
    // 지우기가 예약됐거나 진행 중이면 그 뒤에 쌓는다 — 한 번의 클릭으로 A 가 닫히고 B 가 열릴 때
    //   B 의 칸이 A 의 칸 위에 쌓였다가 A 지우기에 같이 쓸려 B 가 바로 닫히던 결함(2026-10-01 테스트로 발견)
    if (pendingPops > 0 || rewindKeep !== null) waiters.push(push);
    else push();

    return () => {
      const w = waiters.indexOf(push);
      if (w >= 0) waiters.splice(w, 1);
      if (!pushed) return;
      window.removeEventListener("popstate", onPop);
      openDepths.delete(depth);
      if (closedByBack) return;
      // 같은 틱에 닫힌 레이어를 모아 한 번에 지운다
      const keep = depth - 1;
      if (rewindKeep === null) {
        rewindKeep = keep;
        queueMicrotask(flushRewind);
      } else {
        rewindKeep = Math.min(rewindKeep, keep);
      }
    };
  }, [open]);
}

export default useBackClose;
