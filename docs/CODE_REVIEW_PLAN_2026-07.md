# 알찬(alchan) 전체 코드 리뷰 & 리팩토링 계획서

작성: 2026-07-16 · 대상: `alchan/` 전체 (src ~112K줄/174파일, functions ~14.6K줄, firestore.rules 1,320줄)

---

## 0. 현황 요약 (착수 근거)

| 항목 | 현황 | 리스크 |
|---|---|---|
| 스택 | CRA(react-scripts 5) + React 18 + Firebase 11 + Tailwind | CRA는 유지보수 종료 궤도 — 장기적 Vite 이전 검토 대상 |
| 초대형 파일 | `functions/index.js` 6,756줄, `AdminSettingsModal.js` 3,964줄, `scheduler-http.js` 3,422줄, 2,000줄+ 페이지 6개 | 리뷰 불가능 단위 → 버그 은닉처 |
| 아키텍처 한계 (기존 감사에서 확인) | cash·국고·인벤토리 **클라이언트 직접 write** 잔존 | 위조 가능 경로 — CF 이관이 근본 해결 |
| 비용 | 읽기 절감 1·2단계 완료(usePolling 캐시, catalogMeta 버전 문서). 읽기가 유일한 비용 병목 | 신규 코드가 캐시 규약 안 지키면 회귀 |
| 미커밋 WIP | CourtroomScene 관련 8개 파일 untracked | 리팩토링 커밋에 섞이면 오염 |

**진행 대원칙** (전역 룰 준수):
- 인증·DB·결제·자산 관련 수정 = **수정 전 FULL 교차검증(Tier-0 게이트 + codex·Gemini·code-reviewer + 메인 종합), 수정 후 LITE 재검증**. 실행 전 `rules-lazy/cross-validation.md` Read.
- 모든 "고쳤다" 주장에 재현 명령·before/after 수치 첨부. 검증 없는 완료 선언 금지.
- 배포는 Phase 단위로 쪼개서(빅뱅 금지), 각 배포 후 Firestore 사용량·에러 모니터링 확인.
- 외부 리뷰 SaaS(CodeRabbit 등) 금지 — 학생 PII 포함 코드.

---

## Phase 0 — 준비·베이스라인 (반나절)

목표: "개선했다"를 증명할 수 있는 측정 기준 확보 + 작업 격리.

1. **WIP 격리**: CourtroomScene untracked 8개 파일을 stash 또는 별도 브랜치로 보존 (삭제 금지 — 메모리에 WIP 보존 명시됨).
2. **베이스라인 측정** (모든 수치는 파일로 저장해 after와 비교):
   - `npm run build` 성공 여부 + 빌드 시간 + `build/` 번들 크기 (`source-map-explorer` 또는 `du` 스냅샷)
   - `npx eslint src --ext .js` 경고/에러 수
   - `npm audit --omit=dev` 취약점 수 (functions 포함)
   - 테스트 현황: `npm run test:unit` 통과/실패/커버리지
   - Firebase 콘솔 최근 7일 읽기/쓰기/CF 호출량 스냅샷 (비용 절감 before 수치)
3. **인벤토리 자동 생성**: 페이지·컴포넌트·CF 엔드포인트·Firestore 컬렉션 목록 스크립트로 추출 → `docs/inventory.md`. 이후 모든 Phase가 이 목록 기준으로 전수 체크(누락 방지).

산출물: `docs/baseline-2026-07.md`, `docs/inventory.md`

---## Phase 1 — 자동화 정적 게이트 (반나절, AI 토큰 0)

목표: 기계가 잡을 수 있는 건 기계가 먼저. (Tier-0 `preflight-gate.sh` 활용)

- [ ] ESLint 전체 + `eslint-plugin-react-hooks` exhaustive-deps 위반 전수 목록화 (읽기폭주 버그클래스의 뿌리 — 자기참조 useCallback deps)
- [ ] 시크릿 스캔: API 키·토큰 하드코딩 grep (`AIza`, `sk-`, `-----BEGIN` 등)
- [ ] `npm audit` + `overrides` 실효성 확인 (root/functions 양쪽)
- [ ] 미사용 의존성: `npx depcheck` — three/@react-three/fiber, react-youtube 등 실사용 여부 확인 (three.js는 번들 최대 용의자)
- [ ] `console.log` 잔존 수, TODO/FIXME/HACK 목록화
- [ ] 죽은 파일 1차 후보: import 그래프 기준 어디서도 참조 안 되는 src 파일 목록 (`npx unimported` 또는 madge)

