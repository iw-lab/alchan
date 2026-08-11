# 알찬 전수 코드리뷰 — 2026-08-11

대상: `HEAD=7c83a99` (워킹트리 clean) · src 183파일 78,608줄 / functions 16파일 19,542줄 / css 31파일 20,267줄
축: **성능 · Firestore 사용비용 · 서버 비용 · 코드 정렬**

## 0. 방법과 그 한계

- **Tier-0 결정론 게이트** (gitleaks 전이력 · tsc · oxlint · shellcheck · npm audit · vitest 326) — 전부 통과
- **Firestore Rules `:test` API** 43케이스 — 전부 통과(ALLOW 카나리아 포함 → 하네스가 유효하다는 뜻)
- **Cloud Monitoring / Logging / Firestore REST** 로 라이브 실측(읽기·호출·저장·에러·쿼터)
- **브라우저 실조작** — 프로덕션(교사 계정 iw-lab/BG6QUC)에서 페이지 순회, 쓰기 0

**⚠️ 세 가지 한계를 먼저 밝힌다.**
1. **지금은 방학이다.** 8월 읽기(1,000~8,000/일)는 학기 중 부하(22,000~73,000/일)를 대표하지 않는다.
   비용·부하 판단은 **7월 수치**를 기준으로 했다.
2. **브라우저 확장이 반복적으로 끊겨** 페이지별 읽기량을 개별 귀속시키지 못했다.
   아래 "10페이지 58읽기"는 **같은 기기 재방문(웜 캐시)** 합계이며, 신규 학생의 콜드 진입값이 아니다.
3. AI 교차검증은 **Claude(유지보수성)·Gemini(아키텍처/권한) 2계열이 완료**됐고 §8에 병합했다.
   codex(GPT) 계열은 보고 미제출 상태다. **§8의 모든 발견은 내가 직접 grep/Read 로 재확인한 것만 실었다**
   — 두 계열이 제기한 것 중 오탐 3건은 폐기했고, 심각도도 실사용 여부를 근거로 내가 재조정했다.

---

## 1. 결론 먼저

**깨진 것은 없다.** 게이트·규칙·테스트가 전부 통과하고, 렌더가 실패하는 화면도 없었다.
7월에 한 비용 조치는 **전부 유효하게 작동 중**이다.

문제는 **아무도 실행하지 않는 것들**에 몰려 있다.

| 심각도 | 발견 | 근거 |
|---|---|---|
| 🔴 HIGH | TTL 설계는 있는데 **집행 주체가 없다** — activity_logs 36,585건 중 12,812건(35%)이 90일 초과, 최고령 2025-08-25 | 네이티브 TTL 미설정 + `cleanupExpiredDocuments` 호출자 0 |
| 🔴 HIGH | **배포마다 Cloud Run 쿼터 초과** — 14일간 276건, 46개 함수 | 로그 실측 (08-03·08-04·08-10 전 배포일) |
| 🔴 HIGH | **public HTTP 엔드포인트 11개, 정상 호출 0건** — 쿼리스트링 토큰 하나로만 보호 | 30일 Cloud Run 실측 |
| 🟠 MED | **방학인데 `vacationMode=false`** — 주급 계속 지급 + 기본급 매주 5% 복리(배수 이미 1.1576 = 3주치) | Firestore 실측 |
| 🟠 MED | **국고 −4,544만** · 되팔기 지출 3.06억이 단일 최대 항목 · 주급 지출은 국고 원장에 집계조차 안 됨 | Firestore 실측 |
| 🟠 MED | 급여 상수(200만·50만·200만)가 서버↔클라 3곳 중복, **동기화를 강제하는 테스트 없음** | 코드 대조 |
| 🟡 LOW | `!important` 704개 중 **index.css 244 + ItemStore.css 179 = 60%** | 정적 집계 |

---

## 2. 서버 비용 — 7월 조치는 살아 있다

| 항목 | 7월 실측 | **2026-08-11 실측** | 판정 |
|---|---:|---:|---|
| Hosting 저장 | 30.35 GB (2,265버전) | **0.07 GB (FINALIZED 10개)** | ✅ 정책 정상 |
| 버전당 크기 | 85.1 MB | **7 MB** | ✅ 92%↓ (WebP·게임제거 효과) |
| Artifact Registry | 2.05 GB | **1.92 GB** | ⚠️ 바닥에 걸림 |
| Cloud Scheduler | 4개(1개 과금) | **4개(1개 과금)** | — |
| Functions 호출 | — | **3,044회 / 14일** | ✅ 무료 200만/월의 0.02% |

- **Hosting**: `maxVersions: 10` 이 정확히 작동한다. 목록에 남은 2,250개는 `DELETED`, 32개는 `EXPIRED` 로
  **과금 대상이 아니다**(목록 크기만 보고 "33GB로 되돌아갔다"고 오판하기 쉬우니 status 로 분해해서 볼 것).
- **Artifact Registry 1.92GB**: 정리정책(`keep-recent 3` + `delete-old 7d`)은 살아 있다.
  줄지 않는 이유는 배포 빈도가 아니라 **함수 개수**다 — 117개 × 3버전 × ≈5.6MB ≈ 1.9GB 가 구조적 바닥이다.
  `keepCount` 를 1로 낮추면 ≈0.64GB. 다만 절감액은 월 ₩150 수준이라 **죽은 함수 정리가 먼저다**(§5).
- **Cloud Scheduler**: 4개 중 3개까지 무료 → 1개 과금(≈₩140/월).
  `dividendSchedulerV2("0 9 1-7 * 5")` 를 `hourlySchedulerV2("0 * * * *")` 안으로 접으면 3개가 되지만,
  **배당=학생 자산이라 중대 변경(FULL) 절차가 필요**하고 절감은 연 ₩1,700이다. **비권장.**

### 🔴 배포마다 Cloud Run 쿼터를 넘고 있다

```
2026-08-10T14:09Z  33건    2026-08-04T12:51Z  37건    2026-08-03T08:24Z  28건
2026-08-10T12:08Z  39건    2026-08-04T10:54Z  38건    2026-08-03T04:07Z  35건
```
> `Could not update Cloud Run service … Quota exceeded for quota metric 'Write requests'
>  and limit 'Write requests per minute per region' of service 'run.googleapis.com'`

**14일간 276건 · 서로 다른 46개 함수.** 함수 117개를 한 번에 갱신하려다 리전당 분당 쓰기 한도에 걸린다.
CLI 재시도로 최종 배포는 성공하고 있지만(GHA success), 세 가지가 문제다:
1. 배포가 느려지고, 재시도가 소진되면 **일부 함수가 구버전으로 남을 수 있다**
2. 에러 로그가 오염돼 **진짜 장애가 묻힌다**(최근 7일 ERROR 143건 중 대부분이 이것)
3. 함수가 늘수록 악화된다

→ 조치는 §5(죽은 함수 정리)와 같은 방향이다. 함수 수를 줄이는 것이 유일하게 근본적이다.

---

## 3. Firestore 사용비용

### 읽기 추세 (Cloud Monitoring, KST 일별)
```
7/22(수) 72,992 ⚠️초과   7/26(일) 91,892 ⚠️초과(감사 스크립트 사고)
7/23(목) 27,420          8/04(화)  2,783
7/24(금) 11,133          8/10(월)  4,377
```
무료 한도는 **5만/일**. 7월(수업 중) 기준으로 한도를 넘나들었고, 8월은 방학이라 의미 없다.
**학생 1명당 하루 ≈1,775읽기**(7월 실측)가 확산 시 그대로 곱해지는 구조는 그대로다.

### 캐시는 잘 듣고 있다 (실측)
같은 기기 재방문으로 10페이지를 순회했더니 **합계 58읽기**(12:48~12:53Z, 방학이라 타 트래픽 0).
usePolling 세션캐시 · ItemContext 27분 캐시 · getClassmates 증분동기화가 실제로 효과를 내고 있다.
⚠️ 다만 이건 **웜 캐시** 값이다. 신규 기기·첫 진입 비용은 이번에 재지 못했다.

### 🔴 TTL 설계가 집행되지 않고 있다

```
activity_logs 총 36,585건
  ├ 90일 초과            12,812건 (35%)      ← TTL이 돌았다면 0이어야 한다
  ├ expireAt 필드 있음   13,513건 (37%)      ← 네이티브 TTL 적용 가능
  └ expireAt 필드 없음   23,072건 (63%)      ← ⚠️ 네이티브 TTL로도 안 지워짐
가장 오래된 문서: 2025-08-25 (약 1년 전)
Firestore 네이티브 TTL 정책: 없음
최근 3일 삭제 건수: 0
```

