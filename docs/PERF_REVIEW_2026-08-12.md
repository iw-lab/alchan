# DB 사용량 · 속도 전수 리뷰 — 2026-08-12

앞선 리뷰(`CODE_REVIEW_2026-08-11.md`)가 **돈이 맞는가**를 봤다면, 이번은 **얼마나 읽고 얼마나 빠른가**를 본다.
읽기 절감은 이미 3단계(2026-07)를 거쳤으므로, 같은 층을 다시 파는 대신 **아직 아무도 안 본 층**을 봤다.
결과적으로 가장 큰 것 두 개는 Firestore가 아니라 **네트워크로 내려보내는 바이트**에 있었다.

---

## 0. 먼저 — 지금 이 수치로는 "읽기가 줄었다"를 라이브로 증명할 수 없다

Cloud Monitoring 14일 실측(`document/read_count`, 일 단위 ALIGN_SUM):

| 날짜 | QUERY | LOOKUP | NOT_FOUND | 합계 |
|---|---:|---:|---:|---:|
| 2026-07-30 | 4,851 | 419 | 37 | 5,307 |
| 2026-08-04 | 8,222 | 464 | 33 | 8,719 |
| 2026-08-09 | 1,216 | 64 | 5 | 1,285 |
| 2026-08-12 | 5,988 | 269 | 6 | 6,263 |
| **14일 평균** | | | | **4,199 / 일** |

**방학이다.** 학기 중 실측은 35,000~56,000/일이었다(무료 한도 5만을 종종 초과).
지금은 그 **1/10**이라, 이번 변경의 읽기 절감을 라이브 총량으로 검증하는 건 **개학 후에야 가능**하다.
그래서 이 문서의 절감치는 전부 **코드에서 결정론적으로 셀 수 있는 것**(쿼리 실행 횟수·문서 수)이거나
**바이트 실측**이고, "하루 몇 건 줄었다"는 라이브 수치는 **주장하지 않는다.**

읽기 구성비는 **QUERY 92% / LOOKUP 7%** — 줄일 대상은 문서 단건 조회가 아니라 **컬렉션 쿼리**다.

### 번들 기준선 (2026-08-12 커밋된 `build/`)

```
청크 85개   총 2,159,440 B raw / 647,131 B gzip
  vendor-firebase   509,874 / 152,310     ← SDK 자체 무게, 손댈 곳 없음(아래 §5)
  vendor-react      211,098 /  67,023
  AlchanLayout      203,109 /  60,258     ← 로그인한 모든 학생이 매번 받는다
  AdminSettingsModal 113,902 /  25,637    ← lazy, 교사만
  index             108,743 /  32,939
```

---

## 1. 조사 방법

8차원 병렬 조사 → 차원별 **적대적 검증자**가 반박 시도 → 내가 최종 판정.

| 차원 | 발견 | 차원 | 발견 |
|---|---:|---|---:|
| Firestore 읽기 패턴 | 5 | 번들·초기 로드 | 3 |
| 실시간 리스너 | 2 | React 렌더 | 3 |
| 캐시 계층 | 4 | Cloud Functions | 4 |
| 쓰기 증폭 | 1 | 로그인·첫 화면 경로 | 7 |

**29건 · CONFIRMED 28 · OVERSTATED 1 · REFUTED 0.**

REFUTED 0은 좋은 신호가 아니라 **검증자가 무르다는 신호**로 읽었다. 그래서 아래 §2처럼
내가 직접 다시 재고, 두 건은 결론을 뒤집었다. 그리고 **가장 큰 발견 하나는 8개 차원 어디에도 안 잡혔다** — §3.

---

## 2. 검증자 결론을 뒤집은 것 — 폰트

조사자는 "index.html이 폰트 CSS 176 KB(gzip)를 preload 하는데 **실사용 증거가 없다**,
두 preload를 지우면 176 KB 절감, 화면 변화 없음"이라고 보고했고 검증자도 CONFIRMED 했다.

**틀렸다.** 직접 확인:

- `src/index.css:238` — `font-family: "Pretendard", "Noto Sans KR", -apple-system, …`
- Pretendard CDN CSS가 등록하는 이름은 `'Pretendard Variable'` (curl 로 확인)
- 저장소 어디에도 `"Pretendard"` 이름의 `@font-face` 는 없다

즉 **`"Pretendard"` 는 한 번도 매치된 적이 없고, 실제로 화면을 그리는 폰트는 `"Noto Sans KR"` 이다.**
조사자 제안대로 Noto 를 지웠으면 **앱 전체 서체가 시스템 폰트로 바뀐다.** 성능 개선이 아니라 디자인 변경이다.