산출물: `docs/gate-report.md` — Phase 3~5의 입력이 됨. **이 단계에서는 수정하지 않고 목록만** (수정은 각 Phase에서 검증과 함께).

---

## Phase 2 — 보안 감사 (2~3세션) 🔴 최우선

목표: 2026-07 보안감사(7way)에서 "아키텍처 한계"로 남긴 잔여 항목의 근본 해결 + 신규 취약점 전수.

### 2A. 클라이언트 write → CF 이관 (핵심, 중대 변경 = FULL 교차검증)
기존 감사에서 확인된 잔여 위조 가능 경로:
- [ ] **cash 클라이언트 write** 잔존 경로 전수 조사 (`updateDoc.*cash|increment` grep) → CF 이관 우선순위 결정
- [ ] **국고(관리자 cash)** 클라 write 경로
- [ ] **본인 인벤토리** 클라 write (선물 CF 이관 때 남긴 잔여)
- [ ] **음악 우선신청 isPriority** 클라 위조 (기존 확인된 한계)
- 이관 방식: 경찰서 합의금 건 교훈 적용 — **rules에서 create/update 둘 다 잠가야** 함(update만 잠그면 create로 우회).

### 2B. firestore.rules 전수 리뷰 (1,320줄)
- [ ] 컬렉션별 매트릭스: 누가/무엇을/어떤 조건으로 read/write — 표로 문서화
- [ ] fail-open 패턴(기본 allow) 잔존 여부
- [ ] classCode 교차 접근(타 학급 데이터) 차단 확인 — money glitch의 뿌리였음
- [ ] 금액 상한 상수 확인 (activity_logs ±100억 등) — 인플레 대비 여유 확인
- [ ] Rules `:test` API로 대표 시나리오 원격 검증 (평문 data/`__name__` 형식)

### 2C. CF·기타
- [ ] CF 입력 검증: 모든 callable에서 auth·classCode 대조·금액 음수/NaN 가드
- [ ] 멱등성(idempotency) 확인: 송금·구매·뽑기 등 이중클릭/재시도 시나리오
- [ ] XSS: 게시판·담벼락·닉네임 등 사용자 입력 렌더링 경로 (`dangerouslySetInnerHTML` grep)
- [ ] 학생 PII 노출면: 콘솔 로그·에러 메시지에 개인정보 유출 여부
- [ ] `security-shield` 스킬 체크리스트(OWASP) 1회 통과

산출물: 취약점 목록(심각도별) → 즉시수정(CRITICAL)/이관 로드맵(구조적) 분리. **수정은 4단계 안전망(`rules-lazy/financial-saas.md`) + FULL 교차검증 후 배포.**

---

## Phase 3 — 버그 & 데이터 정합성 (2세션)

목표: 알려진 버그클래스의 재발 검사 + 금융 로직 정합성.

- [ ] **읽기폭주 버그클래스 재스캔**: `firestore-readloop-audit` 스킬 실행 (자기참조 useCallback deps → 무한 재fetch). 신규 코드 유입분 대상.
- [ ] **순자산 계산 통일 회귀 검사**: 6곳 통일(1bfc25c) 이후 신규 자산 경로가 공식(현금+쿠폰+파킹+예적금+주식+부동산−대출)에 빠짐없이 반영되는지
- [ ] **주급 공식 4곳(서버3+AdminSettingsModal) 동기화** 확인 — 공식이 여러 곳에 박힌 것 자체가 버그원 → 단일 모듈로 추출 (Phase 7과 연계)
- [ ] 레이스 컨디션: 동시 구매/송금/경매 입찰 — 트랜잭션 미사용 write 경로 grep
- [ ] 유령 참조 버그클래스: 삭제된 문서 id가 배열에 잔존하는 패턴 (유령 직업id 건과 동형) — selectedJobIds 외 유사 배열 필드 전수
- [ ] localStorage 의존 기능의 초기화 화이트리스트 (`clearCachesAndReload`) — 최근 추가 키 보존 여부 (사용중 아이템·게시판 초안 건과 동형)
- [ ] 에러 경계: ErrorBoundary 유무, ChunkLoadError 자동 리로드 시 데이터 유실 경로
- 버그 수정 시 debugging 스킬 철칙 적용: 재현 명령 없이 fix 없음.