`cleanupExpiredDocuments` 는 **코드 주석이 스스로 경고하고 있다** — "이 엔드포인트는 저장소 안에 호출자가
없다(GHA 워크플로에도 없음)". Cloud Scheduler 4개에도 없고, 어제 삭제한 cron-job.org 잡 7개에도 없었다.
즉 **처음부터 아무도 부르지 않았다.**

**권고**
1. Firestore **네이티브 TTL 정책**을 `activity_logs.expireAt` 에 설정 — 코드 변경 0, 함수 호출 0, 읽기 0.
   (함수로 도는 것보다 압도적으로 싸다. `cleanupExpiredDocuments` 는 500건씩 읽고 지운다.)
2. 그것만으로는 **23,072건(expireAt 없는 옛 문서)이 영원히 남는다** → 일회성 정리 필요.
   ⚠️ 감사 로그이므로 **삭제 전 백업**, 그리고 학년 경계로 자르는 것이 안전하다.
3. 스케줄러를 새로 만드는 선택지는 **무료 3개를 이미 넘겼으므로 과금이 는다** — 네이티브 TTL이 낫다.

---

## 4. 성능

| 항목 | 실측 | 판정 |
|---|---|---|
| 초기 크리티컬 패스 | 928 KB (gzip **267 KB**) | 양호 |
| ├ vendor-firebase | 498 KB (gzip 149 KB) | SDK 고유 비용 |
| ├ vendor-react | 206 KB (gzip 65 KB) | — |
| ├ index.js | 106 KB (gzip 32 KB) | — |
| └ index.css | 118 KB (gzip 21 KB) | — |
| Fast 3G 전송시간 | ≈1.3초 | 양호 |
| build 전체 | 8.8 MB / 211파일 | 양호(게임 제거 후) |

**캐시 헤더는 정확하다**(실측):
`/assets/**` → `public, max-age=31536000, immutable` · `/` → `no-cache, no-store, must-revalidate`
`/avatar-shop/**` → `max-age=0`(immutable 규칙 **뒤**에 배치돼 올바르게 이긴다).

**첫 진입 쿼리 팬아웃**: 경찰서 `usePolling` **7개**, 국회 5개, 조직도 4개가 병렬로 뜬다.
TTL 캐시가 있어 재방문은 싸지만 첫 진입 지연에 그대로 영향을 준다.

---

## 5. 코드 정렬

**깨끗한 축**
- import 되지 않는 **죽은 파일은 2개뿐**(`CourtroomScene.css`, `fetchCache.test.js`)
- 급여 계산은 `functions/salaryUtils.js` 로 이미 단일화됨(과거 4곳 복제 → 과다지급 사고 후 봉인)
- 부채 천장(`scripts/debt-baseline.json`)이 alert/confirm 0 · 무설명 deps 억제 0 을 지키고 있다

**손볼 축**

### 🔴 배포된 함수 117개 중 30일간 호출 0회가 54개
방학 영향을 걷어내도 **확실히 죽은 것**은 다음 부류다:
- 일회성 마이그레이션/백필 — `reverseLastWeeklySalary`, `backfillDrawItems`, `recoverTeachersManual`,
  `initializeClassroomManual`, `backfillMusicRoomsManual`, `migrateStorePriceDownManual`,
  `migrateDonationCashToAdmin`, `deduplicateStocksFunction`, `deleteSimulationStocks`, `fixDuplicateUser`
- onSchedule V2 가 대체한 HTTP 백업 — `stockPriceScheduler`, `midnightReset`, `exchangeRateScheduler`
- 시딩 — `seedAvatarShop`, `seedAvatarShopHttp`, `seedCourtData`

(`buyMarketItem`·`purchaseRealEstate`·`createStudentAccounts` 등은 **방학이라 안 쓰인 것**이므로 대상 아님.)

### 🔴 public HTTP 엔드포인트 11개 — 정상 호출 0건
`simpleScheduler · stockPriceScheduler · midnightReset · weeklySalary · backfillSalaryLogs ·
backfillDrawItems · weeklyRent · weeklyPropertyTax · reverseLastWeeklySalary ·
economicEventScheduler · exchangeRateScheduler`

전부 `invoker: "public"` + **쿼리스트링 토큰 하나**로만 보호된다. 30일 호출 기록을 보면
잡힌 것은 (a) 어제 삭제한 죽은 cron 의 401 과 (b) 내 진단 요청뿐 — **애플리케이션 호출은 0이다.**
그 토큰은 2026-02~08 약 6개월간 공개 저장소 이력에 있었다(현재는 교체됨).
`weeklySalary`·`reverseLastWeeklySalary` 는 **URL 하나로 전교생 주급을 지급/회수**한다.

### 🟠 급여 상수 3중복 — 동기화 강제 장치 없음
`functions/salaryUtils.js` 의 `BASE 2000000 / ADDITIONAL 500000 / PRESIDENT_BONUS 2000000` 을
`AdminSettingsModal.js:820,822` 와 `:3634` 가 복제한다. 양쪽 주석이 "함께 갱신할 것"이라고 적어 두었지만
**그건 산문이고 집행되지 않는다.** 이 프로젝트는 같은 형태로 이미 한 번 과다지급 사고를 냈다.
`src/test/functions/salarySchedule.test.js` 가 크론↔UI 문구를 강제하는 것과 **똑같은 패턴**으로
상수 동기화 테스트를 두면 20줄로 막힌다.

### 🟡 `!important` 704개의 60%가 두 파일
`src/index.css` **244개** · `src/pages/market/ItemStore.css` **179개**.
index.css 의 전역 `!important` 는 이미 실제 버그를 만들었다(경찰서 "관리 설정" 버튼이 흰 글자+흰 배경으로
안 보이던 건 — index.css 의 `!important` 가 Police.css 를 이겨서 생겼다). 천장으로 막아둔 것과 별개로,
**index.css 의 전역 선택자 `!important` 는 페이지 CSS 를 계속 이긴다**는 구조적 위험이 남아 있다.

### 🟡 정상적인 사용자 오류를 ERROR 로 로깅
`parkingDeposit` 이 "보유 현금이 부족합니다"를 `severity=ERROR` 로 남긴다.
사용자 입력 검증 실패는 장애가 아니다 — 진짜 장애를 묻는다.

---

## 6. 운영 — 라이브 데이터에서만 보이는 것

### 🟠 방학인데 방학 모드가 꺼져 있다
```
Settings/scheduler            vacationMode = false   (마지막 변경 2026-07-25)
settings/salarySettings_BG6QUC  salaryBaseMultiplier = 1.1576250…  ( = 1.05³ )
                                salaryLastRaiseWeekKey = 2026-W32
                                lastPaidDate = 2026-08-10
```
주급이 방학 중에도 매주 지급되고, **기본급이 매주 5% 복리로 오르고 있다**.
배수 1.1576 은 이미 **3주치 인상**이 붙었다는 뜻 — 실효 기본급 200만 → **231만 5,250**.
방학이 4주 더 이어지면 1.05⁷ ≈ 1.41 → 약 281만에서 2학기를 시작한다.

의도한 것이면 문제없다. **다만 알고 계셔야 한다.**

### 🟠 국고 −4,544만 — 최대 유출은 주급이 아니라 되팔기다
```
nationalTreasuries/BG6QUC (누적)
  지출  buybackPayout                  305,821,828   ← 단일 최대
  수입  vatRevenue                     147,337,815
  수입  economicEventRevenue            62,154,779
  수입  propertyHoldingTaxRevenue       23,077,269
  수입  netAssetTaxRevenue              17,088,320
  … 수입 합계 270,363,962
교사(국고) 실제 현금: -45,442,794
```
- **되팔기(국고 70% 매입)로 3.06억이 나갔다.** 학생이 상점에서 산 물건을 되파는 건 −30% 손해라
  차익거래가 안 되지만, **선물·관리자 지급으로 공짜로 받은 아이템을 되팔면 순수 국고 유출**이 된다.
- **주급 지출은 이 원장에 집계되지 않는다** — `payWeeklySalariesLogic` 이 교사 `cash` 에서
  `increment(-classTotalNet)` 로 직접 빼고(마이너스 허용) 국고 문서는 건드리지 않는다.
  즉 이 문서는 "세목 통계"와 "일부 지출"이 섞여 **어느 쪽으로도 완결되지 않는다.**