대신 실측으로 더 나은 답을 찾았다 (Chrome UA 로 curl):

| 요청 | CSS raw | CSS gzip | @font-face |
|---|---:|---:|---:|
| `Noto+Sans+KR:wght@300;400;500;600;700;800;900` (현재) | 666,022 | **163,205** | 868 |
| `Noto+Sans+KR:wght@100..900` (가변축) | 95,642 | **23,402** | 124 |
| Pretendard variable dynamic-subset | 53,513 | 13,185 | — |

그리고 **폰트 바이너리**까지 재 봤다. 한 서브셋(라틴+구두점) 기준:

```
정적: 같은 unicode-range 의 weight 7개 합계 = 116,676 B
가변: 같은 unicode-range 1개 파일        =  16,668 B   → 86% ↓
```

앱은 `font-medium` 161곳 · `font-semibold` 175곳 · `font-bold` 316곳 · `font-extrabold` 11 · `font-black` 2 —
**6개 weight 를 실제로 쓴다.** 정적 방식은 눈에 보이는 한글 서브셋마다 weight 수만큼 파일을 받고,
가변축은 서브셋당 1개면 된다. 가변축은 100~900 연속이라 **현재 7개 weight 의 상위집합**이다 — 잃는 게 없다.

→ **결론: Noto 는 지우는 게 아니라 가변축으로 바꾼다. Pretendard 는 지운다(원래 적용된 적이 없다).**

> Pretendard 를 **의도대로 쓰고 싶다면** `index.css`·`tailwind.config.js` 의 이름을
> `'Pretendard Variable'` 로 고치면 된다. 다만 그건 앱 전체 서체가 바뀌는 **디자인 결정**이라
> 이번 성능 작업에 섞지 않는다. 결정은 사용자 몫으로 남긴다.

---

## 3. 아무도 못 찾은 가장 큰 것 — base 아바타 PNG

`AlchanHeader.js:384`(모든 페이지 헤더)와 `AlchanSidebar.js:1304`(사이드바 위젯)가
**모든 로그인 학생에게 항상** 아바타를 그린다. 아바타를 하나도 안 산 학생도
`Avatar.js:6` 의 `DEFAULT_BASE_URL = "/avatar-shop/base_male.png"` 를 받는다.

그 파일이 **709,070 B** 다.

```
public/avatar-shop/ 실측
  PNG   5개  3.3 MB   ← base_male / base_female / *_outfit / editor_bald
  WebP 87개  2.7 MB   ← 나머지 전부
```

2026-08-03 WebP 이관(70 MB→6.1 MB)에서 이 5개만 제외됐다. 이유는 성능이 아니라 **문자열 치환** 때문이다 —
`Avatar.js:31` 이 옷 입은 변종을 찾을 때 `.png` 를 `_outfit.png` 로 바꾼다. 확장자를 바꾸면 그게 깨진다.

치환을 확장자 무관으로 고치면 제약이 사라진다. cwebp `-q 90 -alpha_q 100 -m 6` 실측:

| 파일 | PNG | WebP | 절감 |
|---|---:|---:|---:|
| base_male | 709,070 | 31,378 | 96% |
| base_female | 727,180 | 32,032 | 96% |
| base_male_outfit | 708,652 | 13,942 | 98% |
| base_female_outfit | 726,671 | 15,744 | 98% |
| editor_bald | 618,414 | 32,370 | 95% |
| **합계** | **3,489,987** | **125,466** | **96.4%** |

품질 검증(Pillow 로 원본 PNG vs 디코드한 WebP 픽셀 비교):

- **알파 채널 최대 차이 = 0** — 전 파일 픽셀 단위로 완전히 동일.
  알파는 `_outfit` 합성과 투명 배경을 좌우하므로 여기가 어긋나면 아바타가 깨진다. 안 어긋난다.
- 보이는 RGB: 평균 차이 0.06~0.24 / 255, 최대 21~35(굵은 외곽선의 링잉)
- 얼굴 영역 1:1 육안 대조 — 구별 불가
- 무손실 WebP 도 재봤으나 36% 절감(455 KB)에 그쳐 채택하지 않았다. 같은 q90 설정으로 **이미 87개가 돌고 있다.**

