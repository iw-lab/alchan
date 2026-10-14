# 알찬 전수 리뷰·실측 디버깅 — 2026-10-14

브랜치 `review/full-2026-10-14` (main 병합 배포). 이전 리뷰: [CODE_REVIEW_2026-08-11.md](./CODE_REVIEW_2026-08-11.md).

방법: 빌드 그래프·knip·oxlint 로 죽은 코드 전수 → Firestore/Auth/Functions **에뮬레이터 위 실조작 e2e**
(교사 가입 → 슈퍼관리자 승인 → 학생 일괄 생성 → 학생 4명이 실제 화면으로 기능 사용, 돈은 문서로 대조)
→ 돈 Cloud Function **악성 입력 퍼징**·**권한 스윕** → Rules `:test` API 거부 테스트 → FULL 교차검증
(codex·gemini·grok·Claude + meta 보조) → 지적은 재현해서만 채택.

## 1. 사용자에게 보이던 결함 (수정됨)

| # | 증상 | 원인 | 확인 |
|---|---|---|---|
| 1 | **거부권 뒤 재의결이 사실상 불가능** — 운영 거부 9건 · 재의결 성공 0건 | 재의결 회차도 1차 투표 기록(userVotes)으로 중복을 막아, 1차 찬성자가 재의결에 못 참여. 25명 반 정족수 17명을 영영 못 채움 | 옛 코드에서 e2e 빨강 → 수정 후 초록 |
| 2 | 대통령실 «재의결 진행 중인 법안»이 **항상 비어 있음** | 운영 0건인 최상위 `laws` 컬렉션을 읽음(거부된 법은 `nationalAssemblyLaws`) | 〃 |
| 3 | 대통령실 «재의결 정족수» 설정이 **효과 없음** | 국회 판정이 안 읽는 `governmentSettings` 에 저장 | 〃 |
| 4 | 대통령실 재의결 기한 «NaN시간» | Timestamp 를 `new Date()` 에 그대로 | 〃 |
| 5 | 슈퍼관리자 «시스템 모니터링» **9개월간 열 때마다 오류** | 1월 26일에 지운 CF 2개를 계속 호출 | 화면 제거 + CI 관문 |
| 6 | 학습게시판: 학생이 누른 좋아요 3개마다 주는 **쿠폰이 지급 안 됨**(글엔 «쿠폰 1» 표시) | 7월 coupons 잠금 뒤 클라이언트 지급이 rules 에 조용히 막힘 | 서버 CF `reactLearningPost` 로 이관, e2e 좋아요 3 → 쿠폰 +1 |
| 7 | 출석보상 알림이 «0알찬» | 원장(activity_logs)에 금액 누락(출석·게임보상·할일 승인 학생 쪽·합의금) | e2e 원장 금액 확인 |
| 8 | 출석보상 팝업 **이중** 표시 | 레이아웃 모달 안에 배너 자체 팝업 | |
| 9 | 교사 가입 «완료» 안내가 사라지고 학생 탭만 남음 | 가입 직후 자동 리다이렉트 | e2e |
| 10 | 담벼락 첫 진입 동시 준비 시 오류 | 같은 판을 두 번 만들려는 race | e2e |
| 11 | 경매장 훅 순서 오류(조건부 훅) | `useBackClose` 위치 | |
| 12 | 경매 종료 후 여러 학생이 보면 콘솔 409 | 정산 동시 호출 중 두 번째가 throw | 정산 멱등화, e2e 동시 정산 |
| 13 | 교사 관리자 쿠폰: 지급 실패 시 «지급됨» 표시만 남고 재시도 불가 | 표시와 지급이 별도 쓰기 | 한 트랜잭션으로 |
| 14 | 운영 번들이 소스와 다름(지운 페이지 3개가 살아 있음) | 다른 세션이 옛 작업 트리로 빌드한 build/ 를 배포 | 소스 지문 배포 관문 |
| 15 | 국회: 교사가 한 번도 안 연 반은 학생 화면이 **무한 로딩**, 화면을 막 연 직후 투표는 TypeError 로 실패 | `usePolling` 이 `defaultValue`·`onError` 옵션을 받기만 하고 무시(초기 null) + 학생이 없는 설정 문서를 만들려다 rules 거부. 운영 교사 학급 5개 중 1개가 설정 문서 없음 | 훅 단위 테스트·e2e 옛 코드 빨강(PERMISSION_DENIED) → 초록 |
| 16 | 국회: 교사 «법안 수정» 저장이 날짜를 문자열로 바꾸고, 모달을 연 뒤 들어온 표·상태를 되돌림(가결된 법이 심의중으로) | 화면 사본(`...law`)을 통째로 저장. 운영 49건 중 아직 사용 0건(잠재) | 고친 칸만 저장, e2e 옛 코드 빨강 → 초록 |
| 17 | 경매 등록이 간헐적으로 «아이템을 선택해주세요»로 막힘 | 입력 핸들러가 묵은 상태를 펼쳐 방금 고른 아이템을 지움 + 선택 효과가 그 사이 입력한 시작가를 지움 | e2e 를 «선택·입력 한 작업» 최악 타이밍으로 — 옛 코드 2/2 실패 → 4/4 통과 |