- 대조군: 오석모 선생님(9BVPKP)은 세율 0.95 라 국고가 **+4,824만**이다. BG6QUC 는 세율 필드가 없어
  기본 10% 가 적용된다 — **10% 걷고 100% 지급하는 구조**라 적자가 구조적이다.

---

## 7. 권고 우선순위

| # | 조치 | 효과 | 위험 |
|---|---|---|---|
| 1 | `activity_logs.expireAt` 에 **Firestore 네이티브 TTL** 설정 | 저장·조회 비용 지속 절감, 코드 변경 0 | 낮음 |
| 2 | `expireAt` 없는 옛 로그 23,072건 **백업 후 일회성 정리** | 위와 동일 | 중(감사로그) |
| 3 | **일회성/백업 HTTP 엔드포인트 정리**(≈16개) | 공격면↓ · 배포 쿼터 압력↓ · Artifact↓ | 중(삭제 전 호출자 재확인) |
| 4 | 급여 상수 **서버↔클라 동기화 테스트** 추가(20줄) | 과거 사고 재발 차단 | 없음 |
| 5 | `vacationMode` 를 방학 동안 켤지 **결정** | 국고 유출·복리 인상 정지 | 없음(설정) |
| 6 | 되팔기 유출 3.06억 **원인 확인**(지급 아이템 되팔이 여부) | 국고 균형 | 조사만 |
| 7 | `parkingDeposit` 등 사용자 검증 실패를 `warn` 으로 강등 | 로그 신호 회복 | 없음 |

---

## 8. AI 교차검증 병합 (Claude·Gemini 2계열 — 전 건 내가 코드로 재확인)

> 방법: 세 계열에 서로 다른 렌즈를 주고 병렬 실행. Claude=유지보수성/중복, Gemini=아키텍처/권한경계,
> codex=성능/서버정확성(**미제출**). 아래는 **내가 grep/Read 로 실재를 확인한 것만** 남긴 것이다.
> 폐기한 오탐 3건: 주식 stockId fallback 0원화(상위 레이어가 이미 주입), 법원 정산금액 위조
> (실지급은 문서 필드가 아니라 onCall 파라미터를 씀), Promise.all 동시성 리스크(타임아웃 540초로 충분).

### 🔴 CRITICAL

**C1. 경제이벤트 3종이 학생 cash 를 바꾸면서 감사 로그를 하나도 안 남긴다**
`functions/economicEvents.js` — 함수별 실측:

| 함수 | `increment(` | `activity_logs` |
|---|---:|---:|
| `executeCashBonus` (L541) | 2 | **0** |
| `executeCashPenalty` (L659) | 3 | **0** |
| `executeTaxRefund` (L249) | 2 | **0** |
| `executeTaxExtra` (L327) | 3 | 4 ✅ |

**같은 파일 안에 정답 패턴이 있는데 세 곳이 안 따랐다.** 교사가 "경제 위기"(순자산 5% 차감)를 실행하면
학급 전원 현금이 줄지만 학생 "내 자산 > 거래내역"엔 아무것도 안 뜬다 — 남는 건 학급 단위 총계뿐이라
"내 돈 왜 줄었냐"에 서버가 답할 근거가 없다. 불변식 #1 · `rules-lazy/financial-saas.md` 1항 정면 위반.

**C2. 루트 `/transactions` 가 누구나 생성 가능 — 남의 거래내역을 위조할 수 있다**
`firestore.rules:1181-1182`
```
// 생성: 로그인한 사용자 (자신의 거래만)   ← 주석이 사실과 다르다
allow create: if isSignedIn();            ← userId 대조가 없다
```
그리고 `src/pages/my-assets/MyAssets.js:497-502` 가 이 **루트** 컬렉션을 `where("userId","==",userId)` 로
읽어 자산 페이지에 병합 표시한다. 즉 학생이 `addDoc(transactions, {userId: 남의UID, amount: 1억,
description: "관리자 지급"})` 로 **타인의 거래내역에 허위 항목을 심을 수 있다.**
현금 잔액 자체는 따로 봉인돼 있어 안 바뀌지만, 감사 기록의 신뢰성이 위조 가능하다.
- **수정이 안전한 근거(실측)**: `src` 전체에서 이 컬렉션에 대한 클라이언트 write 는 **0건**이다
  (유일한 등장이 위 read 쿼리). 실제 기록은 전부 CF(Admin SDK, rules 우회)가 쓴다.
  → `allow create: if false;` 로 바꿔도 깨지는 경로가 없다.
- 대조: 같은 이름의 **서브컬렉션** `users/{uid}/transactions`(:296-298)는 소유자·동일학급으로 올바르게 좁혀져 있다.

### 🟠 HIGH

**H1. `legislations/{id}/votes` 생성에 학급·신원 검증이 전혀 없다** — `firestore.rules:740`
`allow create: if isSignedIn();` (read 는 `isSameClassFast` 로 올바르게 좁혀져 있는데 create 만 열림)
→ 타 학급 학생이 남의 학급 법안 표결 문서를 무제한 생성 가능.

**H2. `goals` 수정의 학생 분기에 학급 검사가 없다** — `firestore.rules:861`
`isAdmin() || (isSignedIn() && …hasOnly(['progress','donations','currentAmount','updatedAt']))`
→ 타 학급 학생이 다른 학급 쿠폰 목표의 진행률·기부액을 조작 가능.

**H3. `users/{uid}/loans` 만 학생 write 가 열려 있다** — `firestore.rules:381`
형제인 `financials`(:360 `create,update: if false`)와 `products`(:374 `write: if isClassAdminOfUser`)는
**같은 사고(학생이 잔액 위조 → CF가 신뢰해 지급)로 이미 각각 봉인**됐는데 `loans` 만 빠졌다.
- 실측: 이 경로를 **읽는 코드 0 · 쓰는 코드 0**(`Banking.js` 의 `firestoreType="loans"` 는
  `bankingSettings/{classCode}`(교사 상품 카탈로그)로 가지 이 경로가 아니다). 대출 잔액의 실제 소스는
  `users/{uid}/products`(type=loan)이고 그쪽은 잠겨 있다.
- 즉 **죽은 경로 + 열린 rules** — 즉시 악용 경로는 없지만 이 프로젝트가 이미 당한 패턴이라 `if false` 로 통일 권고.

**H4. 주식 매수/매도가 거래내역에 항상 2줄로 보인다**
- 서버가 진실원을 쓴다: `functions/index.js:4881`(`type:"stockBuy"`) / `:5147`(`"stockSell"`)
- 클라가 **또 쓴다**: `src/pages/banking/StockExchange.js:1536` / `:1695` 가 `logActivity(...)` 로
  루트 `activity_logs` 에 `ACTIVITY_TYPES.STOCK_BUY`(='주식 매수') 를 추가 기록
- `MyAssets.js:621-628` 의 cross-dedupe 는 키가 `${type}_${weekKey}` 인데 **주식 기록엔 weekKey 가 없고**
  (`!tx.weekKey → 항상 keep`), 게다가 타입 문자열도 서버(`stockBuy`)와 클라(`주식 매수`)가 달라
  **두 겹으로 걸러지지 않는다.**
- 잔액은 정확하다(서버가 1회만 차감). 표시만 중복. 같은 버그를 급여에서 이미 겪고 dedupe 를 만들어 뒀는데
  주식엔 안 걸렸다. 안전한 수정 = 클라 `logActivity` 2곳 제거(서버 기록이 이미 화면에 뜬다).

### 🟡 MEDIUM

**M1. 주급 스케줄러가 같은 실행에서 `users` 를 두 번 전체스캔한다**
`scheduler-http.js:1907`(`getAllActiveClassCodes`)이 `users where isAdmin==false` 를 전량 읽고,
같은 함수 흐름의 `:2029`(`allStudentsSnap`)가 **완전히 같은 쿼리를 다시** 한다
(바로 위 줄 주석은 "Firestore 쿼리 최소화"라고 적혀 있다). 1,000명이면 주 1회 1,000이 아니라 2,000 읽기.
`getAllActiveClassCodes()` 는 스케줄 함수 6곳에서 각각 호출되므로 **"스케줄 함수 개수 × 전체 학생 수"**
로 스케일된다 — 지금 절대량은 작지만 스케줄 함수를 추가할 때마다 반복될 구조다.