> `?v=ASSET_VERSION` 캐시버스터가 붙어 있으므로 `/avatar-shop/**` 를 장기 캐시로 바꾸는 것도 가능하다.
> 하지만 그건 "에셋을 바꾸고 버전을 안 올리면 **영원히** 옛 이미지"라는 회귀 위험과 맞바꾸는 일이고,
> 96% 감량 앞에서 왕복 절감은 부차적이다. **이번엔 헤더를 건드리지 않는다** (§7 보류).

---

## 4. 실행 목록

### A그룹 — 초기 로드 바이트 (가장 큰 효과)

| # | 무엇 | 근거 | 효과(실측) | 위험 |
|---|---|---|---|---|
| **A1** | base 아바타 5종 PNG → WebP q90 + `_outfit` 치환을 확장자 무관으로 | §3 | **3.33 MB → 125 KB (-96%)** | 낮음 |
| **A2** | Noto Sans KR 정적 7 weight → 가변축 `wght@100..900` | §2 | CSS **-140 KB gzip**, 서브셋당 바이너리 **-86%** | 낮음 |
| **A3** | Pretendard preload/link 제거 (이름 불일치로 애초에 미적용) | §2 | **-13.2 KB gzip** + 바이너리 | 없음 |
| **A4** | `avatarShopCatalog.js` 의 AI 생성 prompt 90개를 스크립트 전용 파일로 분리 | BUNDLE-1 | AlchanLayout **-43.9 KB raw / -14.8 KB gzip** | 낮음 |

A4 상세: `prompt:` 필드 36,914 B(파일의 54%)는 `scripts/generate-avatar-images.mjs` 만 쓴다.
브라우저 코드에서 아바타 `prompt` 를 읽는 곳은 0건(grep 전수). 그런데 import 체인이
`AlchanLayout → AlchanHeader → utils/avatarShop → avatarShopCatalog` 라 **모든 학생 청크에 실린다.**
분리 후 `scripts/generate-avatar-images.mjs`·`regen-item.sh`·`validate-asset.mjs` 3곳의 경로를 같이 고친다.

### B그룹 — Firestore 읽기

| # | 무엇 | 위치 | 효과 |
|---|---|---|---|
| **B1** | 하트비트(`lastActiveAt`/`lastLoginAt`)가 `updatedAt` 을 같이 찍어 학급 전체 증분동기화를 유발 | `firebase/db/users.js:194` | 학급당 하루 최대 100~150회의 "위장 변경" 제거 |
| **B2** | 경제이벤트 스케줄러가 평일 매시간 `users` **전체 스캔**으로 이미 아는 학급 2개를 재확인 | `functions/economicEvents.js:1282` | 420~520 → **~50 읽기/일** |
| ~~B3~~ | ~~`restoreExpiredOverrides` 중복 조회 제거~~ | `functions/economicEvents.js:1331` | **되돌림** — §5-2 codex W3 |
| **B4** | `realEstateOffers` 를 `where` 없이 전량 조회하면서 화면은 `pending` 만 씀(영구 누적 컬렉션) | `RealEstateRegistry.js:274` | 누적분 제외, 학기말 폭발 차단 |
| **B5** | 만기·납입 자동처리 3개 훅이 같은 `products` 서브컬렉션을 각자 조회 + 탭 포커스마다 재조회 | `useAutoLoanRepay/SavingsDeposit/DepositMature` | 마운트당 **3 → 1**, 포커스당 **3 → 0** |
| **B6** | `salarySettings` 를 대시보드 방문마다 캐시 없이 재조회(기본 랜딩 라우트) | `Dashboard.js:655` | 세션당 1회로 수렴 |
| **B7** | 사이드바와 대시보드가 같은 `jobs` 컬렉션을 캐시 공유 없이 각자 조회 | `AlchanSidebar.js:762` | 캐시 적중 시 **2 → 1** |
| **B8** | `settings/mainSettings` 를 CurrencyContext·Dashboard 가 각자 조회 | `CurrencyContext.js:59` | 세션당 **2 → 1** |
| **B9** | 출석 스트릭 문서를 게이트 체크와 배너가 각각 조회 | `AlchanLayout.js:292` | 미수령 학생 하루 **2 → 1** |
| **B10** | `PersonalShop` 이 학급 전체 활성 상점을 캐시 없이 매 마운트 전량 조회 | `PersonalShop.js:812` | 재방문 시 0건(TTL 내) |
| **B11** | `SuperAdminDashboard` errorLogs 리스너가 `userDoc` 전체를 deps 로 둬 재구독 | `SuperAdminDashboard.js:463` | 4시간 체류 시 ~200건 재읽기 제거 |