산출물: 버그 목록 + 각 건 재현 명령 → 심각도순 수정.

---

## Phase 4 — 죽은 코드 제거 (1세션)

목표: 리뷰 대상 자체를 줄여 이후 Phase 효율↑. (Phase 1 목록 기반)

- [ ] 미참조 src 파일 삭제 (import 그래프 + `git log` 최근 사용 이력 이중 확인)
- [ ] **죽은 데이터 경로**: write 0건 컬렉션 참조 코드 (stockList·financials/loans 건과 동형) — Firestore 실데이터 대조
- [ ] 미사용 CF: 클라이언트에서 호출되지 않는 함수 (`httpsCallable` grep 대조) — 삭제 전 콘솔 호출 로그로 실호출 0 확인
- [ ] 미사용 의존성 제거 (three.js 계열 미사용 확정 시 번들 대폭 감소)
- [ ] 주석처리된 코드 블록·미사용 export 정리
- ⚠️ 삭제는 **기능별 개별 커밋** (되돌리기 용이) + 삭제 후 빌드·스모크 테스트 필수. CourtroomScene 관련은 "비활성이지만 보존" — 삭제 금지.

산출물: 삭제 diff + before/after 파일수·번들 크기.

---

## Phase 5 — 성능 & Firestore 비용 절감 (2세션)

목표: 읽기 = 유일 비용 병목. 3단계 절감 + 프론트 성능.

### 5A. Firestore 읽기 (비용)
- [ ] 콘솔 쿼리 통계로 현재 상위 읽기 소스 식별 (진단 1순위 = 쿼리통계, 추측 금지)
- [ ] usePolling `cacheKey` 규약 준수 전수 확인 — 신규 훅 유입분 (부수효과형 queryFn엔 키 금지)
- [ ] onSnapshot 리스너 수·범위 감사: 페이지 이탈 시 unsubscribe 누락, 광범위 컬렉션 리스너
- [ ] 읽기 절감 3단계(집계 요약문서) 설계 검토 — 대시보드·랭킹 등 N명 전체 읽는 화면 대상
- [ ] `limit()` 없는 쿼리 전수 (limit(300) 가드 패턴 확산)

### 5B. 프론트 성능
- [ ] 번들 분석: 코드 스플리팅(React.lazy) 현황 — 2,000줄+ 페이지들이 초기 번들에 포함되는지
- [ ] 게임(오목·체스)·3D 계열 lazy 로드 확인
- [ ] 리렌더 핫스팟: Context 남용(AuthContext 등) → 값 분리·memo. ref화 패턴(기존 교훈) 확산
- [ ] 이미지: avatar-shop 등 에셋 크기·포맷(WebP)·캐시 헤더 (단, avatar-shop max-age=0 규약은 유지)
- [ ] Lighthouse 측정 (before/after) — 주요 3페이지(대시보드·상점·은행)

### 5C. CF 비용
- [ ] 스케줄러(scheduler-http.js) 실행 빈도·중복 실행 여부
- [ ] cold start 대비 함수 통합/분리 적정성

산출물: 콘솔 수치 기반 절감 리포트 (배포 1주 후 실측 비교 — "학생 로그인 후 점진 수렴" 특성 감안).

---

## Phase 6 — UI/UX 디자인 감사 (1~2세션)

목표: 일관성·접근성·모바일. 대규모 리디자인이 아니라 **감사 → 우선순위 → 선별 적용** (필요 시 design-master 스킬 발동).

- [ ] 디자인 토큰 일관성: 색·간격·radius·폰트가 Tailwind config로 통제되는지 vs 인라인 하드코딩 산재 (App.css/styles.css/개별 css 혼재 상태)
- [ ] 컴포넌트 중복: 같은 UI(버튼·모달·카드)가 페이지마다 재구현된 곳 → `components/ui` 통합 후보
- [ ] 모바일(학생 주 사용 환경): 주요 플로우 반응형 깨짐 스크린샷 전수 (browser 스킬로 자동 캡처)
- [ ] 접근성 최소선: 터치 타겟 크기, 대비, 폼 라벨 — 초등학생 사용자 특성상 가독성·오터치 중점
- [ ] 로딩·에러·빈 상태 3종 처리 누락 화면 목록
- [ ] Tailwind preflight `img max-width` 류 함정 재점검 (Avatar 오버레이 등 기존 사례)