**M2. rules 파일이 스스로 금지한 것을 한 곳에서 어긴다** — `firestore.rules:1297`
파일 상단(100-101행)이 "`*Fast` 클레임은 stale(≤1h) 할 수 있으니 **읽기 규칙에만** 쓰고 쓰기엔 문서기반
헬퍼를 유지한다"고 못 박아 뒀는데, 전수 집계 결과 `*Fast(` 89회 중 **read 85 · write 1**이고
그 1건이 `shopProducts` update 분기다. 학급 이동 직후 최대 1시간 동안 이전 학급 개인상점의
재고·구매자목록을 수정할 수 있는 좁은 창.

**M3. 순자산 계산이 3중 독립 구현** — `src/utils/netAssets.js` / `scheduler-http.js:2408` /
`economicEvents.js:599`. 부동산 매칭이 실제로 다르다((b)만 `owner`+`ownerId` union, 나머지는 `owner`만).
현재는 모든 write 경로가 `owner` 를 채우므로 **결과가 같고 드리프트는 미관측**이지만,
`salaryUtils.js` 처럼 공유 모듈로 뽑혀 있지 않고 `economicEvents.js` 를 import 하는 테스트가 0개다.
`netasset_unify.md` 가 기록한 과거 사고와 같은 계열.

**M4. 4,028줄 모달 안에서 같은 공식이 3번 재인라인** — `AdminSettingsModal.js:794-797` / `:819-823` / `:3633-3639`.
`:3674` 주석이 2026-07-27에 "계산 예시"와 "현재 기본급"이 다른 숫자를 보인 사고를 증언하는데,
그 수정은 `:3678`만 고쳤고 `:3633-3634`는 여전히 독립 인라인이다 — **같은 화면 안에서 수정이 반쪽만 됐다.**

**M5. 자산을 다루는 functions 6파일의 테스트 커버리지 0**
`economicEvents.js`(C1을 낸 파일), `index.js` 의 buyStock/sellStock 본체, `groupPurchaseService.js`,
`avatarShopService.js`, `dividendService.js`, `realStockService.js` — 이 파일들을 import 하는 테스트가 0개다.
(`stockCalculator.test.js` 는 클라이언트 추정치만 검증하고 서버 진실원은 안 건드린다.)

### 잘 되어 있어 두 계열 모두 "발견 없음"이라 한 것
- 학급 격리 **read** 규칙 — `isSameClassFast`/`isSameClass` 배치가 85/89 정상
- 빈 `catch {}` 4곳은 전부 합리적 fail-open 기본값
- 사이드바 라벨 ↔ 페이지 제목 ↔ 함수명 불일치: 사고를 부를 만한 강한 불일치 없음
- 함수/분기 단위 죽은 코드: 낡은 TODO 배너 1건 외 없음

---

## 8b. codex(GPT) 계열 병합 — 새 CRITICAL 2건 포함 (전 건 내가 코드로 재확인)

### 🔴 C3. 음수 가격 종목으로 **현금을 무담보 발행**할 수 있다
- `functions/scheduler-http.js:1515` — `addStockDocFunction` 의 검증이 **진위(truthy) 검사뿐**이다:
  `if (!stock || !stock.name || !stock.price || !stock.minListingPrice)` → `price: -100` 은 truthy 라 **통과한다.**
  권한도 `checkAuthAndGetUserData(request, true)` = **학급 교사면 충분**(슈퍼관리자 아님), 쓰는 곳은 학급 구분이 없는 **전역** `CentralStocks`.
- `functions/index.js:4857-4866` — `buyStock` 이 `stockPrice = stockData.price || 0` 으로 읽고 **양수·유한 검증을 하지 않는다.**
- 연쇄: `cost = -100 × 10 = -1,000` → `totalCost` 음수 → 잔액 검사 `currentCash < totalCost` 가 **거짓**이라 통과 →
  `cash: increment(-totalCost)` = **increment(+1,015) → 현금이 늘어난다.**
- 전역 종목이라 **모든 학급 학생이 노출**된다. 교사의 단순 오타(`-100`)로도 조용히 열린다.
- 이 프로젝트는 이미 money glitch 사고를 한 번 겪었다([[security_audit_2026-07]]).

### 🔴 C4. 주급 중복지급 락이 **원자적이지 않다** (불변식 #3 위반)
`functions/scheduler-http.js:2013-2019`
```js
const salaryLockDoc = await db.collection("schedulerLocks").doc("weeklySalary").get();
if (!forceRun && … weekKey === weekKey) return { skipped: true };
await db.collection("schedulerLocks").doc("weeklySalary").set({ weekKey, … });  // ← 별개 쓰기
```
두 실행이 동시에 "이번 주 락 없음"을 읽으면 **둘 다 지급을 진행**한다. 지급이 `increment()` 라 **두 번 다 누적**된다.
- 경로는 둘: `weeklyEconomySchedulerV2`(onSchedule, Cloud Scheduler 는 at-least-once) 와
  `weeklySalary`(public HTTP). 메모리에는 "두 경로가 락 문서를 공유하므로 이중지급 없음"이라 적혀 있는데,
  **그 전제는 check-and-set 이 원자적일 때만 성립한다.**
- **정황 증거**: 저장소에 `reverseLastWeeklySalary`("🚨 일회성 회수 endpoint — 2026-04-13 중복지급 롤백")가
  존재한다. 즉 **중복지급은 이미 한 번 실제로 일어났다.**
- 수정: check-and-set 을 `db.runTransaction()` 안으로. 자산 경로라 배포 전 FULL 필수.

### 🟠 H5. 배당에 멱등 가드가 없다 — `functions/dividendService.js`
`monthKey` 도 수령자별 완료 마커도 없다(`paidAt`·`lastDividendPaidAt` 은 기록용 타임스탬프일 뿐 판정에 안 쓰인다).
450건 단위 중간 커밋이 있어 **부분 실패 후 재실행하면 이미 받은 보유분에 또 지급**된다.

### 🟠 H6. onSchedule 4개 전부 **실패를 성공으로 보고한다**
`stockPriceSchedulerV2` · `weeklyEconomySchedulerV2` · `hourlySchedulerV2` · `dividendSchedulerV2` —
전부 최상위 `catch` 후 **재throw 하지 않는다**(실측: 4/4). Cloud Scheduler 는 함수가 정상 종료한 것으로 보고
**재시도하지 않는다.** 주급이 통째로 실패해도 대시보드는 초록색이다.

### 🟠 H7. 합의금에 **상한도 송금자 잔액 검사도 없다** — `functions/index.js:9029`, `:9137-9140`
`parseInt` 후 `<= 0` 만 막고 `increment(-settlementAmount)` / `increment(+settlementAmount)` 로 이체한다.
**경찰청장은 학생 직업이다.** 그 학생이 합의금 10억을 지정하면 상대 학생 현금이 깊은 음수로 간다(제로섬이라 민팅은 아님).
- ⚠️ **판정 정정**: §8 도입부에서 폐기한 Gemini 오탐("문서의 `settlementAmount` 필드를 위조")과 **다른 주장이다.**
  당사자·금액은 이미 2026-07-15 교차검증으로 신고 문서에서 파생하도록 고쳐졌고 멱등성도 있다(`settlementPaid`).
  남은 공백은 **onCall 파라미터 `amount` 자체의 상한·잔액 미검증**이며, 이건 실재한다.

### 🔴 C4 + H6 는 **같이** 고쳐야 한다 (단독 수정이 오히려 나쁘다)
락은 **지급 시작 전에** 걸린다(`:2019`). 그래서 지급 도중 예외가 나면 **락은 그 주 키로 남고**
다음 실행은 "이미 지급 완료"로 건너뛴다 → **그 주 주급이 영구 누락된다.** 그런데 onSchedule 이
에러를 재throw 하지 않으므로(H6) **아무도 그 사실을 모른다.**
- H6만 고치면: 재시도는 걸리지만 락에 막혀 여전히 못 준다.
- C4만 고치면: 중복은 막히지만 실패는 여전히 조용하다.
→ ① 락을 `runTransaction` 으로 원자화하고 ② 지급 실패 시 락을 해제(또는 완료 마커를 지급 후로 이동)하고
③ 최상위 에러를 재throw — 셋을 한 묶음으로.

