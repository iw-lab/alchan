# P1 자동화 정적 게이트 리포트 — 2026-07-16 @ 86c1bbe

이 단계는 **목록화만** — 수정은 각 담당 Phase에서 검증과 함께. 전반적으로 과거 감사(읽기폭주·보안 7way)의 효과가 유지되어 매우 깨끗한 상태.

## 1. ESLint / exhaustive-deps
- 전체 src에서 **경고 1건**: `src/hooks/useFirestoreData.js:505` — useEffect deps에 loadMore, reset 누락 → **P3에서 판정** (의도적 생략인지 읽기폭주 위험인지)

## 2. 시크릿 스캔 — ✅ 통과
- API 키/개인키/토큰 하드코딩 패턴 0건. firebaseConfig는 `process.env.REACT_APP_*` 경유
- `.env`·`functions/.env` git 미추적 + .gitignore 등재 확인

## 3. npm audit (P0 베이스라인 참조)
- root 24건 / functions 20건 (각 critical 3 포함) — ws, websocket-driver 등
- → **P2에서 처리**: `npm audit fix`(비파괴) 적용 + 잔여는 런타임 노출 여부 분류. react-scripts 계열 dev체인은 위험도 낮음

## 4. 미사용 의존성 (depcheck)
| 패키지 | 판정 |
|---|---|
| `@firebasegen/default-connector` | **진짜 미사용** — src 참조 0. dataconnect/·dataconnect-generated/ 디렉토리 포함 P4 제거 후보 |
| `@testing-library/user-event` | 미사용 추정 — P4에서 test 디렉토리 재확인 |
| autoprefixer, postcss, tailwindcss | **오탐** (config 파일 경유 사용) |
| `@babel/runtime` | **유지** (보안 overrides 짝) |
| three, @react-three/fiber | **사용 중** — Chess3DBoard.js 단독. 229KB gzip 청크(1985)의 유력 정체 → P5에서 lazy 경계 확인 |
| react-youtube | 사용 중 (MusicRoom.js) |

## 5. console.log / TODO
- console.log: src 7건 (functions 0건) — logger 유틸 존재하므로 P4에서 일괄 치환/삭제
- TODO/FIXME/HACK: 2건 — P4에서 처리

## 6. 죽은 파일 후보 (madge orphans, 211파일 분석)
**확정 후보 (P4 삭제 대상, 삭제 전 git log 이력 재확인):**
- `src/components/LevelBadge.js` — 어떤 파일도 import 안 함 (levelSystem.js의 getLevelBadgeStyle은 동명 함수일 뿐)
- `src/utils/avatarSystem.js` — 참조 0
- 죽은 barrel 5개: `components/modals/index.js`, `firebase/db/index.js`, `pages/{admin,banking,games,government,market}/index.js` — 디렉토리 스타일 import 사용처 0

**보존 (삭제 금지):**
- `data/courtroomAssets.js`, `pages/government/CourtroomScene.js` — WIP (백업 완료)
- test/*, `src/index.js`(엔트리), setup.js

## 7. 구조 발견사항 (다음 Phase 입력)
- **코드 스플리팅 이미 양호**: lazyWithRetry 51곳 — P5는 "스플리팅 도입"이 아니라 "청크 구성 최적화"(three.js 등 대형 청크 경계)로 범위 조정
- CF exports 104 중 클라 미참조 48 (cf-unused-candidates.txt) — P4에서 트리거 유형(스케줄러/HTTP/onCall) 분류 후 판정
- browserslist DB 6개월 노후 — P4에서 `npx update-browserslist-db` (무해)
- build/에 courtroom 12M 유입 중 (public/courtroom) — 배포 용량에 WIP가 실림, P4에서 hosting ignore 검토