> **B7 은 읽기 전용 공유로만 했다.** 처음엔 사이드바가 캐시를 **채우게** 짰다가 되돌렸다 —
> Dashboard 는 이 캐시의 내용을 그대로 `setJobs` 로 화면에 올리는데, 거기 필요한 건 raw 문서가
> 아니라 `tasks[].reward/clicks/maxClicks` 기본값과 `active` 가 채워진 **정규화된 모양**이다.
> 사이드바가 raw 를 넣으면 Dashboard 가 그걸 집어 들어 **할일의 클릭 제한이 깨진다.**
> 읽기 1건을 아끼려고 그 교환을 하지 않는다. 정규화를 사이드바에 복제하는 것도 답이 아니다 —
> 같은 규약이 두 곳에 생기면 반드시 갈라진다. 그래서 **적중하면 재사용, 없으면 자기 쿼리(쓰기 없음)** 다.
>
> **B8 의 교환**: `mainSettings` 를 12시간 캐시로 공유하면 교사가 화폐 단위를 바꿔도 다른 학생
> 화면엔 최대 12시간 늦게 반영된다(교사 본인 기기는 저장 시 무효화된다). 이건 새로 만든 지연이
> 아니라 **이미 Dashboard 가 같은 문서에 적용하고 있던 정책**에 CurrencyContext 를 맞춘 것이다
> (같은 문서의 `couponValue` 도 이미 12시간 캐시된다).

B5 보강: 3개 훅은 `visibilitychange` 마다 재조회한다. 주석이 밝힌 목적은 "**다음 날** 진입 케이스 커버"다.
그러면 **날짜가 바뀐 경우에만** 재조회하면 목적을 100% 지키면서 탭 전환마다의 조회가 사라진다.
빈 결과 쿼리도 Firestore 는 최소 1읽기를 과금하므로, 상품이 없는 학생도 지금은 세션당 3읽기를 쓴다.

### C그룹 — 체감 속도 · 정합성

| # | 무엇 | 위치 |
|---|---|---|
| **C1** | `jobs` 쓰기 10곳이 6개 정부 페이지가 쓰는 `fetchCache` 를 무효화하지 않아 최대 54분 스테일 | `Dashboard.js` 외 |
| **C2** | Dashboard 가 `JobList`/`TaskItem` 에 매 렌더 새 인라인 콜백을 넘겨 `React.memo` 를 전면 무력화 + `useMemo` deps 가 `userDoc` 전체 | `Dashboard.js:731,2372` |
| **C3** | Dashboard 첫 로딩의 `jobs`/`commonTasks` 가 병렬 가능한데 순차 await | `Dashboard.js:789` |
| **C4** | `MyItems` 재고 조회가 `for` 루프 순차 `getDoc` (읽기 수는 불변, 왕복만 N배) | `MyItems.js:680` |
| **C5** | `StockExchange` AdminPanel `onClose` 가 인라인 함수라 memo 부분 무력화 | `StockExchange.js:2144` |

**C2 를 파다가 실제 버그를 찾았다.** `Dashboard.js:2408` 은
`onEditTask={(task) => handleEditTask(task, job.id)}` 로 **task 객체**를 기대하는데,
`JobList.js:97` 은 `onEditTask(task.id, job.id)` 로 **문자열 id** 를 넘긴다.
`handleEditTask` 는 `taskToEdit.name`·`.reward`·`.maxClicks` 를 읽으므로 →
**직업 카드에서 할일을 수정하면 폼이 빈 채로 열린다.** (같은 화면의 `CommonTaskList` 는
`commonTasks.find(t => t.id === taskId)` 로 올바르게 변환한다 — 한쪽만 빠졌다.)
memo 를 되살리려면 어차피 이 배선을 다시 그려야 하므로, 같은 변경에서 함께 고친다.

### D그룹 — 죽은 코드 (읽기·바이트 이득은 미미, 재발 방지 목적)

| # | 무엇 | 상태 |
|---|---|---|
| **D1** | `src/hooks/useFirestoreData.js`(553줄) 프로덕션 호출부 0건 — `.oxlintrc.json` override·`lintGuards.test.js` 기대값·`package.json` 테스트 제외와 함께 제거 | ✅ |
| **D3** | `package.json` 의 `@firebasegen/default-connector` 미사용(번들 영향 0, 정리 목적) | ✅ |
| **D2** | `globalCacheService.js` 의 고수준 메서드 8개(≈250줄) 호출부 0건 | ⏸ 아래 §7 |
| **D4** | `subscribeToCollection`·`subscribeToMarketSummary`·`getAllUsersDocuments` 호출부 0건 | ⏸ 아래 §7 |