### 🟠 배포 워크플로에 동시성 가드가 없다 — `.github/workflows/deploy.yml`
`concurrency:` 키가 **파일 전체에 없다**(실측). 그리고 `:95` 가 매번 `firebase deploy --only functions` 로
**117개 전체**를 배포한다. 연속 push 시 두 배포가 겹쳐 같은 리전 쓰기 쿼터를 나눠 쓰면서 §2의 쿼터초과를 악화시킨다.
- **가장 싸고 안전한 즉시조치**: `concurrency: {group: deploy-${{ github.ref }}, cancel-in-progress: false}` 3줄.
  코드·자산 로직 무변경.
- 그 다음: 변경된 함수만 `--only functions:a,functions:b` 로 선별 배포(10개 이하 배치).
- 참고: 관측된 에러는 **Cloud Run Admin API 쿼터(180/60초, 증액 가능)** 이고, 별개로 Cloud Functions 2세대
  배포 쿼터(60/60초)는 증액 불가 — 증액 요청만으로는 해결되지 않고 배치·속도 제어가 병행돼야 한다.

### 🟡 그 밖에 확인한 것
- **감사 로그 누락이 C1 범위보다 넓다** — 쿠폰 기부/판매/선물(`index.js:1174-1187,1318-1324,1395-1408`),
  현금효과 아이템(`:6248-6278`), 자동 적금(`scheduler-http.js:1872-1885`), 배당(`dividendService.js:132-156`,
  `activities` 라는 감사경로 밖 컬렉션에 기록). 그리고 공통 `logActivity()`(`utils.js:97-99`)가
  **로그 실패를 삼켜서**, 이걸 await 한 자산 트랜잭션도 로그 없이 정상 커밋될 수 있다.
- **읽기가 인원 수에 선형 비례하는 지점 8곳**(codex 정적분석) — `AuthContext.getClassmates`,
  `MoneyTransfer`(진입+송금 후 두 번 전원 재조회), `AdminPermissionManager`, `Banking`/`ParkingAccount`(학생마다
  products 서브쿼리 = 2M), `SuperAdminDashboard`(한 진입에 users 를 4경로가 각각 = 4N),
  `StudentManager`/`PoliceStation`/`RealEstateRegistry` 폴백 중복, `PersonalBoard`(글마다 댓글 쿼리 N+1).
  → §3의 "학생 1인당 1,775읽기가 확산 시 곱해진다"의 **구체적 원인 목록**이다.
- **코드 스플릿은 이미 끝나 있다**(App 라우트 4개·페이지 35개 전부 lazy, eager 0). 남은 병목은
  `AlchanLayout.js` 가 lazy 컴포넌트의 형제 함수(`getStreakInfo`)를 **정적 import** 해서 그 모듈이
  Layout 청크에 딸려 들어오는 것(실측 198KB / gzip 60KB, 로그인한 전원이 필수 수신).
- **다중 탭 조정 장치가 전무하다**(`BroadcastChannel`/`navigator.locks` grep 0) — 탭마다 리스너·재조회가 곱해진다.
- `JSON.stringify(userData).includes("alchan21")` 테스트계정 우회(`index.js:4997-5007`) — **Claude·codex 두 계열이
  독립적으로 지적**. 학생이 닉네임에 `alchan21` 을 넣으면 매도잠금을 우회한다.
- `repairStudentLogin`(`index.js:10047`)은 **이미 2026-08-03에 좁혀졌다**(Auth 계정이 아예 없을 때만, 기존 계정 불가).
  잔여 위험은 "고아 계정(Firestore 문서는 있는데 Auth 없음)이 실재하는가"에 달려 있고 **미확인**이다.

---

## 9. 최종 조치 순서 (§7 + §8 + §8b 통합)

### ⚖️ 심각도 최종 판정 (Tier-3 종합 — 내가 codex 의견을 받아 2건 하향했다)

기준을 명시한다: **CRITICAL = 돈이 틀릴 수 있다. HIGH = 돈은 맞지만 기록·권한이 틀린다.**

| 항목 | 내 초기 등급 | codex | **최종** | 근거 |
|---|---|---|---|---|
| C1 경제이벤트 감사로그 누락 | CRITICAL | HIGH | **HIGH** | 금액은 정확하다. 설명 불가일 뿐 — codex 판단이 옳다 |
| H4 주식 거래내역 2줄 | HIGH | MEDIUM | **MEDIUM** | 표시만 중복, 잔액 정확 — codex 판단이 옳다 |
| C2 루트 transactions 위조 | CRITICAL | — | **HIGH** | 같은 기준 적용(돈은 안 움직인다). 단 HIGH 중 최상위 — 능동적 위조라 C1보다 나쁘다 |

**최종 집계: CRITICAL 2 · HIGH 6 · MEDIUM 8**
CRITICAL 로 남는 것은 **C3(무담보 민팅)** 과 **C4(주급 중복지급)** 둘뿐이다. 둘 다 실제로 돈이 틀린다.

---

**A그룹 — 돈이 틀릴 수 있다. 즉시 (배포 전 FULL 재검증 필수)**

| 우선 | 조치 | 크기 | 근거 |
|---|---|---|---|
| 1 | **C3** `addStockDocFunction` 가격 양수·유한 검증 + `buyStock` 서버측 가격 재검증 | 각 2~3줄 | 무담보 민팅 |
| 2 | **C4+H6 묶음** 락 원자화 + 실패 시 락 해제 + onSchedule 재throw | ~15줄 | 이미 한 번 중복지급 발생 · 단독 수정은 오히려 나쁨 |
| 3 | **H5** 배당 `monthKey` 멱등 가드 | ~15줄 | 부분실패 재실행 시 중복지급 |
| 4 | **H7** 합의금 상한 + 송금자 잔액 검사 | 3줄 | 경찰청장 = 학생 직업 |

**B그룹 — 기록·권한. 대부분 1~2줄, 자산 로직 무변경**

| 우선 | 조치 | 크기 |
|---|---|---|
| 5 | **C2** 루트 `transactions` `allow create: if false` (클라 write 0건 확인) | 1줄 |
| 6 | **H1·H2·H3** rules 3곳(votes·goals·loans) 잠금 | 각 1~2줄 |
| 7 | **C1** 경제이벤트 3종 + 쿠폰/아이템/적금에 감사 로그 추가 | 패턴 복붙 |
| 8 | `deploy.yml` **concurrency 가드** 3줄 | 3줄 |
| 9 | **H4** StockExchange 클라 `logActivity` 2곳 제거 | 2줄 |
| 10 | `activity_logs` **네이티브 TTL** + 옛 문서 23,072건 정리 | 설정 + 스크립트 |
| 11 | 일회성/백업 HTTP 엔드포인트 정리(≈16개) | 공격면·배포쿼터·Artifact 동시 해결 |
| 12 | `alchan21` 매직스트링 · 급여 상수 동기화 테스트 · **M4** 인라인 통일 | ~30줄 |

**C그룹 — 운영 판단(코드 아님)**: `vacationMode` 결정 · 되팔기 3.06억 원인 확인 · 고아 Auth 계정 존재 여부 점검

**하지 말 것으로 판단한 것**
- Cloud Scheduler 3개로 줄이기 — 연 ₩1,700 아끼자고 배당(자산) 로직을 건드릴 이유가 없다
- Artifact `keepCount` 3→1 — 죽은 함수 정리가 먼저다. 그 후 재평가
- App Check 강제 — 이미 60일 실측으로 이득<위험 결론이 나 있다([[appcheck_enforce_decision]])

---

## 10. 조치 실행 기록 — 2026-08-11 (A그룹 + B그룹 전량)

리뷰 발행 당일 A·B 그룹을 전부 구현했다. 아래는 **무엇을 어떻게 고쳤고, 그게 맞다는 근거가 무엇인지**다.

### A그룹 — 돈이 틀릴 수 있던 것

**C3 무담보 민팅 (CRITICAL)** — 방어를 두 겹으로 놨다.
- 입구: `addStockDocFunction` 가 `price`·`minListingPrice` 를 유한 양수로 검증(+`volatility` 0~1).
  종전 `!stock.price` 는 진위 검사라 `-100` 이 통과했다.
- 소비지점: `buyStock`·`sellStock` 이 트랜잭션 안에서 `stockData.price` 를 다시 검증.
  **이쪽이 진짜 방어선이다** — 입구를 하나 더 만들어도 여기서 막힌다.
- 🔬 **라이브 확인: 음수·비정상 가격 종목 0/22개.** 잠재 구멍이었지 터진 적은 없다.

