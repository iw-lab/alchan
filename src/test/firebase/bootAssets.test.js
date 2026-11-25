// 2026-11-25 — 첫 접속에서 새던 것들이 다시 생기지 않게.
//  ① index.html·manifest 가 없는 파일을 가리킴(호스팅은 404 대신 index.html 을 준다 → 아이콘이 안 뜨고 헛 요청)
//  ② 서비스워커 등록(매 접속 등록→해제→강제 새로고침)  ③ Jua 는 로고 글자만 잘라 받는다 — 다른 글자에 쓰면 글씨체가 깨진다
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (f) => readFileSync(f, "utf8");
const html = read("index.html");
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const src = walk("src").filter((f) => /\.(js|jsx|ts|tsx)$/.test(f) && !f.includes("/test/"));

describe("첫 접속 자원", () => {
  it("index.html 이 가리키는 파일이 public/ 에 있다", () => {
    const refs = [...html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)].map((m) => m[1])
      .concat([...html.matchAll(/https:\/\/inconomysu-class\.web\.app(\/[^"]+\.\w+)"/g)].map((m) => m[1]))
      .filter((p) => p !== "/" && !p.startsWith("/src/"));
    expect(refs.length).toBeGreaterThan(3);
    expect(refs.filter((p) => !existsSync(join("public", p)))).toEqual([]);
  });
  it("manifest 의 아이콘·화면 그림이 있고, 단축 메뉴는 살아 있는 화면이다", () => {
    const m = JSON.parse(read("public/manifest.json"));
    const files = [...m.icons, ...(m.screenshots || []), ...(m.shortcuts || []).flatMap((s) => s.icons || [])].map((i) => i.src);
    expect(files.filter((f) => !existsSync(join("public", f)))).toEqual([]);
    const layout = read("src/components/AlchanLayout.js");
    for (const s of m.shortcuts || []) expect(layout, s.url).toContain(`path="${s.url}"`);
    expect(m.icons.some((i) => i.type === "image/png" && i.sizes === "512x512")).toBe(true);
    expect(m.orientation).toBe("any");
  });
  it("서비스워커를 등록하지 않는다 · 남은 워커 파일은 스스로 사라진다 · 강제 새로고침이 없다", () => {
    for (const f of src) expect(read(f), f).not.toMatch(/serviceWorker[\s\S]{0,20}\.register\(/);
    expect(html).not.toMatch(/serviceWorker\.register\(|location\.reload/);
    for (const f of ["public/sw.js", "public/service-worker.js"]) expect(read(f)).toContain("registration.unregister()");
  });
  it("Jua 는 받아 둔 글자에만 쓴다", () => {
    const glyphs = new Set(decodeURIComponent(html.match(/family=Jua&text=([^&]+)/)[1]));
    const used = src.flatMap((f) => [...read(f).matchAll(/font-jua[^>]*>([^<{]*)</g)].map((m) => [f, m[1].trim()]));
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const [f, t] of used) for (const ch of t) expect(glyphs.has(ch), `${f}: «${t}»`).toBe(true);
  });
  it("아이템 목록은 첫 화면과 겨루지 않는다 — 쓰는 화면이 뜨거나 한숨 돌린 뒤에 받는다", () => {
    const ctx = read("src/contexts/ItemContext.js");
    expect(ctx).toMatch(/enabled: active && /);
    expect(ctx).toMatch(/if \(!active \|\| !userId/);
  });
});