D1 의 실질 이유는 바이트가 아니다. **"이 훅을 쓰면 캐시가 되는 줄" 착각해 C1 같은 이중 캐시를
또 만드는 것**을 막는 것이다. 실제로 이 저장소엔 캐시 계층이 **5겹**이고, C1 은 그중 둘이
같은 데이터를 서로 다른 키로 캐싱해서 생긴 문제다.

부수 효과로 `npm test` 의 제외 인자 하나가 사라졌다 — 그 파일은 **제외된 채 실패하고 있던**
3개 중 하나였다(나머지 둘 `globalCacheService`·`logger` 는 이번 변경과 무관한 기존 실패로 남는다).

---

## 5. 조사했으나 **손댈 게 없던 것** (재조사 금지)

- **`vendor-firebase` 509.9 KB** — 소스맵 실측: `@firebase/firestore` 301.6 KB(59%) + auth 79.5 + webchannel 51.6 + storage 21.6.
  전부 modular import(wildcard 0건), tree-shaking 정상. **SDK 자체 무게**라 코드 스플리팅으로 줄지 않는다.
  `firestore/lite` 는 `onSnapshot` 이 없어(이 앱은 14곳 사용) 불가.
- **`AdminSettingsModal` 113.9 KB** — 이미 `Dashboard.js:42` 에서 lazy. 학생은 안 받는다.
- **lucide-react** — 38개 파일 전부 named import, wildcard 0건.
- **`AuthContext`/`ItemContext` value** — 둘 다 `useMemo` 로 올바르게 메모돼 있다.
- **onSnapshot 14곳** — 상시 붙는 3개(본인 users 문서 / catalogMeta / activeEconomicEvent)는 전부
  **단일 문서 + primitive deps** 라 재구독 폭주 없음. Court.js 2곳은 "폴링→리스너"가 **의도된 트레이드오프**(주석 확인).
- **`buyStock`/`sellStock` 의 트랜잭션 내 재조회** — read-before-write 규약상 **필수**다. 낭비가 아니다.
- **`dividendService` 의 N+1** — 월 1회 실행, 보유종목 확인 없이는 대상 판정 불가. 병렬화 이득 무의미.
- **MyAssets·LearningBoard·PoliceStation·StockExchange 의 캐시/페이지네이션** — 3단계에서 이미 처리됨.

---

## 5-1. 실행 결과 (실측)

### 바이트 — 유일하게 지금 확정할 수 있는 숫자

| 항목 | before | after | 변화 |
|---|---:|---:|---:|
| **base 아바타 5종** | 3,489,987 B | 125,466 B | **−96.4%** |
| `public/avatar-shop` 전체 | 6.0 MB | 2.9 MB | −52% |
| **AlchanLayout 청크** (모든 학생) | 203,109 / 60,258 gz | 159,454 / 45,727 gz | **−21.5% / −24.1%** |
| JS 번들 합계 | 2,159,440 / 647,131 gz | 2,116,422 / 631,048 gz | −43,018 / −16,083 gz |
| **Noto Sans KR CSS** | 666,022 / 163,205 gz | 95,642 / 23,402 gz | **−85.7% gz** |
| 폰트 바이너리(서브셋 1개 기준) | 116,676 B (7파일) | 16,668 B (1파일) | **−86%** |
| **Pretendard CSS** | 53,513 / 13,185 gz | 0 | 전량 제거 |

첫 방문 임계경로에서 사라진 것만 합치면 **gzip 기준 약 153 KB + base 이미지 약 680 KB**.
`avatarShopCatalog.js` 자체는 68,572 B → 22,482 B (−67%).

### 검증

- `npm test` **415/415** (기준선 387 + 신규 28, 파일 27개) — 교차검증 지적을 반영해 4개 추가
- `npm run test:rules` 75/75 · `npm run lint` 경고 7건(전부 기존) · Tier-0 게이트 통과
- `check-build-integrity` · `check-hosting-headers` 통과
- 부채 천장: `firestoreDirect` 46 → **45** (개선분 반영해 천장을 내렸다)
- 배포 산출물 직접 확인: `build/index.html` 에 Pretendard 참조 **0**,
  `build/avatar-shop` 에 PNG **0개**, AlchanLayout 청크에 프롬프트 지문 문자열 **0건**

### 알파 채널 동일성 (아바타 변환의 핵심 안전장치)