## 2. 보안·돈 (수정됨)

- **국회 법안** — 같은 반이면 아무 필드나 쓸 수 있었다: 벌금액 변조, 표 직접 999, 남의 표, 상태 건너뛰기,
  대통령 사칭(승인·거부권), 심의 중 법에 `finalStatus` 만 심어 **경찰서 벌금 목록에 노출**.
  → 학생 쓰기 = 허용목록 · 한 사람 한 표(voters 자기 칸, ±1) · 표수가 받쳐주는 상태 전이(과반 = 절반 초과)
  · 대통령 전이는 **임명된 대통령만**(rules 가 `users.appointedJobIds` 와 `jobs/{id}` 를 직접 확인).
- **학습게시판** — 남의 글 likes·제목·관리자 쿠폰 표시 변조, 남의 이름으로 댓글, 글은 두고 남 댓글만 삭제,
  댓글 수 임의 값 → 봉인(반응·쿠폰은 서버만, 글쓴이의 남 댓글 삭제는 글과 함께일 때만).
- **국회 법안 생성** — update 만 잠근 사이 create 로 **처음부터 «최종 가결»인 법**을 만들어 경찰서 벌금 목록에
  올릴 수 있었다(예전부터 있던 구멍 — CI create/update 대칭 검사가 첫 배포 직후 잡음) → 생성 시 결과 필드 금지.
- **개인상점** — `classCode: null` 로 만들면 **모든 학급**에 노출 → 자기 학급만. 상품은 **자기 상점에만**
  (남의 상점 id 로 진열대에 끼어들기 차단).
- **돈 CF 퍼징**(18개 CF × 13종 악성 값): 장터 판매가 0.5·1e-7 등록 성공(현금 소수 오염), 수량 `true` 수용
  → 수정 후 234회 전부 거부·무변화·internal 0. **권한 스윕**(학생 → 교사·관리자 전용 CF 31종): 유출 0.
- **대통령실 평문 비밀번호** — 쓰이지 않는 «관리자 비밀번호» 칸이 학생이 읽는 문서에 평문 저장 → 칸 제거.

## 3. 걷어낸 죽은 코드 (−13.4K줄)

- 도달 불가 파일 16개·안 쓰는 export·죽은 선언, `/doctor`·`/recover-donations`·`/audit-admin-cash` 라우트,
  죽은 설정 토글·튜토리얼, 루트 일회성 스크립트·Data Connect 스캐폴드·커밋된 로그.
- 화면 없는 기능: 옛 아이템 장터(구매 화면은 2월에 삭제, «시장에 판매» 모달은 여는 코드 없음 — 그런데
  매 로드마다 활성 매물을 헛조회), 가격 제안, 시스템 모니터링.
- **Cloud Functions 19개 삭제**(호출자 0): auditAdminCash, fixDuplicateUser, migrateDonationCashToAdmin,
  resetPasswordHttp, resolveStudentEmail, seedCourtData, backfillDrawItems, backfillSalaryLogs,
  migrateStorePriceDownManual, deduplicateStocksFunction, getAvailableSymbolsFunction,
  updateExchangeRateFunction, exchangeRateScheduler, makeOffer, respondToOffer, listUserItemForSale,
  buyMarketItem, cancelMarketSale, updateUserItemQuantity.

## 4. 재발 방지 관문 (일부러 깨서 빨강 확인함)

| 관문 | 어디서 | 막는 것 |
|---|---|---|
| `scripts/build-source.mjs --check` | deploy.yml 배포 전 | 커밋된 소스와 다른 작업 트리로 만든 build/ 배포 |
| `scripts/check-callables.mjs` | ci.yml | 화면이 부르는데 functions 에 없는 CF |
| `scripts/rules-test.mjs` +57건(346건) | 커밋 훅·수동 | 국회·게시판·개인상점 봉인 회귀 |
| `scripts/e2e/` (에뮬레이터 실조작) | 수동 | 화면 흐름·돈 보존·퍼징·권한 스윕 |
| debt-ratchet 천장 하향 | ci | 린트 억제 47→45 |

## 5. 운영자 조치 필요 (스크립트 준비, 기본 dry-run)

