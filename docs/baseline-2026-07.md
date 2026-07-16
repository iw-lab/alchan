# 베이스라인 측정 (P0) — 2026-07-16

모든 "개선" 주장은 이 수치 대비로 증명한다. 환경: node v25.9.0 / npm 11.12.1 / main @ 86c1bbe.

## 빌드
- `npm run build`: **성공, 경고 0** ("Compiled successfully"), wall 8.7초 (M칩 병렬)
- gzip 후 크기: **main 215.07 kB**, 최대 청크 1985 = **228.99 kB** (원본 875KB — 정체 P5에서 규명), 6619 = 49.6 kB, main.css 22.3 kB
- `build/` 총 120M = **avatar-shop 88M + courtroom 12M(WIP 유입) + static/js 16M**
- 부수 신호: browserslist DB 6개월 노후 (경고 10회)
- 전체 로그: 세션 scratchpad `build-full.log`

## Lint (.eslintrc.json: react-hooks 플러그인만)
- `npx eslint src --ext .js,.jsx`: **경고 1건** — `src/hooks/useFirestoreData.js:505` exhaustive-deps (loadMore, reset 누락)

## npm audit --omit=dev
- root: **24건 (critical 3, high 5, moderate 15, low 1)** — ws 등, `npm audit fix` 가용
- functions: **20건 (critical 3, high 4, moderate 12, low 1)** — websocket-driver 등
- ⚠️ 대부분 devDependency 체인/CRA 계열로 추정 — P2에서 실제 런타임 노출 여부 분류 후 처리

## 테스트 (vitest 4, CI=true)
- **219 passed / 6 failed** (파일 9개 중 3개 실패, 6.85s)
- 실패 목록 (P3/P8에서 수정):
  1. logger.test.js — "logger with module name prefix in development"
  2. logger.test.js — "multiple loggers with different module names"
  3. useFirestoreData.test.js — "fallback to globalCacheService when local cache misses"
  4. (캐시 서비스) "should clear user-specific data"
  5. (캐시 서비스) "should clear class-specific data"
  6. (재시도) "should fail after max retries" (5s 타임아웃성)
- 전체 로그: scratchpad `vitest-baseline.log`

## Firestore 사용량 (before)
- [ ] **미측정** — Firebase 콘솔 최근 7일 읽기/쓰기/CF 호출 스냅샷 필요 (사용자 확인 또는 브라우저 자동화로 P5 착수 시 채움)
- 참고(메모리): 읽기 절감 1·2단계 배포 완료 상태, 야간 폭주 150→19 read/분까지 개선 이력

## WIP 격리
- CourtroomScene 관련 8개 파일(11MB) → `../_wip-courtroom-backup-20260716/` 백업 완료. 원본은 untracked로 유지, 커밋은 개별 파일 add만 사용.