**C4+H6 주급 락 (CRITICAL)** — 리뷰가 지목한 대로 **한 묶음**으로 갔다.
- 판정을 순수 함수로 분리: 신규 `functions/periodLock.js` `decideClaim()`.
  Firestore 트랜잭션 안에 있으면 테스트할 수 없어서다(`salaryUtils.js`·`taxMath.js` 와 같은 배치).
- 점유를 `runTransaction` 으로. 상태를 셋으로 나눴다 — `in-progress` / `completed` / `failed`.
  **건너뛰기는 `completed` 에서만** 일어난다(종전엔 시작 시점에 완료 표시가 박혔다).
- 실패하면 락을 푼다(`failed` → 다음 실행이 **즉시** 재점유). 프로세스가 통째로 죽어 해제조차 못 하면
  20분 stale 회수가 최후 안전망이다.
- 구버전 호환: `status` 필드가 없는 문서는 '완료'로 읽는다.
  🔬 **라이브 락 문서 실측 — `{weekKey:"2026-W32", startedAt, lastPayDate}`, status 없음.**
  이 분기가 없으면 배포 직후 W32 주급이 한 번 더 나간다. 테스트로 못 박았다.
- 재시도가 안전하도록 **학급 단위 멱등 마커** `salaryLastPaidWeekKey` 를 지급 batch 와 같은 커밋에 넣었다.
  batch 는 원자적이라 "지급했는데 마커가 없다"가 불가능하다.
- onSchedule 4개 전부 재throw.

**⚠️ 리뷰 §8b 의 서술 하나를 실측으로 정정한다.**
"Cloud Scheduler 는 at-least-once … 재시도하지 않는다"고 썼는데, 배포된 4개 job 을 실제로 조회하니
**`retryConfig = {}` = retryCount 0** 이었다. 즉 재throw 의 효과는 *자동 재시도*가 아니라 **가시성**이다
(실패가 실패로 보이고 알림을 걸 수 있다). H6 의 원래 문제제기 — "주급이 통째로 실패해도 대시보드는 초록색" —
은 그대로 유효하고, 부수적으로 "재throw 가 배당 중복지급을 부른다"는 걱정은 성립하지 않았다.

**H5 배당 멱등 (HIGH)** — 여기서 리뷰에 없던 걸 하나 더 찾았다.
- 보유분별 `lastDividendMonthKey` 마커를 지급 batch 와 같은 커밋에.
- 🔬 **그런데 마커만 넣으면 더 나빠진다**: 세금이 **끝에 한 번만** 국고·교사에게 반영되고 있었다.
  중간 batch 가 커밋된 뒤 죽으면 학생 현금은 늘었는데 세금은 아무 데도 안 들어간다 —
  그만큼이 무에서 생긴다. 그리고 마커가 생기면 재실행이 건너뛰면서 **그 유실이 영구화**된다.
  → 세금을 batch 단위로 함께 커밋하도록 재구조화(`flushBatch`). 커밋된 batch 는 항상
  "지급 + 그 세금 + 마커"가 짝이다. **C4+H6 과 똑같은 구조의 함정이었다.**
- 계산식을 `functions/dividendMath.js` 순수 모듈로 분리(M5 의 "자산 파일 테스트 0" 일부 해소).
- 수동 엔드포인트에 `?monthKey=YYYY-MM` 을 열어 뒀다 — 멱등이 생겼으니 누락된 달을 되짚을 통로가 필요하다.

**H7 합의금 (HIGH)** — 같은 앱의 **법원 합의**(`processCourtSettlement`)가 이미
`Number.isInteger(amount) && 0 < amount <= 100억` + 송금자 잔액 검사를 하고 있었다.
경찰서 합의금만 빠져 있었던 것이라, 새 기준을 만들지 않고 형제와 같은 기준으로 맞췄다.

### 리뷰 범위 밖에서 추가로 찾은 것

**학급 하나가 실패하면 그 학급은 그 주 주급을 영영 못 받았다.** 주급 루프는 학급별 예외를 잡아
`classErrors` 에 담고 계속 진행하는데, 끝에서 락이 무조건 '완료'로 박혔다 — 재시도 경로가 없었다.
멱등 마커가 생기기 **전에는 이걸 고칠 수 없었다**(재실행하면 성공한 학급이 두 번 받으니까).
이제 `salaryLastPaidWeekKey` 가 성공한 학급을 건너뛰므로, 실패가 하나라도 있으면 락을 `failed` 로
남겨 재실행 시 **그 학급만** 재시도하게 했다. 마커가 열어 준 개선이다.

**금요일 징수는 한쪽이 터지면 다른 쪽도 안 돌았다.** 재산세가 throw 하면 월세까지 건너뛰었다.
둘은 독립된 락을 쓰므로 각각 돌리고, 실패는 모아서 마지막에 던지도록 했다.

**적금 자동납입에 일 단위 멱등 마커가 없었다.** 호출 경로가 둘(`hourlySchedulerV2` 자정 분기 ·
`midnightReset` public HTTP)인데 어느 쪽도 원자적 락이 아니었고, 하루 두 번 호출되면 **두 번 빠진다**
(학생→교사 현금 이체). 상품별 `lastDepositDate` 를 트랜잭션 안에서 읽고 쓰도록 했고,
두 경로가 **같은 락 문서**를 원자적으로 점유하게 했다. 재산세·월세도 같은 락으로 전환.

### B그룹 — 기록·권한

| 항목 | 조치 | 근거 |
|---|---|---|
| C2 | 루트 `transactions` `create: if false` | 클라 write 0건 실측 |
| H1 | `legislations/*/votes` `create: if false` | **라이브 문서 0건 · 코드 참조 0줄** = 미사용 |
| H2 | `goals` update 에 `isSameClassFast` + classCode 불변 | 라이브 goals 전부 classCode 보유 확인 |
| H3 | `loans` write 를 `isClassAdminOfUser` 로 | 형제(financials·products)와 기준 통일 |
| C1 | 경제이벤트 3종에 감사로그(배치 400→200) | 같은 파일 `executeTaxExtra` 패턴 복제 |
| — | `deploy.yml` concurrency(`cancel-in-progress: false`) | 중간에 끊으면 일부 함수만 갱신된다 |
| H4 | StockExchange 클라 중복 `logActivity` 2곳 제거 | 서버가 진실원을 이미 쓴다 |
| — | `alchan21` 매직스트링 → `isTestAccount` 플래그 | 아래 참조 |
| M4 | 급여 상수 인라인 복제 → `CLIENT_SALARY` 통일 | 아래 참조 |

**`alchan21` 우회** — 종전은 `JSON.stringify(userData).includes("alchan21")`, 즉 **문서 아무 필드에나**
그 문자열이 있으면 통과였다. 🔬 라이브 스캔: 88명 중 1건, `email` 필드에서 매칭.
그런데 users update 규칙은 **블록리스트** 방식이라 학생이 임의의 새 필드를 자기 문서에 추가할 수 있다
→ 스스로 매도 잠금을 풀 수 있었다. 이제 `isTestAccount === true` 하나만 보고, 그 필드와 `email` 을
본인수정 블록리스트에 올렸다(email 은 문서 **생성 시에만** 쓰인다 — 클라 수정 경로 0건 확인).
- ⚠️ **운영 조치 필요**: 기존 테스트 계정에 `isTestAccount: true` 를 설정해야 우회가 되살아난다.
  안 하면 그 계정도 1시간 매도 잠금을 그대로 받는다(기능 손상 아님, 편의 상실).

**M4 급여 상수** — 리뷰가 "`:3678`만 고치고 `:3633-3634`는 남았다"고 지적한 그대로였다.
같은 화면의 "현재 기본급" 칸이 여전히 공식을 인라인하고 있었다. 둘 다 `effectiveBaseSalary` 로 통일하고,
클라 상수를 `src/utils/salaryCalculator.js` 한 곳에 모았다.

### 검증

| 검사 | 결과 |
|---|---|
| vitest 전체 | **366/366** (기존 313 + 신규 53) |
| Firestore Rules `:test` | **58/58** (기존 43 + 신규 15, ALLOW 카나리아 포함) |
| Rules **뮤테이션 검사** | 봉인을 되돌린 사본에서 신규 DENY **7건이 정확히 실패** → 하네스가 실제로 탐지한다 |
| 급여상수 **뮤테이션 검사** | 서버 `ADDITIONAL` 을 60만으로 바꾸니 동기화 테스트가 실패 → 드리프트를 잡는다 |
| eslint(functions) · oxlint(src) | 신규 경고 0 |
| `npm run build` · `check:build` · `check:headers` | 통과 |