- `node scripts/ops/strip-gov-admin-password-2026-10-14.mjs --apply` — 평문 비밀번호가 남은 문서 1건(CLASS2025).
- `node scripts/ops/return-stuck-market-listings-2026-10-14.mjs --apply` — 옛 장터에 묶인 아이템 3건을
  판매자에게 반환(CLASS2025, 2025-12). 에뮬레이터에서 멱등·원자성 확인.

## 6. 남은 위험·설계 판단 (고치지 않음)

- 학습게시판 좋아요 담합: 친구끼리 서로 눌러 쿠폰을 모을 수 있다(글당 상한 = 반 인원/3). 교사 관리 영역.
- 법안 상태 전이 계산은 여전히 화면에 있고 rules 가 표수 근거를 재검증한다(서버 이관은 별도 과제).
- ~~거부권의 «재의결 기한»은 화면 안내용~~ → **기한이 지나면 폐기**로 바꿨다(사용자 요청, 아래 9절).
- 과반 기준을 «절반 초과»로 바꿨다 — 짝수 반은 종전보다 1표 더 필요(화면 안내 «N표 필요»도 같은 수로).
- `commentCount` 는 표시용이라 같은 반이 0~100000 정수 범위에서 바꿀 수 있다(옛 글 보정이 절대값을 씀).
- 법안 벌금은 문자열로 저장된다 — 실제 집행(processFine)은 CF 가 정수 검증.
- 주식 관리 CF 일부는 승인 교사면 전역 실행 가능(기존 설계), `alchan-kr` 롤백 사본 DB 가 firebase.json 에 남아 있음.
- 운영 사용자 1명의 현금 소수부 0.0011(최근 거래 40건엔 소수 없음 — 옛 데이터).
- `npm audit` high 4건: 빌드 도구·firebase 하위 grpc(제안 수정이 다운그레이드라 보류).

## 7. 검증 수치

- 단위 1088 통과 · oxlint 0 · functions eslint 0 error · Rules `:test` 346/346(배포 전 rules 로 돌리면 새 거부 테스트 빨강)
  · ci.yml 전 단계 로컬 통과(대칭·중복 경로·헤더·무결성·z-index·부채).
- e2e(에뮬레이터, 숨김 브라우저): 시나리오 board·wall·money·music·tasks·assembly·coupon·auction·shop·fuzz
  + 슈퍼/교사/학생 전 경로 방문 — console_errors=0.

## 8. 교차검증 기록

레인: codex(GPT) · gemini · grok(xAI) · **Claude = 메인이 합성 단계에서 직접**(지적마다 코드·e2e·rules 테스트로 재현) ·
meta(Llama, 보조 — 단독 발견은 재현 뒤에만 채택). 번들은 헌크 단위로 쪼개 레인당 입력 ≤10KB.

| 라운드 | 대상 | codex | gemini | grok | meta |
|---|---|---|---|---|---|
| 1 수정 전 전수(FULL) | functions ×2 · rules(게시판 / 국회·상점) · 학습게시판 · 국회·로그인·게시판 화면 · 대통령실 ×2 | 8/8 | 7/8(국회·상점 rules 시간 초과 → 보충 라운드로 응답 확보) | 8/8 | 8/8 |
| 2 재검증 | rules 국회·상점 ×2 · 학습게시판 ×2 (+gemini 보충 ×2) | 4/4 | 5/6(보충으로 채움) | 4/4 | 4/4 |
| 3 최종 diff | 국회 rules·화면 최종 | ✅ | ✅ | ✅ | ✅ |
| 4 수정 후 | A rules 허용목록 강화 · B usePolling·국회 화면 | ✅✅ | B ✅ / A 시간 초과(→ 5에서 rules 전체 재검) | ✅✅ | ✅✅ |
| 5 수정 후 | rules 이번 회차 전체 · 교사 법안 수정 · 경매 폼 경합 | ✅ | ✅ | ✅ | ✅ |
| 6 배포 후 CI 발견분 | rules create 구멍 2건(법안 결과 필드·남의 상점 상품) | ✅ 지적 0 | ✅ 2건(기각) | ✅ APPROVE | ✅ 지적 0 |

`full-lanes.sh check codex gemini claude grok meta` → **✅ FULL 성립 (frontier 4/4 · 권고 1/1 → 총 5계열)**.

**채택·반영(재현 후 수정)** — 게시판 댓글 수 생성 0·정수 범위, 글쓴이의 남 댓글 삭제는 글과 함께일 때만(existsAfter),
같은 반 검사, 대통령 전이는 임명 대통령만, voters 는 map, 재의결 정족수 기본값, 관리자 쿠폰 한 트랜잭션
(codex·grok·gemini), 담벼락 in-flight 키, presidentJobId 는 전이 때만, 상점 백필 빈 문자열, 심의 중 finalStatus 심기
→ 허용목록(gemini), 과반 동수(codex·grok·gemini 합의), finalStatus 값 고정·날짜 서버 시각·거부 기한 8일(codex·gemini·meta),
거부 기한 하한·updatedAt 서버 시각(codex·grok·meta), 경매 설명 칸 경합(4계열 공통).