산출물: 스크린샷 기반 감사 리포트 + 수정 우선순위 (기능 영향 없는 것만 일괄, 구조 변경은 개별 검증).

---

## Phase 7 — 구조 리팩토링 (2~3세션, 마지막에 수행)

목표: 초대형 파일 분해. **버그·보안 수정이 끝난 뒤에** 수행 (움직이는 코드 위에서 리팩토링 금지). "불필요 리팩토링 금지" 룰에 따라 아래 기준 충족 시만:

| 대상 | 기준/방향 |
|---|---|
| `functions/index.js` (6,756줄) | 도메인별 모듈 분리(banking/market/government/…) — export 표면 유지, 순수 이동만. 이동 전후 함수 목록 diff로 누락 0 증명 |
| `AdminSettingsModal.js` (3,964줄) | 탭 단위 컴포넌트 분리. 주급 공식 등 중복 상수는 shared 모듈로 |
| 2,000줄+ 페이지 6개 | 전부는 안 함 — 변경 빈도 높은 순(git log 커밋수 기준) 상위 2~3개만 |
| 공식·상수 중복 | 주급 공식 4곳, 세율, 금액 상한 등 → `src/constants`/functions 공유 모듈 단일화 |

- 리팩토링은 **동작 불변** 커밋(이동만)과 **동작 변경** 커밋 절대 혼합 금지.
- 각 분해 후: 빌드 + 해당 페이지 스모크(browser 스킬) + LITE 교차검증.

---

## Phase 8 — 테스트·CI 안전망 (1세션)

- [ ] 금융 코어(순자산 계산·주급·세금·이자) 순수함수 추출분에 vitest 단위 테스트 — 커버리지 목표: 금융 로직 80%+ (전체 커버리지 목표는 세우지 않음)
- [ ] Firestore rules 테스트: `@firebase/rules-unit-testing`으로 Phase 2B 매트릭스의 핵심 거부 시나리오 고정
- [ ] Playwright 스모크 3종(로그인→대시보드, 구매, 송금) — 배포 전 게이트로
- [ ] deploy.yml 확인: build/** 트리거 규약(빌드 누락 시 배포 안 되는 함정) 자동화 보완 검토

---

## Phase 9 — 최종 교차검증 & 마감

- [ ] 전체 변경분 요약 → **FULL 교차검증 1회** (중대 변경 포함이므로)
- [ ] 베이스라인 대비 최종 수치표: 번들 크기, ESLint, audit, 읽기량(1주 후 추적), Lighthouse, 파일 수
- [ ] learnings/메모리 기록 + 이 계획서에 결과 체크 반영

---

## 우선순위·일정 요약

| 순서 | Phase | 규모 | 이유 |
|---|---|---|---|
| 1 | P0 준비 + P1 게이트 | 1일 | 측정 없이는 개선 증명 불가 |
| 2 | **P2 보안** | 2~3세션 | 실제 학생 자산·PII — 위조 경로가 최대 리스크 |
| 3 | P3 버그 정합성 | 2세션 | 자산 신고 재발 방지 |
| 4 | P4 죽은 코드 | 1세션 | 이후 작업 대상 축소 |
| 5 | P5 성능·비용 | 2세션 | 유일 비용 병목 |
| 6 | P6 UI 감사 | 1~2세션 | 사용자 체감 |
| 7 | P7 리팩토링 | 2~3세션 | 안정화 후 마지막 |
| 8 | P8 테스트 + P9 마감 | 1~2세션 | 회귀 안전망 |

총 예상: **12~16 세션**. 각 Phase 종료마다 개별 배포+모니터링(빅뱅 금지). 운영 중인 학급 서비스이므로 **방학/주말 등 저사용 시간대 배포** 권장.

## 리스크 & 중단 기준

- 리팩토링 중 스모크 실패 → 즉시 revert, 원인 규명 전 진행 금지.
- CF 이관은 클라 구버전 공존 기간 필요 → 이관 함수는 기존 경로와 병행 기간 두고 rules 잠금은 마지막에.
- Phase 간 의존: P7(리팩토링)은 P2·P3 완료가 선행 조건. P4는 P1 목록 확정 후.