원본 PNG 와 디코드한 WebP 를 픽셀 단위로 비교 — **5개 파일 전부 알파 최대 차이 0**.
알파가 `_outfit` 합성과 투명 배경을 좌우하므로 여기가 어긋나면 아바타가 깨진다.
보이는 RGB 는 평균 0.06~0.24 / 255, 얼굴 영역 1:1 육안 대조에서 구별 불가.

### 회귀 테스트로 못 박은 것 (신규 28개)

- `avatarAssets.test.js` — `_outfit` 변종 탐색이 **확장자를 가리지 않는다**, 확장자를 못 알아보면
  원본이 아니라 **null** 을 준다(원본을 돌려주던 게 정확히 예전 버그), 두 파일의 `ASSET_VERSION` 일치
- `studentProducts.test.js` — 세 자동처리 훅이 **스스로 조회하지 않는다**(구조 검사),
  날짜 경계가 **KST** 기준(자정 전후 1초로 검증)
- `taskHandlerWiring.test.js` — 아래 발견한 실버그의 재발 방지.
  **뮤테이션으로 확인**: 옛 배선(`onEditTask(task.id, …)`)을 되살리면 이 테스트가 정확히 실패한다

## 5-2. FULL 교차검증 — 세 계열이 **각각 다른 것**을 잡았다

Tier-0(기계) 통과 후 3계열에 **서로 다른 렌즈**를 주고 병렬로 돌렸다. 겹치는 지적 **0건**.
그리고 잡힌 것 대부분이 "원래 있던 버그"가 아니라 **내가 방금 넣은 수정의 결함**이었다.

| 계열 | 렌즈 | 판정 | 고유 발견 |
|---|---|---|---|
| codex (gpt-5.6-sol) | 성능 주장·경계값·서버 정확성 | REQUEST_CHANGES | 5 |
| Gemini (agy) | 아키텍처 일관성·규약 누락 | REQUEST_CHANGES | 1 CRITICAL + 2 |
| Claude (code-reviewer) | 회귀·기존 동작 파손 | APPROVE (W1) | 1 |

### 채택해 고친 것

| 지적 | 무엇이 틀렸나 | 조치 |
|---|---|---|
| 🔴 **Gemini CRITICAL** | `mainSettings` 캐시를 공유하면서 "Dashboard 가 이미 무효화한다"고 적었는데, `currencyUnit` 을 실제로 쓰는 경로는 **다른 파일**(`AdminSettingsModal.handleSaveCurrencyUnit`)이었고 거기엔 무효화가 없었다. → **교사가 화폐 단위를 바꿔도 최대 12시간 뒤 옛 값으로 되돌아간다.** C1 에서 고친 것과 **똑같은 형태의 버그를 내가 새로 만들었다.** | 그 저장 경로에 `globalCacheService.invalidate("mainSettings")` 추가 + 틀린 주석 정정 |
| codex W1 | `outfitVariantUrl` 정규식을 URL **전체**에 걸어서, `/a.jpg?next=.webp` 는 매치되고(오판) `/a.png#frag` 는 안 매치됐다(멀쩡한 URL 버림). 대문자 확장자도 놓쳤다 | 경로 부분만 보도록 수정 + 이 4가지 경계 케이스를 테스트로 고정 |
| codex W2 | 프로비저닝 게이트를 `currentHour === 8` 로 짰다 — "하루 1회"가 아니라 "**8시 실행이 성공했을 때만**"이다. 8시가 실패한 날은 스캔이 통째로 없고, 금요일 8시 이후 생긴 학급은 월요일까지 기다린다 | "몇 시냐" → "**오늘 했느냐**"로 교체. 마커 문서 1건 읽기로 판정(없앤 users 스캔은 실행당 40~50건) |
| codex W3 | `restoreExpiredOverrides` 에 스냅샷을 넘겨 중복 조회를 없앴는데, 스냅샷을 읽은 뒤 루프가 도는 사이 수동 경제이벤트가 오버라이드를 새로 걸면 **그걸 낡은 값으로 지운다** | **되돌렸다.** 절감은 20 읽기/일뿐이고 잃는 건 경제이벤트 상태의 정확성이다 |
| codex W4 | `inFlightRef`(boolean) 하나로 중복 조회를 막아서, A 조회 중 B 로 계정 전환 시 B 조회가 생략되고 **뒤늦게 온 A 응답이 B 화면에 앉았다** | "누구의 조회인가"를 들고 다니게 바꾸고, 응답 시점에 사용자가 바뀌었으면 버린다 |
| codex W5 | `Promise.all` 은 한쪽이 실패하면 **성공한 쪽 결과까지 버린다** — 순차 await 시절엔 최소한 jobs 는 반영됐다 | `allSettled` + 각각 독립 반영. 스로틀 마커도 둘 다 성공했을 때만 찍는다 |
| codex NIT1 | `isOnlyTimestamp` 를 정리 **전** 키로 판정 — 캐시 무효화와 write 가 서로 다른 집합을 봤다 | 둘 다 `cleanedUpdates` 기준으로 통일 |
| 🟡 **Claude W1** | base PNG 를 지웠는데 `public/avatar-position-editor.html` 이 **자체 사본**의 `RAW_PNG_IDS` 로 `.png` 를 하드코딩하고 있었다 → 좌표 편집기의 베이스 미리보기가 전부 404 | 확장자 규칙과 안내 문구를 WebP 로 맞추고, "이 파일은 사본을 들고 있다"를 주석으로 못 박음 |

