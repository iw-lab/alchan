// 뒤로가기 = 앱 안의 바로 전 화면 — 실제 BrowserRouter 위에서 window.history 를 그대로 쓴다.
import React, { useState } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useBackClose } from "../../hooks/useBackClose";

const back = async () => {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
};

let loc;
const Page = () => {
  loc = useLocation();
  const [item, setItem] = useState(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  useBackClose(!!item, () => setItem(null));
  useBackClose(modal, () => (busy ? false : setModal(false)));
  return (
    <div>
      <div>쪽:{loc.pathname}</div>
      {!item ? (
        <button onClick={() => setItem("가")}>항목 열기</button>
      ) : (
        <div>
          상세:{item}
          <button onClick={() => setItem(null)}>← 목록</button>
          <button onClick={() => setModal(true)}>모달 열기</button>
          <button onClick={() => { setModal(false); setItem(null); }}>둘 다 닫기</button>
        </div>
      )}
      {modal && (
        <div>
          모달
          <button onClick={() => setModal(false)}>닫기</button>
          <button onClick={() => setBusy(true)}>처리 시작</button>
          <button onClick={() => setBusy(false)}>처리 끝</button>
        </div>
      )}
      <Link to="/other">다른 메뉴</Link>
    </div>
  );
};
const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<div>홈</div>} />
      <Route path="/page" element={<Page />} />
      <Route path="/other" element={<div>다른 화면</div>} />
    </Routes>
  </BrowserRouter>
);

beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  window.history.pushState({ idx: 1 }, "", "/page");
});

describe("useBackClose", () => {
  it("상세를 열고 뒤로가기 → 목록(페이지는 그대로)", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    expect(screen.getByText("상세:가")).toBeTruthy();
    await back();
    expect(screen.queryByText("상세:가")).toBeNull();
    expect(screen.getByText("쪽:/page")).toBeTruthy();
  });

  it("상세 위 모달 — 뒤로가기 한 번에 모달만, 두 번째에 상세", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("모달 열기"));
    await back();
    expect(screen.queryByText("모달")).toBeNull();
    expect(screen.getByText("상세:가")).toBeTruthy();
    await back();
    expect(screen.queryByText("상세:가")).toBeNull();
    expect(screen.getByText("쪽:/page")).toBeTruthy();
  });

  it("단추로 닫으면 칸도 지워진다 — 다음 뒤로가기는 바로 이전 메뉴", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("← 목록"));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    await back();
    await waitFor(() => expect(screen.getByText("홈")).toBeTruthy());
  });

  it("단추로 닫자마자 다시 열어도 새 화면이 저절로 닫히지 않는다", async () => {
    // 실제 브라우저의 history.go() 는 비동기다(jsdom 은 즉시 처리해 경쟁이 재현되지 않는다) → 늦춘다
    const realGo = window.history.go.bind(window.history);
    window.history.go = (n) => setTimeout(() => realGo(n), 20);
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("← 목록"));
    fireEvent.click(screen.getByText("항목 열기")); // 지우기(back)가 끝나기 전에 다시 연다
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(screen.getByText("상세:가")).toBeTruthy();
    window.history.go = realGo;
    await back();
    expect(screen.queryByText("상세:가")).toBeNull();
    expect(screen.getByText("쪽:/page")).toBeTruthy();
  });

  it("상세를 연 채 다른 메뉴로 이동하면 이동이 되돌려지지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("다른 메뉴"));
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(screen.getByText("다른 화면")).toBeTruthy();
  });

  it("처리 중이라 닫기를 거부하면 칸이 되살아난다 — 다음 뒤로가기도 페이지를 안 떠난다", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("모달 열기"));
    fireEvent.click(screen.getByText("처리 시작"));
    await back();
    expect(screen.getByText("모달")).toBeTruthy(); // 거부
    await back();
    expect(screen.getByText("모달")).toBeTruthy(); // 또 거부 — 페이지 그대로
    expect(screen.getByText("쪽:/page")).toBeTruthy();
    fireEvent.click(screen.getByText("처리 끝"));
    await back();
    expect(screen.queryByText("모달")).toBeNull();
    expect(screen.getByText("상세:가")).toBeTruthy();
  });

  it("두 화면을 한꺼번에 닫아도 칸이 남지 않는다 — 다음 뒤로가기는 바로 이전 메뉴", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("모달 열기"));
    fireEvent.click(screen.getByText("둘 다 닫기"));
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    await back();
    await waitFor(() => expect(screen.getByText("홈")).toBeTruthy());
  });

  it("단추로 닫은 뒤 앞으로가기로 주인 없는 칸에 내려앉으면 건너뛴다", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("항목 열기"));
    fireEvent.click(screen.getByText("← 목록"));
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    await act(async () => { window.history.forward(); await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getByText("쪽:/page")).toBeTruthy();
    await back();
    await waitFor(() => expect(screen.getByText("홈")).toBeTruthy()); // 헛도는 뒤로가기 없음
  });
});