**기각(근거)** — reactLearningPost 옛 글 기준선(옛 로직이 싫어요로 회수 → floor(net/3) = 옛 장부), 교사 자기 글 단계
소진(의도), 배열 classCode·post.coupons(오탐), 반응 낙관 갱신 이중 배열(서버가 전환 거부), currentUser.id 혼용·로그인
registeringRef·담벼락 merge·selectedBoardPosts 루프(e2e 실측 정상), «교사도 coupons 못 씀»(e2e 반박), 재의결 버튼 조건
(재의결 탭 전용), 대통령실 4건(설정 버튼이 초안 동기화·비번은 옛 문서·null 가드 존재), 벌금 정수 강제(문자열 저장,
집행 CF 가 검증), 교사 쓰기에 학생 허용목록 적용 주장(rules 가 `isClassAdmin` 을 먼저 통과시킴 — meta 3건),
updatedAt 조건이 대통령 승인을 막음(바뀐 키에만 적용 — 새 rules 로 대통령 승인·거부 e2e 통과), 트랜잭션 읽기 순서
(모든 읽기가 쓰기 전 — 재의결 e2e 통과), 정족수 기본값 비정수(Math.ceil 결과), 재의결 기한 미강제·기기 시계 7일+
지연 시 거부 실패(기한은 안내용 — 6절에 남은 위험으로 기록), 교사 수정 시 거부 필드 잔존(수동 조정, 표시 영향 없음),
생성 시 updatedAt 조건(없거나 서버 시각일 때만 통과 — 학생 제안 ALLOW 테스트 통과), 없는 상점 `get()`(오류 = 거부로 닫힘).

**8way 반영 완료** — 채택 지적은 전부 수정·재현 확인(rules `:test` 343/343, e2e console_errors=0), 기각은 위 근거.

## 9. 추가 — 재의결 기한이 지나면 폐기 (사용자 요청)

- 기한 = **거부 시각(서버 `vetoDate`) + 7일**. 대통령 기기 시각 + 7일이던 `vetoDeadline` 은 더 이상 기준이 아니다
  (기기 시계에 흔들리고, 짧게 넣으면 재의결을 막을 수 있었다).
- 세 곳이 같은 기준으로 막는다(하나만 바꾸면 `src/test/utils/vetoDeadline.test.js` 가 빨강):
  화면 `src/utils/vetoDeadline.js`(즉시 «폐기 (재의결 기한 만료)» 표시·재의결 버튼 없음) ·
  rules `naVetoOpen`(기한 뒤 학생 표·재의결 전이 거부, 폐기된 법은 학생이 못 건드림) ·
  서버 `functions/vetoExpiry.js`(매일 KST 0시 `hourlySchedulerV2` 가 status 를 `veto_expired` 로 확정, 읽은 뒤 바뀐 문서는 건너뜀).
- 교사는 폐기된 법을 «투표 초기화»로 심의중에 되돌릴 수 있다.
- 운영: 거부 9건 전부 거부 후 107~392일 — 배포 즉시 화면에서 폐기로 보이고, 다음 0시에 상태가 확정된다.
- 검증: rules 352/352(배포 전 rules 로는 새 거부 3건 빨강), e2e «기한 지난 법 → 폐기(화면·rules·스케줄러)» 옛 화면에서 빨강,
  전체 e2e 61/61 console_errors=0.
- 교차검증(7라운드, rules·서버 / 화면 두 번들): codex ✅ · gemini ✅ · meta ✅ · Claude(메인) ✅ · **grok ❌**
  (CLI 사용량 잔액 소진 402, 웹 주간 한도 — 10월 18일 초기화). → **FULL 미성립(PARTIAL, frontier 3/4)**.
  사용자 승인으로 이 상태로 배포했고, 10/18 이후 grok 보충 검증을 한다.
  채택: 서버 경계 보수 판정(밀리초 절삭 — codex). 기각: «기한 안 정상 재의결 차단»(rules 시험·e2e 로 반박),
  «select 로 읽으면 updateTime 없음»(e2e 실측 확정 1건), 오류 코드 형식(숫자 9 처리), «vetoDate 매핑 누락»(남아 있음),
  화면을 오래 열어 둔 채 기한 경과(클릭 시점 판정 + rules 가 막음).
  남은 위험: 기기 시계가 7일 넘게 틀리면 화면의 폐기 분류가 어긋날 수 있다(최종 판정은 서버 시각 rules).