### 실측으로 기각/확인한 것

- **Gemini WARNING(KST 중복 4곳)** — `NationalTaxService.js` 는 서버 `computeKstWeekKey` 와의 일치를 위해
  **의도적으로** 자체 계산을 쓴다는 주석이 이미 있다. 나머지 3곳은 이번 변경과 무관한 기존 코드라
  **이번 커밋에서 건드리지 않는다**(성능 축이 아니라 정리 작업이고, 섞으면 검토가 흐려진다).
- **codex W4(자정을 넘겨도 탭이 계속 visible 이면 재조회 안 됨)** — codex 스스로 "기존 훅에도 있던
  구멍이며 이번 변경이 새로 만든 것은 아님"이라고 확인했다. 사실이다. 별건.
- **codex NIT3 / Claude 참고(경제이벤트 하루 지연)** — 전자는 `docIds` 가 소량이라 실질 영향 없음,
  후자는 마커 방식으로 바꾸면서 해소됐다.
- **자산 계산 변경 0건** — 세 계열 모두 현금·주식·부동산·대출 계산식이나 이중 지급 경로 변경을
  찾지 못했다고 명시했다.
- **새 복합 인덱스 0건** — `where("status","==","pending")` 이 단일필드 등가라 기본 인덱스로 처리됨을
  codex 가 `firestore.indexes.json` 대조로 확인했다.

## 5-3. 배포 후 라이브 확인 (`247969f`)

CI · Android APK · Deploy 3개 워크플로 전부 success. `Deploy complete!`

| 확인 | 결과 |
|---|---|
| 라이브 `index.html` 폰트 링크 | `Noto+Sans+KR:wght@100..900` (가변축) · Pretendard 링크 **0** (남은 4건은 이유를 적어 둔 주석) |
| 라이브 `base_male.webp` | HTTP 200 · **31,378 B** (전 709,070 B) |
| `avatarShopItems` 재시드 | 자동 실행 **106개** — Firestore 의 `imageUrl` 도 `.webp?v=20260812a` 로 갱신됨 |
| 배포 쿼터 초과 | **6건**(전부 자동 재시도 후 성공). 직전 배포는 30건이었다 |

`avatarShopItems` 재시드는 `deploy.yml` 이 카탈로그 변경을 감지해 자동으로 돈다. 학생 문서에 복제된
낡은 `imageUrl` 은 `buildAvatarOverlays` 가 항상 카탈로그에서 해석하므로 마이그레이션이 필요 없다.

## 6. 검증 계획

| 대상 | 어떻게 |
|---|---|
| A1 아바타 | 변환 전후 바이트 + **알파 픽셀 동일성** 자동 검사 · `_outfit` 치환 단위 테스트(png/webp/쿼리스트링 유무) · `ASSET_VERSION` 2중 선언 동기화 테스트 |
| A2·A3 폰트 | `index.html` 링크 diff · 빌드 후 실제 요청 URL 확인 · 렌더 서체가 Noto 로 유지되는지 육안 |
| A4 prompt 분리 | 빌드 후 청크에서 프롬프트 지문 문자열 **0건** 확인 · 생성 스크립트가 여전히 90개 prompt 를 읽는지 실행 검사 |
| B그룹 | 쿼리 호출 횟수 단위 테스트(스텁이 2회째 호출 시 throw) · B1 은 `updatedAt` 미포함을 직접 단언 |
| C2 | 할일 수정 폼에 **이름·보상·클릭수가 채워지는지** 회귀 테스트 |
| 전체 | `npm test` **387 → 415/415** · Tier-0 게이트 **7/7** · FULL 교차검증 3계열 (§5-2) |