**신규 테스트 53개가 지키는 것**: 락 상태기계(중복지급·영구누락 양방향, 구버전 문서, 경계 1ms),
배당 계산(세전=세금+세후 항등, 음수/NaN/Infinity 가격, KST 월경계), 급여 상수 서버-클라 동기화,
rules 4곳 봉인(+ALLOW 카나리아).

### C그룹 — 리뷰가 "미확인"으로 남긴 질문 하나는 실측으로 닫았다

**고아 Auth 계정 (§8b 잔여 위험)** — 🔬 측정했다.
Firestore user 문서 88건 vs Auth 계정 100건을 UID 로 대조한 결과:
- **고아 Firestore 문서(Auth 없음) = 0건.** `repairStudentLogin` 은 "Auth 계정이 아예 없을 때만"
  동작하도록 2026-08-03에 좁혀져 있으므로, **지금 노릴 대상이 하나도 없다.** 잔여 위험 = 0.
- 반대 방향인 고아 Auth 계정(문서 없음) = 12건. 삭제된 학생의 잔여물이다. 보안 구멍은 아니지만,
  그 계정으로 로그인하면 AuthContext 가 `classCode:"미지정"` 빈 문서를 새로 만든다 — 위생 항목.

**되팔기** — activity_logs 최근 60일 집계에서 "아이템 판매" 74건 **+3,850만원**.
리뷰의 누적 3.06억과 정합적이다(60일치가 그 비율). 금액이 큰 건 맞지만 **버그의 증거는 없다** —
상점가 70%라 차익거래가 성립하지 않고, 국고 부재 시 지급이 차단된다. 교사가 상한을 둘지 말지의
**정책 결정**이지 코드 결함이 아니다.

### 아직 안 한 것 (C그룹 잔여 + 잔여 B)

`vacationMode` 결정 · 되팔기 한도 정책 — **운영 판단이라 코드로 못 정한다.**
`activity_logs` 네이티브 TTL · 일회성 HTTP 엔드포인트 정리(≈16개) — 별건으로 남긴다
(TTL 은 Firestore 콘솔 설정 + 옛 문서 23,072건 정리 스크립트가 필요하고, 엔드포인트 정리는
배포 쿼터·Artifact 와 함께 다뤄야 효과가 있다).

---

## 11. 교차검증 2라운드 (수정본 재검증) — 2026-08-11

수정본을 3계열에 다시 걸었다. **두 계열이 서로 다른 "빠뜨린 곳"을 하나씩 잡았고, 둘 다 실재했다.**

| 계열 | 판정 | 발견 |
|---|---|---|
| Gemini | REQUEST_CHANGES | CRITICAL 1 · WARNING 1 · NIT 1 |
| Claude | APPROVE | MEDIUM 1 · LOW 1 · NIT 1 |

**전 건 채택했다(5건).** 오탐 0건 — 드문 일이라 적어 둔다.

### 🔴 Gemini CRITICAL — 수동 엔드포인트 2개가 새 락 프로토콜 밖에 남았다
`exports.weeklyRent`(:811) · `exports.weeklyPropertyTax`(:855)가 **같은 락 문서**
(`systemState/lastWeeklyRent`·`lastPropertyTax`)를 쓰면서 구 패턴(`.get()` 후 별개 `.set()`)이었다.
죽은 코드가 아니다 — `index.js:49,51`이 export 하고 `.github/workflows/scheduler.yml` 의
workflow_dispatch 가 지금도 호출한다.
- 내가 확인하니 **Gemini 지적보다 나빴다**: 이 엔드포인트들은 락을 징수가 **끝난 뒤** 걸어서
  실행 중에는 점유가 아예 없었다. 자동 cron 과 수동이 겹치면 재산세·월세가 이중 징수된다.

### 🟠 Claude MEDIUM — 배당에 실행 단위 락이 없다
`lastDividendMonthKey` 마커는 루프 시작 때 뜬 **트랜잭션 밖 스냅샷**에서 읽힌다.
순차 재호출은 막지만 **동시 실행**은 못 막는다 — 두 실행이 겹치면 둘 다 "아직 안 받음"을 보고 이중 지급.

### 그래서 구조를 바꿨다 — 이게 이번 라운드의 진짜 교훈
같은 실수를 **두 번** 했다. 원인은 락 헬퍼가 `scheduler-http.js` 안의 지역 함수였다는 것이다.
그러면 다른 파일의 진입점은 **구조적으로** 규약 밖에 남는다.
- 신규 `functions/periodLockStore.js` — Firestore 바인딩 헬퍼를 공유 모듈로. (판정은 여전히 순수 `periodLock.js`)
- 배당 락은 호출부가 아니라 **`payMonthlyDividends` 안쪽**에 넣었다. 진입점이 둘이라 호출부에 두면 또 빠뜨린다.
- 전수 재조사에서 `reverseLastWeeklySalary`(주급 회수)도 같은 패턴인 걸 추가로 발견 —
  두 번 돌면 학생에게서 **두 번 빼앗는다**. 단, 여기만 실패 시 락을 **일부러 안 푼다**:
  부분 회수를 자동 재시도하면 이미 회수된 학생이 또 당한다(학생 단위 마커가 없다). 사람이 판단해야 한다.
- **최종: 락 문서를 만지는 8곳 전부 원자적 프로토콜. 구 패턴 0건.**

### 내가 내 리뷰를 어긴 것도 고쳤다
`goals` 규칙에 `isSameClassFast`(읽기 전용 헬퍼)를 썼는데, **§8 M2 가 "rules 파일이 스스로 금지한 것을
어긴다"고 지적한 바로 그 패턴**이다. 두 번째 위반을 내가 추가한 셈이라 문서 기반 `isSameClass` 로 바꿨다.
읽기 1회를 아끼려고 규약을 깨는 건 앞뒤가 안 맞는다.

주석도 실측에 맞췄다 — 재throw 4곳에 "Cloud Scheduler 가 재시도한다"고 적었는데,
측정값은 `retryCount 0` 이었다. 효과는 재시도가 아니라 **가시성**이다.

### HARD 룰(financial-saas 4단계) 대조에서 하나 더 나왔다
1항 "cash 변경 함수는 반드시 감사 로그를 남긴다"로 전 변경을 훑다가 발견:
**배당은 `activities` 컬렉션에만 기록하고 있었다.** 그런데 학생 "내 자산 > 거래내역"이 읽는 건
`activity_logs` · `users/{uid}/transactions` · `transactions` 셋뿐이고(실측),
`activities` 의 dividend 기록을 읽는 화면은 **0곳**이다.
→ **배당을 받아도 학생 화면엔 아무것도 안 떴다.** 배당은 이 앱에서 대가 없이 현금이 느는
유일한 경로라 설명 근거가 없으면 가장 나쁘다. `activity_logs` 로 옮기고 스키마(type·amount·description)를 맞췄다.
- 대조: 개인상점(`index.js:4054`)은 **둘 다** 쓴다(감사로그 + 판매내역 뷰). 배당만 한쪽이 빠져 있었다.
- 2항(절대값 덮어쓰기): 신규 추가분 전수 검사 — `cash:` 직접 대입 **0건**, 전부 `increment()`.

### 2라운드 후 검증

| 검사 | 결과 |
|---|---|
| vitest | **369/369** |
| Rules `:test` | 58/58 |
| gitleaks(워킹트리 12.9MB) | 시크릿 **0건** |
| eslint(functions 전체) · oxlint(src) | 신규 경고 0 |
| build · check:build · check:headers | 통과 |
| require 순환 | 없음(periodLock ← periodLockStore ← dividendService) |

### 이 수정이 읽기 비용을 늘렸는가 — 실측

리뷰의 축 하나가 "Firestore 사용비용"이었으니, 내 수정이 그걸 악화시키지 않았는지도 재야 한다.

| 추가된 읽기 | 빈도 | 월 합계 |
|---|---|---:|
| 락 점유(`claimPeriodLock`) — 락문서 1건 | 주급 주1 · 재산세/월세 주1 · 자정리셋 일1 · 배당 월1 | **< 40** |
| 적금 트랜잭션 내 `productRef` | 활성 적금 상품당 일1 — 🔬 **현재 0건** | **0** |
| `goals` 규칙 `isSameClass`(문서기반) | 쿠폰 기부 시 1 | 저빈도 |
| 회수 엔드포인트 409 응답용 `.get()` | 수동 · 중복 호출 시에만 | ≈0 |

