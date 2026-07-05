// fetchCache 단위 테스트 — 읽기 절감 1단계 성공조건(SC1·SC2) 검증
import { describe, it, expect, vi } from 'vitest';
import { cachedFetch, invalidateCache } from './fetchCache';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('fetchCache', () => {
  it('SC1: TTL 내 같은 키 재요청은 fetch 0회(캐시 응답)', async () => {
    const fn = vi.fn(async () => ({ v: 1 }));
    const a = await cachedFetch('sc1:c1', 60_000, fn);
    const b = await cachedFetch('sc1:c1', 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(b).toBe(a); // 동일 참조 → React 재렌더 bail-out 가능
  });

  it('SC1b: TTL 경과 후에는 재fetch', async () => {
    let v = 0;
    const fn = vi.fn(async () => ({ v: ++v }));
    await cachedFetch('sc1:c2', 1, fn); // TTL 1ms
    await new Promise((r) => setTimeout(r, 10));
    const b = await cachedFetch('sc1:c2', 1, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(b.v).toBe(2);
  });

  it('SC2: force는 fresh 캐시가 있어도 우회 후 캐시 갱신', async () => {
    let v = 0;
    const fn = vi.fn(async () => ({ v: ++v }));
    await cachedFetch('sc2:c1', 60_000, fn);
    const forced = await cachedFetch('sc2:c1', 60_000, fn, { force: true });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(forced.v).toBe(2);
    // force 후 일반 요청은 갱신된 캐시를 받음
    const after = await cachedFetch('sc2:c1', 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(after.v).toBe(2);
  });

  it('동시 요청 dedupe: 같은 키 동시 2회 → fetch 1회 공유', async () => {
    let resolve;
    const fn = vi.fn(() => new Promise((r) => { resolve = r; }));
    const p1 = cachedFetch('dedupe:c1', 60_000, fn);
    const p2 = cachedFetch('dedupe:c1', 60_000, fn);
    resolve({ v: 'x' });
    const [a, b] = await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('세대 가드(C6): 늦게 도착한 구요청이 force 결과를 역덮어쓰지 못함', async () => {
    let resolveSlow;
    const slow = () => new Promise((r) => { resolveSlow = r; });
    const fast = async () => ({ v: 'fresh' });

    const pSlow = cachedFetch('race:c1', 60_000, slow); // 구요청(미완료)
    const forced = await cachedFetch('race:c1', 60_000, fast, { force: true });
    expect(forced.v).toBe('fresh');

    resolveSlow({ v: 'stale' }); // 구요청이 뒤늦게 완료
    await pSlow; await tick();

    // 캐시는 여전히 force 결과여야 한다
    const now = await cachedFetch('race:c1', 60_000, async () => ({ v: 'should-not-run' }));
    expect(now.v).toBe('fresh');
  });

  it('invalidateCache(prefix): 접두사 일치 키만 제거', async () => {
    const fn1 = vi.fn(async () => 1);
    const fn2 = vi.fn(async () => 2);
    await cachedFetch('naLaws:C1', 60_000, fn1);
    await cachedFetch('naLawsApproved:C1', 60_000, fn1);
    await cachedFetch('jobs:C1', 60_000, fn2);
    const n = invalidateCache('naLaws'); // naLaws:·naLawsApproved: 둘 다 매칭
    expect(n).toBe(2);
    await cachedFetch('naLaws:C1', 60_000, fn1); // miss → 재fetch
    expect(fn1).toHaveBeenCalledTimes(3);
    await cachedFetch('jobs:C1', 60_000, fn2); // 살아있음 → 캐시
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('persist: 메모리 miss여도 sessionStorage에 fresh 항목이 있으면 fetch 0회(새로고침 시나리오)', async () => {
    // 새로고침 직후 상태 재현: 메모리 캐시엔 없고 sessionStorage에만 존재
    sessionStorage.setItem('fc:pers:c1', JSON.stringify({ data: { v: 9 }, ts: Date.now() }));
    const fn = vi.fn(async () => ({ v: 'should-not-run' }));
    const a = await cachedFetch('pers:c1', 60_000, fn, { persist: true });
    expect(fn).toHaveBeenCalledTimes(0);
    expect(a.v).toBe(9);
  });

  it('persist: 저장 시 sessionStorage에 기록되고 invalidate로 함께 제거', async () => {
    const fn = vi.fn(async () => ({ v: 1 }));
    await cachedFetch('pers:c2', 60_000, fn, { persist: true });
    expect(sessionStorage.getItem('fc:pers:c2')).not.toBeNull();
    invalidateCache('pers:c2');
    expect(sessionStorage.getItem('fc:pers:c2')).toBeNull();
  });

  it('persist 미지정 키는 sessionStorage를 건드리지 않음', async () => {
    const fn = vi.fn(async () => ({ v: 1 }));
    await cachedFetch('mem:only', 60_000, fn);
    expect(sessionStorage.getItem('fc:mem:only')).toBeNull();
  });

  it('에러 시 캐시 미기록 → 다음 요청은 재시도', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });
    await expect(cachedFetch('err:c1', 60_000, fn)).rejects.toThrow('boom');
    const b = await cachedFetch('err:c1', 60_000, fn);
    expect(b.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