**측정 불가를 측정한 척하지 않는다.** 읽기 절감의 라이브 검증은 개학 후 Monitoring 일별 수치로만 가능하고,
그때 학생 1명당 하루 읽기(직전 학기 ≈1,775)를 다시 재는 것이 유일한 정답이다.

---

## 7. 이번에 **하지 않는 것**과 그 이유

| 항목 | 왜 안 하는가 |
|---|---|
| `AuthContext` 의 `getDoc`+`onSnapshot` 이중 읽기 제거(BOOT-1) | 세션당 1건 절감인데 **신규유저 생성·UID 마이그레이션 분기**를 리스너 콜백으로 옮겨야 한다. onSnapshot 은 문서 생성 중 여러 번 발화할 수 있어 `migrateUserDoc` CF 중복 호출 위험. 인증 경로에 1건짜리 이득으로 손댈 이유가 없다. |
| `findApprovedAdminSnap` TTL 캐시(CF-4) | 절감량을 **셀 수 없고**, 교사 승인상태 변경이 최대 5분간 안 보이는 창이 생긴다. 국고 계정 판정에 쓰이는 함수다. |
| 일회성 CF 14개 정리(CF-3) | 유일한 OVERSTATED 판정. 조사자가 "미사용 14개"라 했으나 실제로는 6개가 `.github/workflows/scheduler.yml` 에 **Cloud Run URL 하드코딩으로 배선**돼 있고, 반대로 안전한 삭제 대상은 4개가 아니라 8개였다. **양방향으로 틀린 분석**이라 재조사 없이 손대지 않는다. 런타임 비용은 원래 0이다(스케일투제로). |
| `VoteReminderBanner`/`NewBillPopup` 쿼리 병합(SNAP-2) | 공유 캐시가 이미 채워진 상태로 `NewBillPopup` 이 마운트되면 **과거 법안을 전부 '신규'로 오인해 팝업이 오발화**한다(초기로드 스킵 로직이 깨진다). 절감량은 미측정. |
| `StockExchange` ↔ `MyAssets` 캐시 공유(READ-1) | 한쪽은 `deposits/savings/loans` **배열**, 다른 쪽은 **합계**를 쓴다. 변환을 빠뜨리면 **순자산이 NaN/0** 으로 표시된다. 자산 표시 코드다. |
| `queryFn` 내부 시딩 분리(CACHE-2) | 세 곳 모두 `!exists()` 가드가 있어 멱등이고, 관측되는 사용자 영향이 **0**이다. |
| `/avatar-shop/**` 장기 캐시 | §3 참조. 에셋 교체 시 버전 미갱신이 **영구 스테일**이 된다. A1 이 96%를 이미 가져간다. |
| Pretendard 를 실제로 적용 | 앱 전체 서체가 바뀌는 **디자인 결정**. 성능 작업에 섞지 않는다. |
| 새 복합 인덱스가 필요한 모든 개선 | `deploy.yml` 이 `firestore:indexes` 를 배포하지 않는다. 넣으면 배포 직후 그 목록이 통째로 안 보인다. 이 문서의 모든 제안은 **등가 조건만** 쓴다. |
| `globalCacheService` 죽은 메서드 8개 제거(D2) | 250줄 삭제인데 **그 파일의 테스트가 `npm test` 에서 제외된 채 실패 중**이라 회귀 신호가 없다. 바이트 이득도 측정되지 않았다(수 KB 미만 추정). 그 테스트를 먼저 살린 뒤 지우는 게 순서다. |
| `subscribeToCollection`·`subscribeToMarketSummary`·`getAllUsersDocuments` 제거(D4) | 호출부 0건은 확인했으나 **읽기·속도 이득이 0**이다. 이번 커밋은 성능 축에 집중하고, 데이터 계층 정리는 별건으로 묶는 게 검토에 낫다. |
| 경제이벤트 비활성 설정의 **자동 재활성화** | `economicEvents.js` 의 프로비저닝 루프는 `enabled:false` 를 발견하면 다시 `true` 로 되돌린다 — 즉 교사가 경제이벤트를 끌 수 없다. 빈도를 하루 1회로 낮추면서 눈에 띄었지만, 이건 성능이 아니라 **제품 동작 결정**이라 손대지 않았다. 의도된 것이라면 그대로, 아니라면 별도로 고칠 일이다. |