**월 40읽기 미만.** 무료 한도 5만/일 기준 0.003% 수준이라 비용 영향은 없다.
`isSameClassFast → isSameClass` 교체가 유일하게 "읽기를 일부러 늘린" 결정인데,
규약 위반을 없애는 대가로는 싸다(§8 M2 가 지적한 바로 그 위반을 내가 반복하는 것보다 낫다).

---

## 12. 교차검증 3라운드 (codex) — 2026-08-11

codex(gpt-5.6-sol)가 **CRITICAL 13 · HIGH 3 · MEDIUM 2 · LOW 2** 로 REQUEST_CHANGES 를 냈다.
옛 스냅샷(periodLockStore 분리 전) 기준이라 일부는 이미 고쳐져 있었다. **전 건 내가 코드로 대조했다.**

### 채택해서 고친 것 (9건) — 대부분 **내 수정 자체의 결함**이었다

| 항목 | 무엇이 틀렸나 | 내 실증 |
|---|---|---|
| **C13** 가격 가드 우회 | `Number.MIN_VALUE`(5e-324)는 유한 양수라 통과 → cost 가 0 으로 반올림돼 **공짜 매수**. `MAX_VALUE`는 × 수량 하면 **Infinity** → `increment(Infinity)` | 🔴 재현 확인 |
| **C2** 백필이 마커를 되돌림 | 마커=`2026-08` 인데 `?monthKey=2026-07` 호출 → 마커가 과거로 덮여 **8월분 재지급**. 정규식이 `2026-99`·`9999-13` 도 통과 | 🔴 재현 확인 |
| **C4** 관리자 조회 실패를 null 캐시 | 학생 배당·마커·국고통계는 커밋되는데 **교사 입금만 누락**, 재실행은 마커에 막혀 **영구화** = 무담보 발행 | 🔴 내가 넣은 캐시가 원인 |
| **C9** 적금 실패를 삼키고 완료 처리 | 삼키면 그날이 '완료'로 닫혀 **당일 납입이 통째로 사라진다** | 🔴 내 코드 |
| **C10** 상한·마커를 트랜잭션 밖에서 검사 | 같은 상품을 건드리는 경로가 하나 더 있다(`autoSavingsDeposit` — 회차 따라잡기 모델이라 이 마커를 안 쓴다) | 🔴 실재 (단 "termInDays+1" 은 과장 — 양쪽이 상한을 건다) |
| **C7** 주급 배치 500 한도 | 학생당 3쓰기 + 고정 2 → **167명부터 그 학급 전체 실패** | 🔴 산수 확인 |
| **HIGH1** goals 학생 update | 내 1차 판단은 "학급 검사 추가"였는데 **codex 가 더 옳았다**: 학생은 이 권한이 **애초에 불필요**하다(기부는 전부 `donateCoupon` CF, 클라 `updateDoc` 0건). 화이트리스트는 "무엇을"만 막고 "대가를 치렀는지"는 못 막는다 → 분기 통째 제거 | 🔴 채택 |
| **HIGH2** 루트 transactions | create 만 막고 update/delete 를 두니 **학급 경계 없는 전권**이 남았다 | 🔴 실재 |
| **MEDIUM1** parseInt 후 isInteger | `parseInt("100.9")`·`parseInt("100원")` 이 전부 100 이라 정수 검증이 **항상 통과** | 🔴 재현 확인 |

**그래서 만든 것**: `functions/moneyGuards.js`(순수) — 가격은 **1 이상 100억 이하의 정수**, 파생 금액은
`Infinity`/`NaN`/안전정수 초과 차단. 🔬 라이브 22종목 실측(전부 정수, 27,195 ~ 1,430,000원)으로
정상 거래를 막지 않음을 확인했고, `moneyGuards.test.js` 14케이스가 **실제로 뚫렸던 값**을 그대로 지킨다.

⚠️ 파생값 상한을 사업 상한(100억)으로 두면 **정상 거래가 막힌다**는 걸 테스트가 잡아냈다 —
라이브 최고가 143만원 × 최대수량 1만주 = **143억**이다. 사업 상한은 **입력**에, 파생값 검사는
`Infinity`/`NaN` 차단에 쓴다. 잔액 부족은 잔액 검사가 판단한다.

**주급 배치**는 분할 커밋 + 학생 단위 마커(`lastSalaryWeekKey`, 같은 update 에 필드 하나라 **쓰기 증가 0**)로
바꿨다. 시뮬레이션: 5,000명 학급도 최대 450 ops. 마커가 있어 중간까지 커밋된 뒤 죽어도 재실행이 안전하다.

### 반박한 것 (2건)

**C5 legacy 락 오판** — codex 는 "status 없는 문서를 완료로 보면 구버전 부분실패가 영구 누락된다"고 했다.
맞는 지적이지만 **반대로 하면 더 나쁘다**: 그 주 주급이 **한 번 더** 나간다(W32 시점엔 학급·학생 마커가
아직 존재하지 않아 아무것도 못 막는다). 🔬 라이브 실측으로 W32 는 실제 지급 완료 상태임을 확인했고
(`salaryLastRaiseWeekKey=2026-W32` 가 2개 학급에 존재 — 지급 batch 와 같은 커밋에 쓰인다),
이 분기가 유효한 건 **배포 주 딱 한 주**다. 누락은 force 로 되돌릴 수 있지만 중복지급은 회수해야 한다.
→ 현 설계 유지. 판단 근거를 `periodLock.test.js` 에 못 박았다.

**C6 재산세 내부 마커** — 코드가 **이미 그 상황을 다루고 있다**:
> `claim 성공 후 실제 과세(batch)가 실패하면 그 주엔 미징수(under-tax, 안전 방향) → 교사 force 백업`

이중과세 대신 미징수를 택하고 수동 복구 경로를 둔 **문서화된 트레이드오프**다. 결함이 아니다.

### 남긴 것 (전부 **내가 건드리지 않은 기존 코드** · 이번 변경과 무관)

| 항목 | 실재 | 왜 지금 안 하나 |
|---|---|---|
| C3 전량매도 후 재매수 시 배당 마커 소실 | ○ | 실행 락이 생겨 같은 달 재실행은 **실패 후에만** 일어난다. 전제가 셋(부분실패 + 매도·재매수 + 재시도)이고 금액은 한 달치 배당 1종목. 근본 해결은 마커를 보유문서 밖(월별 원장)으로 옮기는 설계 변경 |
| C6-b 재산세 배치 500 한도 | ○ | C7 과 같은 절벽. 현재 최대 학급이 훨씬 작아 미발현. 주급과 같은 방식으로 분할하면 되지만 **이번 라운드에 이미 자산 코드를 크게 바꿨다** — 검증 없이 더 얹지 않는다 |
| C8 월세 지급단위 멱등성 | ○ | 위와 동일 |
| C11 economicEvents 학생/관리자 비원자성 · 나눗셈 잔여 소각 | ○ | 구조 변경(트랜잭션 분해)이 필요하다. 별건 |
| C12 순자산 계산 빈 catch | ○ | 조회 실패 시 주식가치 0 으로 과세표준이 낮아진다(학생에게 **유리한** 방향) |
| HIGH3 내부 catch 가 최상위 rethrow 를 막음 | ○ | 실물가·환율·경제이벤트는 개별 try/catch 로 **부분 실패를 허용**하는 것이 의도다. 다만 "성공으로 보고"는 사실이라 별건으로 다뤄야 한다 |
| C13-b `CentralStocks` rules 가 교사 전권 | ○ | 🔬 실측: `StockExchange.js` 가 클라이언트에서 종목을 직접 수정·삭제한다(4곳). 지금 잠그면 교사 도구가 깨진다. **다만 돈은 안 샌다** — 소비지점 가드가 잡는다. CF 이관이 선행돼야 한다 |
| LOW2 volatility:0 이 `\|\|` 로 덮임 · manualUpdateStockMarket 빈 성공응답 | ○ | 사소 |

**판단 기준**: 이번 라운드에서 고친 것은 **내 수정이 만들었거나 악화시킨 것**과 **1~2줄로 닫히는 권한 구멍**이다.
기존 코드의 구조적 결함은 실재를 기록하되 **별도 라운드**로 넘긴다 — 한 번에 다 고치면 검증이 따라오지 못한다.
