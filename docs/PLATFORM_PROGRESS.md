# 플랫폼화 진척 대장 (AI_PLATFORM_PLAN 실행 상태)

> 정본 계획서 = `docs/AI_PLATFORM_PLAN_2026-08-17.md` (FULL 교차검증본).
> **이 파일은 그 계획서의 실행 상태만 담는다** — 설계 근거는 계획서에 있다.
> 세션이 끊기거나 컨텍스트가 압축돼도 이 파일만 읽으면 "다음에 뭘 할지"가 나오게 유지한다.
> 규칙: 항목을 끝내면 여기 상태와 **근거(커밋·실측)** 를 같이 적는다. 근거 없는 ✅ 금지.

## 지금 하는 것
**P1 — AAP 규약.** 순서는 아래 P1 표의 위에서부터.

## P0 (개학 전) — 종료
| 항목 | 상태 | 근거 |
|---|---|---|
| P0-A 읽기 유출 7건 봉인 | ✅ | `bb035b7` · 라이브 규칙 대조 |
| P0-B 죽은 컬렉션 하드닝 | ✅ | `firestore.rules` realEstate·trials `if false` |
| P0-C 전역 설정 쓰기 좁힘 | ✅ | `bb035b7` |
| P0-D 스케줄러 완주 보장 | ✅ | `scheduler-http.js` 전량스캔 2→1회 · 시간예산 420s + 학급 이월 |
| P0-E `classes` 정본 **cutover** | ⏸ **대기 — 단, 기준이 틀렸다(아래)** | 3중 안전망 완성. 2026-08-20 실측: 방향❶(학생 있는데 classes 에 없음) = **0** · 방향❷(classes 에만 있고 학생 0) = **2** |
| P0-F 무보호 HTTP 엔드포인트 | ✅ | `requireForceAuth` + `SCHEDULER_ADMIN_TOKEN`(헤더 전용·confirm=YES·fail-closed) · GitHub Secret 등록 확인 |
| P0-G 앱 레지스트리·사이드바 | ✅ | `src/config/learningApps.js` · `src/services/learningAppRegistry.js` · `platformApps/_registry`(앱 11개) |
| P0-H 학생 실명 입력 경로 | ❌ **미완료** | 2026-08-20 정정. `StudentManager.js` 개별 추가 화면이 라벨 "학생 이름"·placeholder "홍길동" 으로 실명을 유도한다(일괄 생성만 ID). `users.name` 에 두 종류가 섞여 있다. AAP 는 그 필드를 안 쓰는 것으로 우회. **근본 정리는 계획서 §11-1 사용자 결정 필요** |
| P0-I 게이트 제외 경로 | ✅ | 게이트 66초 |
| ★ 서울 리전 이전 | ✅ | `REGION_MIGRATION_2026-08-19.md` |

### ⚠️ P0-E 의 cutover 기준을 고쳐야 한다 (2026-08-20 실측으로 발견)

코드(`scheduler-http.js` logClassRegistryDrift)는 **양방향 0** 을 cutover 전제로 삼는다.
그런데 **그 조건은 정상 운영에서 영원히 안 온다.**

| 학급 | classes 문서 | 학생 | 정체 |
|---|---|---|---|
| `9BVPKP` · `BG6QUC` | ✅ | 20 · 21 | 실사용 |
| `XHAWPR` | ✅ | **0** | 승인된 교사가 학급만 만들고 학생을 아직 안 만든 상태 — **정상이고 영구적일 수 있다** |
| `CLASS2025` | ✅ | **0** | isApproved 필드가 없는 계정(= 슈퍼관리자 운영 학급) |

두 방향은 위험이 다르다:
- **방향❶(학생 있는데 문서 없음)** = 갈아타면 그 학급 학생들의 주급·세금이 **조용히 끊긴다.** 진짜 게이트다. → **현재 0**
- **방향❷(문서만 있고 학생 0)** = 갈아타도 그 학급 루프가 **아무 일도 안 한다.** 읽기 몇 번 낭비일 뿐이다.

→ **cutover 기준을 방향❶ 만으로 바꿔야 한다.** 지금 기준대로면 교사가 학급을 만들어 두기만 해도
전제가 영구히 미충족이 된다. (코드 주석 자체도 "학생 0 학급은 신규일 수 있어 지우지 않는다"고 인정한다.)

### 🐛 곁다리로 발견 — `classes.studentCount` 가 실제와 어긋난다
`classes/BG6QUC.studentCount = 19` 인데 정본 판정식(`studentScope.isStudentDoc`)으로 세면 **21**.
증감으로만 유지되는 필드이고 **감소는 클라이언트가 쓴다**(`StudentManager.js:355,425`),
증가는 일괄생성 CF 뿐(`index.js:10215`). 자가치유는 **문서를 새로 만들 때만** 실측값을 넣고
기존 문서는 안 고친다 → 한 번 틀어지면 영원히 틀어진다(메모리 [[seed_value_in_delta_field]] 와 같은 패턴).
지금은 아무도 이 값을 **읽지 않아** 무해하지만, 계획서 §3.6 은 여기에 수익화 `usage` 카운터를 두려 한다 —
과금이 이 값을 읽는 순간 **잘못된 청구**가 된다. 고칠 자리 = 주간 자가치유가 기존 문서도 보정하게.
**지금은 안 고친다**(주급 경로 = 중대 변경, 별도 FULL 필요).

## P1 — AAP 규약 (지금)
의존 순서대로. **각 항목마다 커밋**하고, 돈에 닿는 항목은 FULL 교차검증.

| # | 항목 | 상태 | 근거 |
|---|---|---|---|
| P1-1 | AAP 토큰 발급 CF + JWKS (P1-8 토큰 위생 포함) | ✅ **배포·라이브 확인** | `7f4d139`. 라이브 확인: 함수 3개 ACTIVE(asia-northeast3) · `aapJwks` kid `88zLZzGu…` 가 로컬 키 파일과 일치 · rules 라이브 원문 == 로컬. 테스트 37개 · 변이 15개 전부 검출 |
| P1-7 | 서버 소유 achievement 카탈로그 | ✅ 구현·라이브 왕복 시험 | `functions/aap/catalogRules.js`(순수) + `catalog.js`(조회) · `scripts/ops/aap-achievements.mjs` · rules 8건 · 테스트 44개 · 변이 46개 전부 검출 · 3계열 리뷰 반영(codex 4 + 리뷰어 6). **아래 결정 2건 확인 필요** |
| P1-2 | `grantAppReward` (돈 — FULL 교차검증) | ✅ **배포 완료** (`f888b2d`, 2026-08-21) | 아래 「P1-2 구현」 절. 테스트 72개 · 변이 43종 전부 검출 · rules 190개 · Tier-0 전부 PASS. **라이브 영향 0**(앱 11개 전부 지급 꺼짐) |
| P1-9 | 앱별 kill switch + 지급량 경보 + 환수 | 🟡 **9a·9b 완료(배포 전)** · 9c 운영 게이트 3건 남음 | **파일럿(P1-4) 전에 있어야 한다** |
| P1-3 | `recordLearningEvent` + 일 단위 집계 | ✅ **구현 완료(배포 전)** | 아래 「P1-3 구현」. 계획서 §3.4. 테스트 149개 · 변이 24종 전부 검출 · rules 212개 |
| P1-4 | 파일럿 1개 앱 이관 — 구구성 수호대(GitHub Pages) | ⬜ | 가장 제약이 심한 앱으로 먼저 증명 |
| P1-5 | 교사 대시보드 — 학급 학습현황 + 보상 이상치 | ⬜ | |
| P1-6 | 나머지 위성앱 순차 이관 | ⬜ | 앱당 독립 작업 |

### 🟡 P1-7 에서 내가 **정하고 넘어간 것 두 가지** (사용자 확인 필요)

1. **컬렉션 이름을 계획서와 다르게 뒀다.** 계획서 §3.3 은 `achievements/{appId}/items/…` 인데
   `appAchievements/…` 로 했다. 이유: `src/utils/achievementSystem.js` 가 이미 "업적"이라는
   같은 단어를 쓰는데 그건 **로컬 배지**(localStorage·돈 무관·화면 장식)다. 둘이 같은 이름을
   쓰면 돈이 걸린 쪽이 장식으로 오해받는다. 계획서에서 의도적으로 벗어난 **유일한** 지점.
2. **상한 숫자는 경제 정책이라 내가 정할 일이 아니다.** 지금 값(코드 `HARD_CEILING`):

   | | 1건 최대 | 하루 합계(앱당·학생당) |
   |---|---|---|
   | 절대 상한(코드) | 현금 20,000 (주급의 1%) | 60,000 (주급의 3%) |
   | L0 (성취를 알찬이 검증 못 함) | 현금 5,000 · 쿠폰 1 | 10,000 · 쿠폰 2 |
   | L2 (앱 서버가 독립 검증) | 현금 20,000 · 쿠폰 3 | 60,000 · 쿠폰 5 |

   주급 기본값 2,000,000 을 기준으로 잡은 보수적 값이다. **지금은 아무 앱도 지급이 켜져
   있지 않아**(`aapEnabled:false` · `dailyCashCap:0`) 실제 영향은 0 이다. P1-2 를 켜기 전에
   교사가 확인할 것. 바꾸려면 `functions/aap/catalogRules.js` 의 숫자 하나만 고치면 된다.
   ⚠️ 주급은 매주 복리로 오르지만 이 상한은 따라 오르지 않는다(인플레 억제 쪽이라 의도적).

### 🐛 P1-7 자체 리뷰에서 잡은 것 — 등급 폴백이 프로토타입 키에서 새어 나갔다

```js
// 처음 쓴 코드
return TRUST_LIMITS[trustLevel] || TRUST_LIMITS.L0;
```
`trustLevel` 이 `"constructor"`·`"toString"`·`"__proto__"` 면 `TRUST_LIMITS[...]` 가
**Object.prototype 에서 truthy 한 값**을 돌려준다 → `||` 폴백이 안 걸린다(재현으로 확인).
그 뒤 `limits.cashPerGrant` 가 `undefined` 라 결과적으로는 거부되지만, 그건 **우연한
fail-closed** 지 설계가 아니다. 상한 판정이 우연에 기대면 안 된다.

→ 허용 목록(`TRUST_LEVELS.includes(...)`)으로 바꾸고, 상한 객체를 `Object.freeze` 했다.
테스트의 "모르는 등급" 목록에 **프로토타입 키를 반드시 포함**하도록 고쳤다 — 원래 목록
(`undefined`·`""`·`"L1"` …)에는 그게 없어서 이 결함을 못 봤다.

**설계 결정**: 문서 값이 상한을 넘으면 **거부**한다(조용히 깎지 않는다). 깎으면 오설정이
그대로 굴러가고 "왜 이만큼만 들어오지?"를 아무도 못 찾는다. 거부하면 지급이 멈추고 로그에 남는다 —
이 저장소는 과다지급으로 두 번 데였다. 운영 스크립트의 `list` 는 등록된 문서를 **지금 규칙으로
다시 판정해서** 보여주므로, 상한을 낮춘 뒤 남은 옛 문서가 학생이 부딪히기 전에 ✗ 로 보인다.

### P1-2 착수 전에 이미 확인한 함정 (2026-08-20 실측)
1. **기존 `checkIdempotent`(functions/utils.js)는 그대로 쓰면 안 된다.** 같은 키가 오면
   `already-exists` 를 **던진다** — 정상 재시도(네트워크 끊김 후 재요청)가 에러가 된다.
   계획서 §3.3 C9/C10 이 요구하는 건 "원래 결과를 다시 돌려주기 + 같은 키에 **다른 payload** 면 충돌".
   → 보상용 멱등 레코드에는 **요청 해시와 결과**를 같이 저장해야 한다.
2. **`expireAt` 은 지금 아무것도 안 한다.** 이 프로젝트에 TTL 정책이 **0개**라(전수 확인)
   `idempotencyKeys` 는 영원히 쌓인다. 보상 API 가 이 컬렉션을 쓰기 시작하면 증가율이 달라진다.
3. **🔴 새 카운터 필드는 rules 블록리스트에 넣지 않으면 학생이 스스로 지운다.**
   `firestore.rules:337` 의 `affectedKeys().hasAny([...])` 는 **필드 이름을 하나씩 나열**한다.
   기존 `gameRewardDaily`·`dailyItemUse`·`dailyDrawCount` 는 거기 있지만, P1-2 가 만들
   새 필드(예: `appRewardDaily`)는 **자동으로 보호되지 않는다.** 학생이 자기 user 문서를
   `updateDoc` 할 수 있으므로, 목록에 안 넣으면 캡을 스스로 0 으로 되돌린다.
   이 저장소는 같은 실패를 이미 겪었다(user 문서 마커 → 세금 회피 통로. 메모리
   `period_lock_protocol`). 계정 자가삭제로 카운터를 통째로 리셋하던 경로도 같은 뿌리였고
   그건 `allow delete: isClassAdmin(...)` 로 막혀 있다 — **그 보호를 상속하려면 이름을
   목록에 넣는 것까지가 한 세트다.**
4. **다중 한도의 저장 위치가 정해져야 한다** (계획서 §2.6 A3: 학생×앱×일 / 학생×전체×일 /
   학급×전체×일 / 앱×전체×일). 학생 축 둘은 `users` 문서가 자연스럽고(위 3번 조건부),
   **학급·앱 축은 담을 문서가 지금 없다** — `classes/{code}` 에는 `studentCount`·`settings`
   뿐이다. 새 문서를 만들면 지급 1회당 읽기·쓰기가 그만큼 는다. 이 트레이드오프를 P1-2
   착수 전 FULL 검증에 같이 올릴 것.
5. **레이트리밋 장치가 사실상 없다.** `_rateLimits` 컬렉션을 쓰는 곳이 딱 한 군데
   (`functions/index.js:10333` 계정복구)뿐이고 범용 헬퍼가 아니다. 계획서 §3.3 6번
   (레이트리밋·차단기)은 **새로 만들어야 한다.**

### 🔎 P1-7 교차검증 결과 (2026-08-20~21)

**⚠️ 이번은 3계열이 아니라 2계열이다.** Gemini 가 개인 쿼터 소진으로 참여하지 못했다
(`agy` 직접 호출 시 `Individual quota reached. Resets in 131h`). 웹 ChatGPT 로 메우지 않았다 —
codex 와 같은 GPT 계열이라 독립성이 없는데 있다고 세게 된다. **약 5.5일 뒤 Gemini 로 한 번 더 볼 것.**
또 검증자 에이전트 셋이 **실패를 보고하지 않고 한 시간 넘게 멈춰 있었다** — 그래서 CLI 를 직접 호출했다.

**codex(gpt-5.6-sol) 판정: REQUEST_CHANGES → 4건 전부 반영**

| 심각도 | 발견 | 조치 |
|---|---|---|
| CRITICAL | `active` 가 fail-open — `null`·`0`·`"false"`·`"off"` 는 물론 **필드가 없는 문서까지** 지급 대상 | `active !== true` 면 거부 |
| WARNING | `plain()` 이 **배열 안의 정수**를 문자열로 바꿔, 같은 문서를 CLI 는 ✅ 서버는 ✗ 로 판정 | 재귀 변환으로 Admin SDK 와 타입 일치 |
| WARNING | 없는 성취에 `on` 하면 `{active:true}` **반쪽 문서**가 생기고 CLI 는 "🟢 켜짐" 이라고 거짓 성공 | `currentDocument.exists=true` 전제조건 |
| NIT | `REWARD_TYPES` 미동결 — `push("gold")` 후 `rewardType:"gold"` 통과 | `Object.freeze`(+`DENY_MESSAGE`) |

**codex 가 확인해 준 것**: 상수 불변 전제에서 상한 초과를 `ok:true` 로 만드는 입력 없음
(경계 조합 23,040개 위반 0건) · `amount × maxPerDay` 최대 1,000,000 으로 오버플로 없음 ·
rules 의 `appAchievements`/`items` 가 학생·교사를 실제 차단(전역 `/{document=**}` 는 `false` 라
덮지 않음) · `...rules` 스프레드 이름 충돌 없음.

⚠️ 수정 직후 변이시험에서 **2건이 새어 나갔다**(`plain()` 배열 변환·`on/off` 전제조건).
코드는 고쳤는데 그 자리를 지키는 테스트가 없었다 — 테스트를 채우고 재변이로 확인했다.
**"고쳤다"와 "고친 것이 지켜진다"는 다르다.**

**Claude 계열은 이번에도 에이전트가 멈춰서 내가 직접 적대적으로 훑었다.** 그 결과 실제로 빈 자리를
찾았다: **경계값(off-by-one) 테스트가 하나도 없었다.** `<=` 를 `<` 로, `>` 를 `>=` 로 바꾸는 변이는
"정상 문서 하나"만 보는 테스트를 그냥 통과한다 — 상한을 정하는 코드에서 경계 한 칸이 곧 정책이다.
`label` 처리(60자 절단·trim·비문자열)도 비어 있었다. 이건 **표시용이라 거부하면 안 되는** 자리다 —
화면 문구 하나로 돈이 멈추면 안 된다. 둘 다 채우고 변이 7종으로 확인했다.

### 🔎 P1-2 설계 교차검증 (2026-08-21, codex gpt-5.6-sol)

**판정: REQUEST_CHANGES** — CRITICAL 7 · WARNING 6. 전부 2판에 반영하거나 이유를 달아 이월했다.
Gemini 는 쿼터 소진으로 이번에도 불참(2계열).

**설계 단계에서 잡은 값이 크다**: 1판대로 구현했다면 `grantAppReward` 는 **누구에게 지급할지
알 수조차 없었다**(토큰에 uid 가 없다). 코드를 쓰기 전에 봤기 때문에 발행된 돈을 회수할 일이 없다.

**곁가지로 라이브 결함을 하나 찾았다** — codex 의 "users.classCode 는 권위 있는 membership 이
아니다"를 확인하다가, **누구나 계정을 만들어 남의 학급 학생이 될 수 있는 것**을 재현했다.
별도 커밋으로 닫고 재발을 CI 검사로 내렸다(위 커밋 참고).

### 🧪 리뷰어들이 **내 테스트를 통과시킨 변이 6종** (2026-08-21)

검증자 셋이 뒤늦게 한꺼번에 돌아왔고, 판정은 전부 APPROVE 였다. 그런데 값은 판정이 아니라
**"네가 잡았다고 한 것이 실제로는 안 잡힌다"** 는 목록에 있었다. 전부 재현해 고쳤다.

| 변이 | 왜 새어 나갔나 |
|---|---|
| `return null;` 을 죽은 코드로 만들고 `return[];` (공백 없음) 실행 | 정규식이 **공백까지 고정**돼 한 글자로 회피됨 |
| `await load(isCancelled)` → `await load()` | 테스트가 `load` **본문**만 보고 **호출부**를 안 봤다. 기본값 `isCancelled = () => false` 가 조용히 채워져 가드가 다시 죽는다 |
| `if (error instanceof HttpsError) throw error;` 를 throw **뒤로** 이동 | 두 줄의 **존재**만 보고 **순서**를 안 봤다 → 도달 불가 코드가 됐는데 초록불 |
| `currentDocument.exists=true` 를 안 쓰는 변수에 박고 URL 은 취약하게 되돌림 | 문자열이 **근처에 있는지**만 봤다. 실제 fetch URL 템플릿을 봐야 한다 |
| `slice(indexOf(...))` 로 자른 구간의 `length > 0` 검사 (6곳) | 못 찾으면 `indexOf` 가 -1 이고 **`slice(-1)` 은 마지막 1글자**를 준다 → `length > 0` 이 **항상 참** |
| 규칙 블록을 고정 600자로 자름 | 실제 블록은 246자인데 창이 **이웃 블록까지 침범**했다. 지금은 우연히 통과할 뿐 |

**공통 원인**: 소스 텍스트 매칭은 "무엇이 적혀 있나"를 보지 "무엇이 실행되나"를 못 본다.
그래서 ① 존재가 아니라 **순서**를 보고 ② 본문이 아니라 **호출부**를 보고 ③ 근처가 아니라
**실제 배선(fetch URL 템플릿)**을 보고 ④ 구간을 자를 땐 **찾았는지 먼저 단언**하도록 고쳤다
(`after()`·`ruleBlock()` 헬퍼로 묶어 같은 실수가 7번째로 복붙되지 않게 했다).

### 🔧 `set` 이 손대라고 하지 않은 필드를 리셋했다 (라이브 재현)

`set --amount` 한 번에 `policyVersion 7→0`, `prerequisites ["course_1"]→[]` 로 날아갔다
(전체 치환 PATCH). **선행조건이 사라지는 건 잠금이 풀리는 것**이고 `policyVersion` 은 지급 원장에
남는 감사 값이다. 기존 문서를 먼저 읽어 이어받도록 고치고, 규약 문서가 약속했는데 도구엔 없던
`--prerequisites`·`--policy-version` 플래그를 만들었다. 라이브 왕복으로 확인.

### 📐 P1-2 설계안 **2판** (codex REQUEST_CHANGES 반영 — 아직 구현 없음)

1판은 codex 가 CRITICAL 7건으로 반려했다. **가장 큰 것부터**: 1판은 아예 동작할 수 없었다.

#### 🔴 왜 1판이 성립하지 않았나 — 토큰에 `uid` 가 없다

AAP 토큰은 아이를 앱 사이로 잇지 못하게 하려고 **일부러** `uid` 대신 앱별 pairwise `sub`
(단방향 HMAC)만 싣는다. 그런데 위성앱은 다른 origin 이라 **Firebase 인증 세션이 없다** —
`grantAppReward` 는 `onCall` 이 될 수 없고(`onCall` 의 Bearer 는 Firebase ID 토큰이다),
`onRequest` 로 받으면 **누구에게 지급할지 알 수 없다.** 요청에 uid 를 담아 믿으면 남에게 지급된다.

→ **발급 시점에 서버가 기억한다.** `issueAppToken`(P1-1, 이미 배포됨)이 보상 가능한 토큰을 낼 때
`aapRewardSessions/{jti} = {uid, classCode, appId, sub, exp, consumedGrantId}` 를 쓴다.
지급 때 `jti` 로 세션을 읽어 토큰의 `aud`·`sub` 와 **전부 대조**하고 `sub === pairwise(salt, appId, uid)` 를
재계산한다. 이 문서가 곧 **1회용 실행권**이라 재생 방어(아래)도 같이 해결된다.
⚠️ 이건 **P1-1 을 고쳐야 한다는 뜻**이다. 앱 실행 1회당 쓰기 1건이 는다.

#### 🔴 재생 — 같은 토큰 + 다른 `clientRunId` = 무한 지급

1판은 멱등키만 봤다. 멱등키가 다르면 전부 새 지급이다. 세션을 **한 번만 소비**하게 하고
(`consumedGrantId` 를 같은 트랜잭션에 기록), 한 실행에서 여러 보상이 필요하면 클라가 만든
`clientRunId` 가 아니라 **서버가 발급한 event nonce** 를 쓴다.

#### 🔴 성취별 한도 상태를 담을 곳이 없었다

1판의 4축은 **합계 금액**뿐이라 카탈로그의 `maxPerDay`·`maxLifetime`·`cooldownSec`·`prerequisites`
를 아무도 집행하지 않는다. 같은 성취를 `clientRunId` 만 바꿔 합계 상한까지 반복할 수 있다.

```
appRewardSubjects/{uid}_{appId} = {
  day, dailyCash, dailyCoupon,
  achievements: { [achievementId]: { day, dayCount, lifetimeCount, lastGrantedAt } }
}
```
선행조건을 성취별 문서로 나누면 지급 1회당 읽기가 최대 10개 는다 → 요약 map 하나가 낫다
(⚠️ 문서 1MiB 상한 감시).

#### 🔴 kill switch TOCTOU

1판은 정책을 트랜잭션 **밖**에서 읽었다. 읽은 뒤 운영자가 껐어도 커밋된다.
→ **정책과 카탈로그를 지급 트랜잭션 안에서 읽는다.** 그러면 변경이 충돌을 일으켜 재시도되고,
재시도에서 `disabled` 를 보고 멈춘다. (P1-7 의 `resolveAchievement` 는 트랜잭션 밖 읽기라
**트랜잭션판이 필요**하다.)

#### 🔴 캡의 값·단위가 정의되지 않았다

정책 문서에 이미 `dailyCashCap`·`dailyCouponCap` 이 있는데(현재 전부 0) 1판은 어느 축에
쓰는지 안 정했다. 구현자가 카탈로그 상한만 보면 **정책상 꺼진 앱이 지급한다.**
그리고 카탈로그 검증은 "성취 하나의 `amount × maxPerDay`"만 보므로 **서로 다른 성취 10개는
각각 통과한다** → 학생×앱 합계 검사가 반드시 따로 필요하다.
쿠폰은 현금화 통로라 `count` 하나로 합치면 안 된다 — **현금·쿠폰을 축마다 분리**한다.

#### 🔴 원장 — `logActivity` 는 지급 원장으로 못 쓴다

트랜잭션 **밖**에서 user 를 다시 읽고, 내부 오류를 catch 하고 계속한다 → **돈만 들어가고 기록이 없을**
수 있다. 게다가 `activity_logs` 는 같은 학급 사용자가 만들 수 있어 정본이 될 수 없다.
→ 서버 전용 append-only `appRewardGrants/{grantId}` 를 **같은 트랜잭션**에서 만든다
(`membership·uid·classCode·appId·achievementId·rewardType·amount·policyVersion·trustLevel·jti·
requestHash·kstDay·revocable`). 원장 생성 실패 = 지급 전체 실패. 학생 화면용 `activity_logs`
projection 은 별도로 같은 트랜잭션에(현금은 top-level `amount`, 쿠폰은 `couponAmount`).

#### 정정한 검증 순서

```
토큰 서명·aud·exp  →  세션(jti) 조회  →  [트랜잭션 시작]
  멱등 조회 **먼저**  → 같은 해시면 저장된 결과 즉시 반환(정책·캡 재적용 안 함)
  정책(kill switch)  →  카탈로그  →  성취별 한도  →  4축 합계  →  지급·원장·세션소비
```
⚠️ **정책을 멱등보다 먼저 보면 안 된다**: 첫 호출이 성공한 뒤 응답만 유실됐는데 그 사이 앱을 끄면,
재시도가 거부되고 **학생 화면은 실패인데 잔액은 이미 늘어 있다.** 이미 성공한 결과를 돌려주는 것은
새 지급이 아니다.

#### 멱등 해시 (`requestHash`)

```
sha256(길이접두 튜플: ["aap-grant-v1", uid, appId, achievementId, clientRunId, eventId])
```
**넣으면 안 되는 것**: 토큰 원문·서명·`kid`·`iat`·`exp`·`jti`, 타임스탬프, KST 날짜, 현재 `classCode`·
역할, 카탈로그 금액·`rewardType`, `trustLevel`·`policyVersion`. 전부 **재시도 사이에 정당하게 변할 수
있는 값**이다. 요청 의도가 아니라 결과 원장에 남긴다. 문서 id 도 문자열 이어붙이기 대신 이 해시를 쓴다
(`/` 주입·길이·튜플 경계 모호를 한 번에 없앤다).

#### 4축 카운터 (1판에서 유지 — 단 현금/쿠폰 분리)

| 축 | 위치 | 추가 R/W | 경합 |
|---|---|---|---|
| 학생×앱×일 + 성취별 상태 | `appRewardSubjects/{uid}_{appId}` | +1/+1 | 없음 |
| 학생×전체×일 | `users/{uid}.appRewardDaily` | 0 (어차피 쓴다) | 없음 |
| 학급×전체×일 | `appRewardCounters/{yyyymmdd}_class_{code}` | +1/+1 | 학급당 1문서 |
| 앱×전체×일 | `appRewardCounters/{yyyymmdd}_app_{appId}` | +1/+1 | **앱당 1문서** |

- `users.appRewardDaily` 는 **중첩 구조**로 둔다 — `appRewardDaily[appId]` 와 `_all` 을 같은
  namespace 에 두면 `appId="_all"` 인 앱이 둘을 충돌시킨다(앱 id 정규식이 `_all` 을 허용한다).
  `{day, total:{cash,coupon}, apps:{[appId]:{cash,coupon}}}`.
- rules 블록리스트 + **create 차단**에 둘 다 넣는다(2026-08-21 에 만든
  `check-rules-create-update-parity.mjs` 가 빠지면 CI 에서 잡는다).
- **codex 실측 판정**: 39명이 1초에 몰리면 앱 문서 39 writes/s. 캡 초과는 없지만(트랜잭션이
  직렬화한다) 일부 요청이 `ABORTED` 로 실패해 재시도해야 한다. 100학급이면 약 200 writes/s —
  **개방 구조로는 부적합.** 단순 샤딩은 답이 아니다(정확한 상한을 위해 모든 shard 를 같은
  트랜잭션에서 읽으면 read set 이 겹쳐 경합 이득이 사라지고 읽기만 N배가 된다).
  → 파일럿은 단일 문서로 가되 **39명 동시 부하 시험**을 하고, 개방 전에 **학급별 예산 배분**을 검토한다.

#### 레이트리밋은 트랜잭션 **밖**이어야 한다

1판처럼 지급 트랜잭션 안에 호출 시각을 쓰면, **실패한 호출은 롤백되어 아무것도 안 남는다** —
잘못된 `achievementId` 를 초당 100번 보내는 공격이 카운트되지 않는다. 지급 전 별도 짧은
트랜잭션(token bucket)으로 분리한다(호출당 약 +1R/+1W). 차단기(앱별 오류율·지급액 임계치)는
P1-9 에서 별도로 만든다.

#### 재시도 계약 (명시)

```
재시도 가능: ABORTED · DEADLINE_EXCEEDED · 커밋 결과 불명
재시도 방법: 같은 clientRunId · 같은 payload · 지수 백오프 + jitter
재시도 불가: 해시 충돌 · 꺼진 성취 · 캡 소진 · 증명 불충분
```

#### 🟡 의도적으로 **미루는 것** (이유와 함께)

- **`membershipId` 도입** — codex 는 uid 대신 안정적 membership 을 캡의 기준으로 삼으라고 했다.
  이유는 계정 재생성으로 카운터가 초기화되는 것인데, **2026-08-21 의 create 잠금으로 그 경로가
  막혔다**(새 계정은 학급에 못 들어가고, 기존 학생은 자기 문서를 못 지운다). 교사 1명·학급 2개인
  지금 구조에서 membership 레이어는 비용 대비 이득이 없다 → **P3(개방) 선행조건으로 이월.**
- **L2 signed receipt** — 지금 앱 11개가 전부 L0 이고 `dailyCashCap:0` 이다. L2 는 "앱 서버가 성취를
  독립 검증한다"는 뜻인데 **기술적 집행 수단이 없으면 등급은 라벨일 뿐**이다.
  → receipt 구조를 P1-6(앱 이관) 때 만들고, **그 전까지 L2 승급을 금지**한다(코드에서 L2 를
  거부하는 게 아니라, 정책 문서에 L2 를 쓰지 않는 운영 규칙 + 검사).
- **교사·관리자 계정 지급 거부** — 이건 미루지 않는다. 구현에 포함.

**P1 성공조건**: 학생이 알찬에서 앱으로 넘어갈 때 다시 로그인하지 않는다.
앱에서 얻은 성과가 알찬 화폐로 들어오고, **캡을 넘기려는 시도가 서버에서 거부된다**(직접 재현으로 증명).

### ✅ P1-2 구현 (2026-08-21) — 설계 2판대로. **배포 완료** (`f888b2d`)

| 파일 | 무엇 |
|---|---|
| `functions/aap/rewardRules.js` (신규) | **순수** 규칙 — KST 하루키·멱등 해시·네 축 캡·token bucket·거부 문구. Firestore 를 모른다 |
| `functions/aap/reward.js` (신규) | 트랜잭션 본체 |
| `functions/aap/handlers.js` | `issueAppToken` 이 실행권(`aapRewardSessions/{jti}`)을 쓴다 + `grantAppReward` onRequest |
| `firestore.rules` | 새 컬렉션 5개 서버 전용 · `appRewardDaily` 를 update·**create 양쪽** 봉인 |
| `scripts/ops/aap-switch.mjs` | `rewards-on/off` · `cap <앱> <현금> <쿠폰>` · list 에 보상·상한 열 |
| `docs/AAP_V1_SPEC.md` §5 | 실제 계약(엔드포인트·에러 코드·재시도 규약·앱이 지킬 것 4가지) |

**돈이 나가려면 스위치 셋이 전부 켜져야 한다**: `migrate`(토큰) → `rewards-on`(실행권) → `cap`(상한).
기본값이 전부 꺼짐/0 이라 **지금 배포해도 한 푼도 안 나간다**(2026-08-21 라이브 11개 앱 실측: 이관 · · 보상 · · 상한 0/0).

#### 🛰️ 배포 후 **라이브 산출물** 확인 (2026-08-21, 워크플로 초록불 말고)

푸시 `e84c0e3..f888b2d`(커밋 5개) → 워크플로 3개 전부 success. 그 다음에 **결과물 자체**를 봤다:

| 확인한 것 | 방법 | 결과 |
|---|---|---|
| Functions 에 새 함수가 실제로 생겼나 | 배포 로그 | `functions[grantAppReward(asia-northeast3)]` **Successful create** — update 가 아니라 create |
| 게시된 규칙이 내 파일과 같나 | `scripts/ops/verify-live-rules.mjs` | 라이브 원문 == 로컬 **완전 일치**, ruleset `4433cbf2…`, 00:51:37Z |
| 엔드포인트가 살아 있나 | 실제 HTTP 요청 | OPTIONS **204** · GET **405** `method_not_allowed` · POST(토큰 없음/위조) **401** `token_invalid` — 404 가 아니다 |
| CORS 가 설계대로인가 | 응답 헤더 | `allow-origin: *` · `allow-methods: POST, OPTIONS` · `cache-control: no-store` · **`allow-credentials` 없음**(와일드카드와 같이 켜면 안 되는 것) |
| 돈이 나갈 수 있나 | `aap-switch.mjs list` | 11개 앱 전부 이관 `·` · 보상 `·` · 상한 `0/0` → **한 푼도 못 나간다** |

`(if changed)` 스텝은 성공해도 내용이 no-op 일 수 있다 — 그래서 스텝 초록불이 아니라
로그의 `Successful create` 와 `released rules` 를 봤고, 그마저도 믿지 않고 **라이브에 직접
물었다**(규칙 원문 대조 · HTTP 프로브). 배포 로그는 "보냈다"까지만 증명한다.

#### 설계 2판에서 **의도적으로 벗어난 한 곳**
2판은 `users.appRewardDaily` 를 `{day, total, apps:{[appId]}}` 중첩으로 두라고 했다(`_all` 충돌 회피).
구현은 **`{day, cash, coupon}`** 로 줄였다 — 학생×앱 축의 정본은 `appRewardSubjects` 이고,
같은 축을 두 문서에 두면 **하나만 보고 판단하는 사고**가 난다(메모리 `cash_safety` 의 "원장이 셋" 함정).
축 하나에 집 하나로 두면 2판이 걱정한 `_all` 충돌도 **구조적으로 사라진다**(namespace 자체가 없다).

#### 실측
- Tier-0 게이트 전부 PASS · `npm test` **770개** · `npm run test:rules` **190개**(신규 14) · eslint 0
- **변이 43종 전부 검출.** 생존했던 3종 중 둘은 등가변이(정수에서 `a > X` ≡ `a >= X+1` / 중복 조건),
  **하나는 진짜 구멍**이었다 — `map[id]` 로 바꿔도 통과했다(뒤쪽 `typeof === "object"` 가
  `constructor`·`toString` 을 *우연히* 걸러 준 것). 프로토타입에 **성취 모양의 값**을 심는
  테스트로 잠갔다. 하나 더: 실행권 만료 검사가 토큰 만료와 값이 같아 **지워도 안 깨졌다** →
  토큰은 살아 있고 실행권만 죽은 케이스로 잠갔다.
- **지급 1회 = 9R + 8W**, 멱등 재시도 = **2R + 1W**(가짜 Firestore 계측). 파일럿 전에
  이 값을 모니터링 체크리스트에 올릴 것 — 이 저장소는 읽기 비용으로 여러 번 데었다.

#### 🔴 내가 직접 찾은 구멍 (Gemini 몫의 렌즈를 대신 훑다가)
**레이트리밋이 세션 조회보다 뒤에 있었다.** 키를 `uid_appId` 로 잡으니 uid 를 알려고
세션 문서를 **먼저 읽어야** 했고, 그래서 보상이 꺼진 앱(= 세션 문서가 없다)의 유효 토큰 하나로
`session_missing` 경로를 무한히 두드려 **읽기 비용만 태우는 길**이 열려 있었다.
→ 키를 **토큰의 `sub`**(앱별 pairwise, 이미 학생×앱 단위)로 바꿔 **읽기 0회** 지점으로 끌어올렸다.
같은 착안으로 멱등 해시의 주체도 `uid`→`sub` 로 바꿔 **사전조회 1R 을 없앴다**(10R→9R).
덤으로 두 문서 어디에도 uid 가 안 남는다.

**교사 배제가 우연한 fail-closed 였다.** `hasAdminPower` 는 **승인된** 관리자만 참이라
미승인 교사(자가가입 직후)가 빠져나갔다 — 지금은 그 계정의 classCode 가 "미지정" 이라
정규식에서 걸릴 뿐이었다. 역할 표식이 하나라도 있으면 학생이 아니다로 넓혔다.

#### 🔎 FULL 교차검증 (2026-08-21) — **2계열**. Gemini 는 또 빠졌다

| 계열 | 판정 | 값 |
|---|---|---|
| Tier-0 결정론 게이트 | ✅ PASS | gitleaks·tsc·shellcheck·oxlint·audit·테스트 |
| Claude `code-reviewer` (회귀·통합 렌즈) | **APPROVE** | CRITICAL 0 · WARNING 2 · NIT 2 — 4건 전부 반영 |
| codex `gpt-5.6-sol` (돈·동시성 렌즈) | **REQUEST_CHANGES** | CRITICAL 1 · WARNING 2 — 3건 전부 반영 |
| Gemini (신뢰경계·PII 렌즈) | 🚫 **불참** | 계정 쿼터 소진(리셋 ≈ 2026-08-26). 그 몫은 메인이 직접 훑었다 |

**codex CRITICAL — 교사가 학생의 AAP 하루 상한을 무제한 재발급할 수 있었다.**
학생 분기 블록리스트에는 `appRewardDaily` 를 넣었는데 **교사(`isAdmin()`) 분기에는 없었다.**
같은 학급 승인 교사가 그 필드를 `{cash:0}` 으로 되돌리면 학생이 다시 10만원을 받는다.
`rules-test.mjs` 에 **ALLOW 카나리아를 먼저 넣어 통과하는 것을 재현**한 뒤 막고 DENY 로 뒤집었다.
> "교사는 어차피 cash 를 직접 올릴 수 있지 않나"는 반론이 있었다. 다르다 — cash 직접 조정은
> **교사가 금액을 정하는** 감사 대상 행위지만, 이 필드를 여는 건 **위성앱에게 무제한 발행권을
> 넘기는** 일이다. 캡은 교사가 아니라 자동 지급 채널을 향한 방어선이다. 그리고 이 필드를 쓰는
> 정당한 교사 UI 는 0곳이다.
> ⚠️ **같은 모양의 선재 항목**: `gameRewardDaily`·`dailyItemUse`·`dailyDrawCount`·`dailySpinCount` 도
> 교사 분기에는 빠져 있다. 이번 범위 밖이라 손대지 않았다 — **별도 항목으로 남긴다.**

**codex WARNING 2건**
- `dayTotals` 가 **손상된 값을 0 으로 읽었다** = fail-open. REST 로 정수를 문자열로 쓰는 실수
  하나면(`cash: "2000000"`) **이미 소진된 캡이 통째로 다시 열린다.** → 값이 이상하면 0 이 아니라
  `null`(판단 불가)을 돌려주고 **지급을 멈춘다**. "이미 얼마 받았는지 모르면 주지 않는다."
- token bucket 이 **저장된 미래 시각**에서 영구 잠금이었다(시계가 뒤로 간 경우만 막았다).
  → 읽을 때 현재 시각으로 끌어내려 다음 호출부터 회복하게 했다.

**Claude WARNING 2건**: ① 거부 문구 표가 두 파일에 복붙(이 저장소가 주급 사고를 낸 그 모양) →
정본 하나로 통합 ② 지급 1회 R/W 프로파일을 파일럿 체크리스트에 올릴 것 → 아래에 실측값을 적었다.
**NIT 2건**: `app_daily_cap` → `subject_daily_cap` 개명 · 테스트의 `LOG_TYPES` 목 제거(드리프트 감지).

**교훈**: 이번에도 지적의 대부분이 "원래 있던 버그"가 아니라 **내가 방금 만든 방어선의 빈틈**이었다.
그리고 CRITICAL 은 **테스트가 통과했기 때문에 안 보였다** — `rules-test.mjs` 가 학생 경로만 검사했다.
같은 필드라도 **누가 쓰느냐로 분기가 나뉘면 분기 수만큼 케이스가 있어야 한다.**

#### 🟡 아직 안 한 것 (다음 자리를 정해 둔다)
- **`issueAppToken` 자체에는 레이트리밋이 없다.** 돈은 캡이 막지만 **비용은 안 막는다**
  (실행 1회 = 3R + 1W). P1-1 때부터의 상태이고, 보상이 켜지면 쓰기가 1건 더 붙는다 → **P1-9**.
- **TTL 정책이 이 프로젝트에 0개다.** `aapRewardSessions`·`appRewardGrants` 가 계속 쌓인다.
  세션 문서는 `expireAt` 을 심어 뒀지만 **지우는 사람이 없다** → 별도 작업.
- **학급·앱 축 캡은 파일럿(교사 1명·학급 2개) 기준**이다. P3 개방에서 학급이 늘면 앱 축이
  먼저 포화한다 — 계획서가 예고한 "학급별 예산 배분"이 그때 필요하다.
- **상한 숫자는 경제 정책이라 교사 확인 대상**이다(P1-7 절의 표 + `rewardRules.GLOBAL_CEILING`:
  학생 전체 하루 10만 · 학급 하루 200만 · 앱 하루 400만).

### 🧪 알아 둘 테스트 인프라 공백 (2026-08-20 실측)
1. **화면 렌더링 테스트를 못 붙인다.** `Dashboard.js` 를 테스트에서 import 하면
   `src/firebase/firebaseConfig.js:32` 의 `getAuth(app)` 이 실행되며 죽는다.
   그래서 화면 관련 테스트는 전부 **소스 순서·구조 단언**이다(변이로 실효성은 확인).
   진짜 렌더링 테스트를 붙이려면 firebase 모듈 체인 모킹이 먼저다 — 별도 작업.
2. **`npm run test:rules` 가 CI 에 없다.** firebase 로그인·네트워크가 필요해서다.
   권한 경계의 가장 강한 테스트(에뮬레이터급 실판정)가 아무 데서도 안 돈다.
   → 계획서 **P2-16** 이 이미 이 항목(에뮬레이터 기반 전환 + 배포 게이트 연결)을 잡아 뒀다.
3. **테스트가 import 하는 모듈은 로드 시점에 I/O 를 하면 안 된다.** 공용 REST 헬퍼가
   `.firebaserc`(gitignore 대상)를 로드 중에 읽어서 **CI 에서만** ENOENT 로 죽었다
   (2026-08-21. 로컬 694/694 초록불). 설정 읽기를 함수 안으로 내렸고, 로드 중 파일을 읽으면
   실패하는 테스트를 붙였다. **재현법이 싸다**: `mv .firebaserc /tmp` 로 CI 조건을 로컬에 만든다
   (같은 요령 `mv functions/node_modules /tmp`).
5. **`vi.mock` 이 `functions/**` 에는 안 통한다.** vitest 가 그 파일들을 CJS 로 externalize 해서
   Node 의 require 로 싣기 때문에 vitest 의 모듈 그래프를 지나지 않는다(시도했더니 진짜 Firestore 가
   붙어 `Unable to detect a Project Id` 로 죽었다, 2026-08-21). **대안 = require 캐시에 직접 주입**:
   `createRequire(import.meta.url)` 로 `functions/utils.js` 를 먼저 부른 뒤 `db`·`admin` 만 갈아끼우고,
   **그 다음에** 검사 대상 모듈을 require 한다(대상이 로드 시점에 구조분해하므로 순서가 곧 계약이다).
   ⚠️ `LOG_TYPES`·`sanitizeInput` 같은 **순수 값은 덮지 말 것** — 목으로 덮으면 진짜 값이 바뀌어도
   테스트가 옛 값을 통과시켜 드리프트를 못 잡는다. 이 방식으로 `grantAppReward` 전체를
   가짜 Firestore 위에서 **진짜 실행**하는 테스트를 붙였다(`src/test/functions/aapReward.test.js`).
   한계: 가짜는 트랜잭션을 직렬화하므로 **진짜 경합은 재현 못 한다** — 그 자리는 원장 `create`
   (이미 있으면 실패)와 순서 단언이 지킨다.
4. **(해결됨)** CI 가 `--exclude` 3개로 테스트를 **575개만** 돌리고 있었다(로컬 636개).
   2026-07-19 임시 제외가 이슈 해결 후에도 남아 있던 것 — 2026-08-20 제거.

## 🔁 사후 교차검증 — 이미 **배포된** 직업 승인제 (2026-08-20)

계획서 항목이 아니라, 지난 라운드에 배포된 「직업 신청 승인제」를 뒤늦게 FULL 로 다시 본 결과다.
직업 개수가 주급을 정하므로(세전 = 200만 + (직업수−1)×50만) 이 코드는 **돈에 닿는다**.

| 발견 | 심각도 | 무엇이었나 | 조치 |
|---|---|---|---|
| 화면을 **먼저 열고** 대기 신청을 나중에 받아옴 | CRITICAL | 자식의 `tempSelection` 은 lazy 초기화라 마운트 때 딱 한 번 돈다 → 대기 직업이 **체크 안 된 채** 그려지고, 저장하면 서버가 "마음을 접음"으로 읽어 **신청을 취소**한다 | 순서 반전 |
| `fetchPendingJobIds` 가 실패를 `[]` 로 뭉갬 | CRITICAL | 조회 한 번 실패 = 위와 같은 취소. "없다"와 "모른다"는 다른 값이어야 한다 | `null` 반환 + 실패 시 화면을 **안 연다** |
| 조회가 **동시에 두 번** 돌 수 있음 (연타) | CRITICAL(2R) | 순서를 지켜도 먼저 끝난 스냅샷이 화면을 고정하고 늦은 결과는 뱃지만 바꾼다 — 같은 취소가 난다 | `pendingFetchInFlight` ref 빗장(+`finally` 해제) |
| 신청 취소가 **조건 없는 배치** | CRITICAL(2R) | 그 사이 선생님이 승인을 커밋해도 그대로 `canceled` 로 덮어쓴다. 학생은 직업을 갖는데 허가 기록이 사라진다(승인 트랜잭션은 자기만 지킨다) | `lastUpdateTime` 전제조건 + 어긋나면 전부-아니면-전무로 중단·재시도 안내 |
| `processJobApplication` 이 트랜잭션 밖 예외를 안 감쌈 | CRITICAL | `onCall` 은 `HttpsError` 아닌 예외를 `internal` 로 **마스킹**한다 → "그 직업이 삭제되었습니다" 같은 사유가 선생님에게 영영 안 뜬다 | try/catch 로 변환 |
| 판정 사유와 **운영 장애**를 한 코드로 뭉갬 | WARNING(2R) | Firestore 의 UNAVAILABLE·DEADLINE_EXCEEDED 도 전부 같은 자리로 떨어져, 선생님은 인프라 장애를 "규칙상 안 되는 일"로 읽고 로그엔 원인이 안 남았다 | `deny()` 표식 → 사유는 `failed-precondition`, 그 외는 로그 + `internal` |
| 승인 시점 재검증이 **트랜잭션 밖 스냅샷** | WARNING(2R) | 직업 삭제·지정전용 전환이 read set 에 없어 재시도를 안 일으킨다 | 그 **직업 한 건만** 트랜잭션 안에서 재조회(+id 직접 읽기라 학급 대조 추가). 상한은 잔여 — **급여가 매번 다시 자르므로 돈엔 안 닿는다** |
| 직업 개수 상한 클램프가 **네 곳에 복붙** | CRITICAL | 이 저장소는 정확히 이 실패모드로 주급 과다지급 사고를 낸 적이 있다 | `functions/jobUtils.js` `clampMaxJobs` 하나로. `resolveStudentJobs` 폴백의 리터럴 `5` 도 제거(2R NIT) |
| `MenuLocksContext` 취소 가드가 **죽은 코드** | WARNING | `await load()` 가 끝난 뒤에 확인해서 아무것도 막지 못했다 | setState 직전으로 이동 |
| 교사가 이름을 고쳐도 `hasSetNickname` 이 true 로 남음 | CRITICAL | "학생이 스스로 정했다"는 신뢰 표식이 거짓이 된다 | 이름 수정 시 `false` 로 되돌림 |

**검증**: 변이 12종(2R) + 15종(1R) 전부 검출. `npm test` 651개 · `npm run test:rules` 161개 · Tier-0 게이트 전부 PASS.
**교훈**: 지적의 다수가 "원래 있던 버그"가 아니라 **내 수정이 만든 결함이거나, 순서만 보는 테스트가 못 보는 동시성**이었다.
소스 순서 단언은 "누가 순서를 되돌렸나"는 잡지만 **"동시에 두 번 돌면?"** 은 구조적으로 못 본다 — 그 자리는 가드 단언으로 지킨다.

## P2 이후 — 미착수
계획서 §4 참조. P2 = 개방 전제조건 대공사(격리·스케줄러·온보딩·법), 겨울방학.
P3 = 2027-03 개방. P4 = 내장 AI. P5 = 생성 템플릿.

### 📐 P1-9 설계안 **2판** (2026-08-21, codex REQUEST_CHANGES 반영)

1판은 **경보를 만들려다 지급을 끄는 설계**였다. codex 지적 6건을 전부 코드에서 재현했고
CRITICAL 3건은 내가 만든 결함이었다. 아래는 재현 결과와 고친 설계다.

#### 재현한 것 (지적을 믿기 전에 근거를 봤다)

| 지적 | 근거 | 판정 |
|---|---|---|
| 경보 `create()` 충돌이 **지급 전체를 롤백**시킨다 | 트랜잭션 안 `ALREADY_EXISTS` 는 콜백에서 정상 결과로 못 바꾼다 | ✅ 사실 |
| 환수 권한 헬퍼가 **대상 학급을 안 본다** | `functions/utils.js:150` — `checkAdmin` 은 승인 교사 여부만 | ✅ 사실 |
| `grantId` 는 비밀이 아니다 | `firestore.rules:777` `activity_logs` read = `isSameClassFast` | ✅ 사실 |
| 원장에 이미 `revocable` 이 있는데 설계가 안 봤다 | `reward.js:377`, 기본값 `true`(`catalogRules.js:206`) | ✅ 사실 |
| 손상된 잔액이 "회수액 0, 환수 완료"가 된다 | `cashFloor.js:26` `Number.isFinite(x) ? x : 0` | ✅ 사실 |
| 교사 계정에도 세션이 만들어진다 | `handlers.js:110` — 역할 검사 없음. 지급은 나중에 `not_student` | ✅ 사실 |

#### ① 자동 차단기 — **지속형 latch**. 자정에 안 풀린다

```
경보선 = appPerDay × 0.5   → 카운터에 alerted{cash|coupon}   ... 지급 계속
차단선 = appPerDay × 0.8   → 카운터에 tripped{cash|coupon}
                            + **정책 문서 rewardsEnabled:false**  ← 여기가 진짜 kill switch
하드캡 = appPerDay          → 기존 app_total_daily_cap
```

- 판정은 **지급 후 합계**로 한다: `used.app[type] + amount >= 임계`.
- 현금·쿠폰은 단위가 다르므로(400만원 / 400장) **플래그를 종류별로 나눈다**. 한 종류가 넘었다고
  다른 종류까지 막으면 원인을 못 찾는다.
- 🔑 **자정 리셋 문제의 해답**: 날짜 카운터에만 두면 자정에 저절로 풀려 "직전 80% + 직후 80%"가
  된다. 그래서 차단은 **날짜가 없는 정책 문서**(`rewardsEnabled:false`)에 건다.
  정책 문서는 트랜잭션이 **이미 읽고 있으므로** 추가 읽기가 없다.
- 🔓 **푸는 길은 `breaker-reset` 하나다**(3판 정정 — 아래 「복구가 막혀 있었다」 참고).
  `rewards-on` 만으로는 안 풀린다: latch 조건이 전이가 아니라 **상태**라 다음 지급에서 곧바로
  다시 끊긴다(fail-safe). reset 은 `breakerOverrideDay` 에 오늘(KST)을 박아 **자정에 만료**된다.
- 동시성은 안전하다 — 같은 앱의 모든 지급이 같은 카운터 문서를 읽고 쓰므로 Firestore 가
  직렬화한다. 차단선을 넘길 수 있는 건 **처음 넘기는 그 1건**뿐이다.

#### ② 경보 — **보호는 원자적으로, 통지는 최선노력으로**

이 둘을 갈라놓는 것이 1판의 결함을 고치는 핵심이다.
- 트랜잭션 **안**: 카운터 플래그 + `rewardsEnabled:false`. 여기까지가 **보호**이고 원자적이다.
- 트랜잭션 **밖**(커밋 성공 후): `logger.error({event:"aap_reward_alert"...})` + `platformAlerts` 문서.
  통지가 유실돼도 **보호는 이미 걸려 있다**. 반대로 통지를 원자적으로 만들려다 지급을 죽인 게 1판이다.
- `logger` 를 트랜잭션 콜백 안에서 부르지 않는다 — 콜백은 재실행되므로 커밋 안 된 경보가 찍힌다.
  전이 여부(`newlyAlerted`/`newlyTripped`)를 **반환값으로** 빼서 밖에서 기록한다.
- `platformAlerts` 는 `set()` 으로 쓴다(`create()` 아님 — 충돌이 곧 실패였다). 문서 id 는
  `{day}_{appId}_{kind}`, `kind` 는 **고정 enum**(`cash_alert|cash_trip|coupon_alert|coupon_trip`).
- rules 에 `platformAlerts` 블록을 명시한다(교사 읽기 허용 · 쓰기 서버 전용).
- ⚠️ **완료 조건에 "Monitoring 정책을 실제로 걸고 수신까지 확인"을 넣는다.** 로그를 뱉는 것은
  경보가 아니다.

#### ③ 환수 — `appRewardClawbacks/{grantId}` 를 `create()` 로. 원장은 안 건드린다

`clawbackAppReward` (callable). 원장이 append-only 라고 선언돼 있으므로 **원본을 수정하지 않고**
별도 컬렉션을 멱등키 겸 역원장으로 쓴다(문서 id = grantId → `create()` 충돌이 곧 중복 방어).

인가 (`grantId` 가 비밀이 아니므로 여기가 유일한 벽):
- 교사: `grant.classCode === 호출자.classCode` **그리고** 지금 그 학생도 같은 학급일 때만
- 전학 간 학생 / 다른 학급 원장 → **슈퍼관리자만**
- `grant.revocable !== true` → 교사 거부(슈퍼관리자 예외는 **사유를 기록**)

한 트랜잭션 안에서: 원장 읽기 → 환수문서 존재 확인(멱등) → 잔액 읽기 → **잔액 타입 엄격 검사** →
`clampTakeAmount` → 차감 → 역원장 `create()` → `activity_logs`.
- ⚠️ 손상된 잔액을 `clampTakeAmount` 에 그대로 넣으면 0 으로 읽혀 **"회수액 0, 환수 완료"** 가
  확정되고 나머지는 영구 회수 불가가 된다. 타입이 이상하면 **환수하지 말고 거부**한다.
- 역원장에 `requestedAmount` · `recoveredAmount` · `shortfall` 을 남긴다. 부분 회수는 **1회성**이고
  나머지는 교사가 일반 회수(`adminCashAction`)로 처리한다 — 그렇게 문서에 못 박는다.
- 🔒 **하루 카운터·성취 횟수·쿨다운·차단 플래그는 하나도 안 되돌린다.** 되돌리면
  환수→재지급으로 발행 한도를 무한 재사용할 수 있다. 그날 그 앱이 계속 막히는 건 가용성
  문제일 뿐이고, 돈 쪽에선 이게 fail-safe 다.

#### ④ `issueAppToken` 레이트리밋 — uid 를 경로에 붙이지 않는다

- 키 = `aapRateLimits/tok_{sha256(uid).slice(0,32)}`. raw uid 를 쓰면 "Firebase uid 는 영숫자"라는
  **계약에 없는 전제**에 기댄다(커스텀 uid 는 1~128자 임의 문자열이고 공식 예시가 `some-uid` 다).
  해시로 고정 길이를 만들면 그 전제가 통째로 사라진다.
- `consumeBucket` 이 내부 상수 `RATE_LIMIT` 을 직접 참조하므로 **설정을 인자로 받게 고친다**
  (기본값 = 기존 값이라 지급 경로의 동작은 안 바뀐다). 발급은 `{CAPACITY:20, REFILL_MS:6000}`.
- **사용자 문서 읽기보다 앞에** 놓는다. 지금은 `checkAuthAndGetUserData` 가 첫 줄이라
  거부될 호출도 사용자 문서를 읽는다.
- 🚫 **역할 있는 계정에는 세션을 만들지 않는다.** 교사도 앱은 열되, 지급이 어차피 `not_student`
  로 거부할 세션을 쓰지 않는다.

#### ⑤ 비용 천장 — 오류율 카운터 대신 `maxInstances`

codex 는 오류율 차단기 제외가 위험을 남긴다고 했고 그 지적 자체는 맞다(금액 차단기는 **성공한
지급만** 세므로, 전부 실패하는 앱 배포엔 영원히 반응하지 않는다). 다만 호출마다 +1R/+1W 를
붙이는 대안은 채택하지 않는다 — 고정 비용이 두 배가 되고, 그 카운터 자체가 공격 표면이다.
대신 codex 가 같이 제시한 것 중 **실효가 확실한 쪽**을 택한다:
- `grantAppReward`·`issueAppToken` 에 **`maxInstances`** 를 건다. Firestore 비용이 아니라
  **함수 호출 비용에 천장**이 생긴다. 레이트리밋으로는 못 막는 부분이 이걸로 막힌다.
- 로그 기반 오류율 알림은 ②의 Monitoring 정책과 같은 자리에서 건다.

#### ⑥ 운영 게이트 — **보상을 켜기 전에** 반드시 끝나 있어야 하는 것
- `aapRewardSessions.expireAt` **TTL 정책 적용**(콘솔/gcloud. 코드가 아니다. 이 프로젝트 TTL 0개)
- `platformAlerts` 를 실제로 수신하는 Monitoring 정책 1개 + 수신 테스트

#### 나누기 — 한 번에 다 하지 않는다
- **P1-9a**: 차단기 latch · 경보(커밋 후) · rules · `maxInstances` · 발급 레이트리밋 · 역할 계정 세션 제외
- **P1-9b**: `clawbackAppReward` + `appRewardClawbacks` + rules
- **P1-9c**: TTL 정책 · Monitoring 경보 (운영 작업 — 배포가 아니라 게이트)

### ✅ P1-9a 구현 + 교차검증 (2026-08-21) — 배포 전

| 파일 | 무엇 |
|---|---|
| `functions/aap/rewardRules.js` | `checkBreaker`(지급 후 합계·현금/쿠폰 분리·override) · `bucketKeyForUid`(uid 해시) · `consumeBucket` 설정 인자화 · `TOKEN_RATE_LIMIT` · `app_tripped` 사유 |
| `functions/aap/reward.js` | 차단기를 지급 트랜잭션 안에 · 정책 latch · `announceBreaker`(커밋 **후**) |
| `functions/aap/handlers.js` | 발급 레이트리밋을 사용자 읽기보다 **앞**으로 · 역할 계정 실행권 제외 · `maxInstances` |
| `firestore.rules` | `platformAlerts`(교사 읽기 · 쓰기 서버 전용) |
| `scripts/ops/aap-switch.mjs` | `breaker-reset <appId>` — **유일한 해제 수단** |

**실측**: vitest 799 통과 · rules 196 통과 · **변이 20종 전부 검출(생존 0)** · Tier-0 전부 PASS.
라이브 영향 0(앱 11개 전부 이관·보상 꺼짐, 상한 0/0).

#### 🔴 복구가 막혀 있었다 — 안전장치의 복구 경로가 설계상 불가능했다

1판(구현 직후)은 차단기가 끊으면 **자정까지 아무도 되돌릴 수 없었다.** 세 겹으로 막혀 있었다:
1. 거부를 **날짜 카운터의 `cashTripped`** 로 했다 → `rewards-on` 해도 그 플래그가 남아 계속 거부.
2. 정책만 보게 고쳐도, latch 조건이 **전이(`newlyTripped`)** 라 재활성 후엔 전이가 안 일어나
   **방어가 조용히 사라졌다.** (거부는 풀리는데 차단기도 같이 죽는다 — 더 나쁜 쪽)
3. 앱 축 상한(`APP_CASH_PER_DAY` 400만)은 **코드 상수**라 "상한을 올려 해제"라는 길이 없다.

고친 방법:
- 거부 사유를 **정책 문서**(`rewardsDisabledReason` 접두사 `auto_breaker_`)에서 끌어온다
  → 상태가 한 문서에 모이고, 사유 정확도도 유지된다(`app_tripped` vs `rewards_off`).
- latch 조건을 **상태(`tripped`)** 로. 재활성 후 첫 지급에서 다시 끊긴다 = fail-safe.
- **`breakerOverrideDay`** — 날짜가 박힌 하루짜리 override. 경보는 그대로 남긴다
  (조용해지는 스위치면 켠 사람도 무슨 일이 나는지 못 본다). 하드캡은 여전히 살아 있다.
- `isAppTripped` 는 죽어서 삭제.

**교훈**: 안전장치를 만들 때 "발동하면 어떻게 되돌리나"를 **같이** 만들지 않으면, 안전장치가
정상 수업을 하루 죽이는 장치가 된다. 이번엔 세 겹이라 한 겹만 고쳤으면 2번(방어 소멸)에 빠졌다.

#### 🔎 P1-9a 교차검증 — **2계열**(Gemini 미참여)

| 계열 | 판정 | 결과 |
|---|---|---|
| Claude (정확성·유지보수성) | REQUEST_CHANGES | CRITICAL 1(복구 경로 — 위와 같은 결함에 **독립 도달**) · WARNING 1 · NIT 2. **전부 채택** |
| codex `gpt-5.6-sol` (공격자) | REQUEST_CHANGES | 지적 3건 **전부 오탐**(아래). 다만 "결함이 아닌 것" 확인은 유효 |
| Gemini (가용성·운영) | — | **쿼터 소진**(계정 한도, 리셋 ≈2026-08-26). 로컬은 diff 1,139줄이라 조건 밖, 웹 ChatGPT는 같은 GPT 계열이라 대체 불가 |

**Claude 가 잡은 것 중 내가 못 본 것**: `"차단된 뒤의 다음 지급은 거부된다"` 테스트가
`expect(["rewards_off","app_tripped"]).toContain(...)` 로 **헤징**했는데, `stage()` 가 넘긴 정책을
기본값 뒤에 스프레드해 `rewardsEnabled` 가 **항상 false 로 결정적**이었다 → 사유는 늘
`rewards_off` 이고 `app_tripped` 는 나올 수 없다. **두 검사의 순서가 뒤바뀌는 회귀를 못 잡는
테스트**였다. 사유를 못 박고 수동 차단 케이스를 분리했다.

#### ⚠️ codex 오탐 3건 — **고친 기록을 버그로 되읽었다**

세 지적 모두 이 저장소가 **고친 결함을 그 자리에 남긴 주석**을 현재 상태로 읽은 것이다.
전부 코드에서 직접 재현해 반증했다:

| codex 지적 | 반증 |
|---|---|
| 교사가 `appRewardDaily` 를 리셋해 학생 캡 우회 (CRITICAL) | 교사 분기 차단목록에 있음(`firestore.rules:376,397`). 그 시나리오 그대로의 **DENY 테스트가 통과** |
| `dayTotals` 가 손상값을 0 으로 읽어 fail-open | 문자열·음수·NaN 전부 **`null`** → `counter_corrupt` 거부 |
| 미래 `lastRefillMs` 가 영구 잠금 | `Math.min(nowMs, ...)` 로 현재로 끌어내림. 2초 뒤 정상 회복 |

셋 다 주석에 `2026-08-21 codex WARNING/CRITICAL` 이라고 **수정 이력이 적힌 자리**다.
codex 는 자기가 지난 라운드에 지적하고 이미 고쳐진 것을, 그 수정 기록을 읽고 다시 지적했다.
(검토 중 변이 시험이 겹친 것도 사실이지만, 세 건 다 변이가 건드리지 않은 줄이다.)

**codex 가 유효하게 확인해 준 것**: 정책 문서 부재 시 `tx.update` 가 NOT_FOUND 로 지급을 죽이는
경로 없음(`checkPolicyOpen(null)` 이 먼저 거부) · 카운터의 절대값과 `increment(1)` 혼용이
race 를 만들지 않음(같은 트랜잭션에서 읽고 씀) · 인증 사용자가 남의 발급 버킷을 소모시키는
경로 없음 · 발급과 지급의 역할 검사가 동일.

#### 🟡 P1-9 남은 것
- **P1-9b**: `clawbackAppReward` + `appRewardClawbacks` + rules (설계 2판 ③ 참고)
- **P1-9c(운영)**: `aapRewardSessions.expireAt` TTL 정책 · `platformAlerts` 를 실제로 수신하는
  Monitoring 정책 + 수신 테스트. **둘 다 보상을 켜기 전에** 끝나 있어야 한다
- Gemini 레그 재실행(쿼터 회복 ≈2026-08-26) — 가용성·운영 렌즈가 통째로 비어 있다

### ✅ P1-9b 환수 (2026-08-21) — 배포 전

| 파일 | 무엇 |
|---|---|
| `functions/aap/clawback.js` (신규) | 순수 핸들러. 인가·멱등·소각·부분회수 |
| `functions/aap/handlers.js` | `clawbackAppReward` onCall 진입점 — 인가와 사유→HttpsError 변환만 |
| `firestore.rules` | `appRewardClawbacks` — 교사 읽기는 **자기 학급만**, 쓰기 서버 전용 |
| `scripts/ops/aap-grants.mjs` (신규) | 지급 원장 조회. **grantId 를 볼 수 있게 하는 유일한 수단** |

**실측**: vitest 824 · rules 202 · **환수 변이 21종 전부 검출(생존 0)** · Tier-0 전부 PASS.

#### 💥 발행의 반대는 회수가 아니라 **소각**이다

`adminCashAction`(관리자 회수)은 학생에게서 빼서 **국고에 넣는다**. 그런데 학습앱 보상은
국고에서 나온 돈이 아니다 — `grantAppReward` 는 국고를 건드리지 않고 학생 잔액을
`increment` 로 **발행**한다. 회수로 되돌리면 **국고에 없던 돈이 생긴다.**
그래서 `clawbackAppReward` 는 어디에도 적립하지 않는다. 변이 시험이 이 불변식을 잠근다
("소각이 아니라 국고로 옮긴다" → 검출).

#### 되돌리지 않는 것 (일부러)
하루 카운터 · 성취 횟수 · 쿨다운 · 차단 플래그를 **하나도** 되돌리지 않는다. 하루 캡은 잔액
회계가 아니라 **발행 속도 제한**이라, 환수가 캡을 되열면 "환수 → 재지급"으로 상한을 무한히
우회할 수 있다. 대가는 그날 그 학생·앱이 계속 막히는 가용성 문제뿐이고 돈 쪽에선 fail-safe 다.

#### 🔎 교차검증 — 2계열 (Gemini 여전히 쿼터 소진)

**Claude: REQUEST_CHANGES — CRITICAL 은 "부를 방법이 없다"였다.**
`grep -rn "clawbackAppReward" src/` = 테스트 외 **0건**. 게다가 `grantId`(sha256 64자)가 어느
화면에도 안 나온다 — `MyAssets.js` 가 활동로그의 `metadata` 를 버린다. 교사가 부를 길이
Firebase 콘솔뿐이었다. **함수만 있고 호출자가 없으면 기능이 없는 것과 같다.**
→ `aap-grants.mjs` 로 **조회**를 열었고(어려운 절반), **호출 UI 는 P1-5 로 명시적으로 미룬다**.
→ 그리고 아래 게이트에 넣었다: **호출 경로 없이 파일럿을 열지 않는다.**

Claude 가 직접 확인해 문제없다고 한 것: 회계 대칭(발행=mint/환수=소각, 국고 미접촉) ·
MyAssets 이중 카운팅 없음 · `callerClass` 스푸핑 불가(서버 파생) · 잔액 손상 가드 ·
이중 환수 방어 · 일별 캡 미환원 · 프로토타입 오염 안전 · 자기참조 테스트 없음.

WARNING 2건도 채택: onCall **배선 계층** 테스트가 0건이었다(형제 함수는 있었다) → 구조 테스트
5개 추가. `appRewardClawbacks` 읽기가 학급 스코프 없이 열려 있었다 → **좁혔다**(리뷰어는 기존
부채로 분류했지만, 이 저장소엔 "읽기만 안 잠근 버그클래스" 전례가 있다).

#### 🪤 내 변이 스크립트가 codex 와 **같은 함정**에 걸렸다

`checkAuthAndGetUserData(request, true)` 를 없애는 변이가 생존했다. 원인은 테스트 공백이
아니라, **그 코드 문자열을 담은 주석이 실제 호출부보다 앞에 있어서** 첫 매치가 주석으로
갔기 때문이다(주석만 바뀌었으니 테스트가 통과하는 게 맞다). 앵커를
`= await checkAuthAndGetUserData(request, true);` 로 좁히자 즉시 검출됐다.
→ 지난 라운드 codex 오탐 3건과 **같은 원인**이다: 이 저장소의 주석은 코드를 그대로 인용한다.
   사람이든 모델이든 스크립트든, **주석을 코드로 착각한다.**

#### 🚦 파일럿(P1-4)을 열기 전 게이트
1. ⬜ **환수 호출 경로** — 교사 화면(P1-5). 지금은 `aap-grants.mjs` 로 조회만 된다
2. ✅ **TTL** — `aapRewardSessions.expireAt` 적용 완료(2026-08-21, 문서 0건 상태에서 켜 삭제 위험 0)
3. ⬜ `platformAlerts` 를 실제로 **수신**하는 Monitoring 정책 + 수신 테스트

#### ⏳ TTL 을 조사하다 더 큰 걸 찾았다 (라이브 실측 2026-08-21)

| 항목 | 실측 |
|---|---|
| 이 프로젝트의 TTL 정책 | **0개** (Firestore Admin API 직접 조회) |
| `expireAt` 을 쓰는 코드 지점 | **99군데** |
| `activity_logs` | **37,267건**, 그중 **3,164건이 이미 만료 시각을 지남** |
| `transactions` | 1,910건 |

**만료 표시만 찍고 지우는 사람이 아무도 없었다.** AAP 세션 누적은 이것 옆에서 각주다.
이번엔 **AAP 세션만** 켰다(문서 0건 = 삭제 위험 0). `activity_logs` 의 보존 기간(현재 코드상
90일)은 **교육적 판단**이라 — 학생이 자기 거래를 언제까지 볼 수 있어야 하는가 — 남겨 둔다.
도구: `scripts/ops/firestore-ttl.mjs`(조회 · `--check` · `--enable`).
⚠️ 함정: Admin 의 `fields.patch` 는 `updateMask` 를 **평문 FieldMask** 로 받는다.
   문서 REST 의 `updateMask.fieldPaths=` 관례를 쓰면 400 이다(실측).

### ✅ P1-3 학습기록 (2026-08-21) — 계획서 §3.4. 배포 전

| 파일 | 무엇 |
|---|---|
| `functions/aap/learningRules.js` (신규) | 순수 규칙 — 경로·상한·집계 산술·세션 경계 |
| `functions/aap/learning.js` (신규) | `recordLearningEvent` 본체 |
| `functions/aap/handlers.js` | HTTP 진입점 + **실행권 조건을 `rewards || stats` 로 확장** |
| `firestore.rules` | 집계는 본인·담임만 읽기·**쓰기 전면 금지** · 원시 이벤트는 서버 전용 |
| `scripts/ops/aap-switch.mjs` | `stats-on` / `stats-off` |
| `docs/AAP_V1_SPEC.md` §5.5 | 앱 제작자용 계약 |

**실측**: vitest 847 · rules 212 · **변이 24종 전부 검출(생존 0)** · Tier-0 전부 PASS.

#### 착수하자마자 막혔던 것 — 학습기록이 uid 를 못 찾는다

토큰에는 uid 가 없다(앱별 pairwise `sub` 뿐). P1-2 가 그 다리를 `aapRewardSessions` 로 놓았는데
그 문서는 **`rewardsEnabled` 일 때만** 만들어진다 — 지금 11개 앱이 전부 보상 꺼짐이라
**세션이 한 건도 안 생긴다.** 그래서 조건을 `rewardsEnabled || statsEnabled` 로 넓혔다.
"쓰는 만큼만 낸다"는 원칙은 그대로다 — 둘 다 꺼진 앱은 여전히 아무것도 안 쓴다.

#### 계획서와 현실이 어긋난 곳 — `classId` 가 아직 없다

계획서 §3.6 은 **불변 랜덤 `classId`** 를 쓰라고 하고 "`classCode` 를 영구 PK 로 쓰면 코드
재사용 시 통계가 섞인다"고 경고한다(C18). 그런데 라이브의 `classes` 는 아직 **classCode 가
문서 id** 다(`BG6QUC`·`9BVPKP`). classId 도입은 스케줄러·대시보드·`settings/classCodes` 를
전부 건드리는 별도 공사다.

→ 지금은 `classes/{classCode}/learningStats/…` 로 가되, 계획서가 요구한 대로 **식별값을 전부
명시 필드로도** 남긴다(`classCode`·`uid`·`date`·`appId`). 나중에 경로가 바뀌어도 필드로
재부모화할 수 있다. **남는 노출은 "코드를 재사용하면 섞인다" 하나** — 그건 기록해 둔다.

#### 정한 것 셋
- **세션 수는 시간 공백(30분)으로 센다.** 실행 id(jti)로 세면 토큰 수명이 5분이라 20분 놀면
  **4세션**이 되어 교사 화면이 거짓말을 한다.
- **세션을 읽되 소비하지 않는다.** 소비는 지급의 규약이고, 학습기록은 한 실행에서 여러 번
  일어나는 게 정상이다. 이미 지급으로 소비된 세션도 기록은 계속 받는다.
- **집계 쓰기는 교사도 막는다.** 고칠 수 있는 통계는 통계가 아니다.

#### 🚫 이번에 **일부러 안 한 것**: 서버 발급 event nonce
P1-2 주석이 예고한 "한 실행에서 여러 보상"(nonce)은 **이미 배포된 돈 코드의 세션 소비 규약을
바꾸는 일**이라 자기 몫의 FULL 라운드가 필요하다. 지금 구조는 세션이 1회용이라 nonce 없이도
안전하다 — `eventId` 는 멱등 해시에 자리만 잡아 두었고 지급이 검증하지는 않는다.

#### 내 버그 하나 (테스트가 잡음)
`dayStats` 의 "새 하루" 조기 반환에 `lastEventAt` 이 빠져 첫 이벤트에서 `undefined` 가 흘렀다.
`nowMs - undefined = NaN` 이고 NaN 비교는 false 라 **첫 세션이 0으로 세졌다.**
조기 반환은 늘 같은 모양이어야 한다.

#### 🪤 자기참조 테스트에 **세 번째** 걸렸다
기대 경로를 `L.statsPath()` 로 만들었더니, 경로를 이어붙이기 id 로 바꾸는 변이에서
**테스트도 같이 움직여** 통과했다. 경로 문자열을 손으로 박자 즉시 검출됐다.
(앞선 두 번: 차단기 임계값 비율 · 환수 `checkAuthAndGetUserData` 주석 앵커)

### 🔎 P1-3 교차검증 (2026-08-21) — codex REQUEST_CHANGES · Claude APPROVE · Gemini 재가동

세 계열이 **겹치는 지적을 하나도 안 냈다.** codex 는 전 건을 실행으로 재현해 왔고, 그중
가장 큰 것은 내가 "일관성"이라고 생각한 설계가 실제로는 **돈 경로를 굶기고 있었다**는 것이다.

#### 🔴 학습기록이 지급을 굶겼다 (통을 공유했다)
`learning.js` 가 `reward.js` 의 `passRateLimit` 을 **같은 키**로 불렀다 — 통이 하나였다.
codex 재현: 학습 이벤트 30건을 보낸 뒤 **진짜 지급이 `rate_limited`**. 학생은 스테이지를
깼는데 돈을 못 받는다. 과다지급이 아니라 **미지급**이라 조용히 지나간다.

→ 통을 나눴다. 그리고 같은 트랜잭션 코드가 이미 두 벌(`handlers`·`reward`)이라 세 번째가
붙으려던 참이어서, 구현을 **`functions/aap/rateBucket.js` 한 곳으로** 모았다.

🔴 **일반화: "일관성"과 "결합"은 겉모습이 같다.** Claude 리뷰는 같은 코드를 보고 통 공유를
   *장점*("복붙 회피")으로 적었다. 재사용해도 되는 것은 **구현**이고, 나눠야 하는 것은
   **자원**이다. 빈도가 다른 두 경로가 한 자원을 쓰면 시끄러운 쪽이 조용한 쪽을 굶는다.

#### 🔴 차단이 곧 비용이었다
거부해도 매번 버킷 문서를 썼다 — codex 실측 **차단 1,000건 = 쓰기 1,000회**.
거부 중에는 새 상태가 저장값과 **똑같은데도** 썼기 때문이다.
→ `consumeBucket` 이 `changed` 를 같이 돌려주고, 호출부는 바뀔 때만 쓴다.
실측 before/after: 1,030콜 기준 쓰기 **1,090 → 180**, 차단 구간만 보면 **1,000 → 0**.

⚠️ `changed` 를 `allowed` 로 갈음하면 안 된다. **거부인데 바뀌는 경우**가 있다 —
저장값이 미래 시각이면 클램프 결과를 써야 버킷이 치유된다(안 쓰면 영구 잠금).

#### 🔴 인증 거부가 전부 409 로 나갔다
`learningRules.DENY_STATUS` 가 인증·레이트 계열을 빠뜨려 기본값 409 로 샜다.
**명세(§5.5)에는 401/429 로 적혀 있었다** — 문서가 맞고 코드가 틀렸다.
409 를 받은 앱은 "충돌"로 읽어 토큰을 새로 받지 않고 **죽은 토큰으로 무한 재시도**한다.

#### 🔴 날짜 손상만 fail-open 이었다
경로가 이미 `days/{day}` 라, 그 자리 문서의 날짜 불일치는 "어제 것"이 아니라 **손상**이다.
같은 날짜의 타입 손상은 `null`(거부)로 막으면서, 날짜가 어긋난 문서는 0 으로 리셋해
**하루 상한을 통째로 다시 열었다.** `date` 필드가 아예 없는 문서도 같은 구멍이었다.
→ 둘 다 fail-closed. 빈 문서 `{}` 만 예외로 둔다(값이 아니라 자리다).

#### 🟡 그 밖
- `meta` 는 키 **개수**와 **값** 길이만 쟀다. 2MB 짜리 키가 통과해 Firestore 쓰기에서 터지면,
  읽기·쓰기를 다 태운 뒤 `retryable:true` 503 이 나가 재시도까지 부른다 → 키 길이도 잰다.
- `aap-switch.mjs list` 에 `statsEnabled` 열이 없어, 어떤 앱이 실행권을 만드는지 안 보였다.
- `appLearningEvents` TTL 미적용(Claude·codex 둘 다 지적) → 라이브 0건 확인 후 적용. **ACTIVE**.

#### ❌ 기각한 지적과 그 이유
- **"같은 토큰 재생으로 중복 기록"** → 설계다. 위성앱은 토큰 하나로 여러 이벤트를 보낸다
  (세션 미소비가 P1-3 의 핵심 결정). 남은 실질은 **503 재시도 시 과다 집계**뿐이라,
  명세에 `at-least-once` 로 명시하고 "정확도가 필요하면 `sessions` 를 보라"를 덧붙였다.
- **"`forRewards` 를 지급에서 검사하라"** → 안전 영향 없음. kill switch 방향(끄기)은 지급
  트랜잭션 **안에서** 정책을 새로 읽어 이미 즉시 듣는다. 켜는 방향은 안전 문제가 아니다.
- **"classCode 재사용 시 과거 기록 노출"** → 위에 이미 적어 둔 알려진 절충(§classId).
- codex 가 rules 하네스·TTL 조회를 "재현 실패"로 적은 건 **codex 샌드박스에 네트워크가 없어서**다
  (`ENOTFOUND oauth2.googleapis.com`). 같은 항목을 Claude 가 라이브로 212/212 통과 확인했다.
  🔴 **검증자의 "확인 못 했다"는 "문제 있다"가 아니다** — 환경 제약과 결함을 갈라 읽을 것.

#### 🟢 Gemini 레그가 3라운드 만에 살아났다 (agy 대신 웹 브릿지)
쿼터가 마르면 `gemini-validate.sh` 가 웹 통으로 내려간다. 가용성·운영·데이터설계 렌즈로
돌렸고 **CRITICAL 0 · APPROVE**. 숫자로 답해 온 것들:
- 40명이 동시에 써도 **문서 경합 0** — 학생·날짜·앱별로 문서가 완전히 갈라져 있다.
- 차단 무한루프 비용 = **시간당 약 $0.36**(읽기 $0.216 + 함수호출 $0.144). 쓰기가 0 이라 무시 가능.
- N-fan-out 40명 = 지연 100~200ms · 읽기 40~120. 인덱스 제약 아래서 현실적 선택.

그리고 **진짜 구멍 하나**를 찾았다 — 정책이 닫히거나 `stats_off` 로 거부될 때
**서버 로그가 하나도 안 남았다.** 교사가 "우리 반 기록이 안 쌓여요" 라고 할 때 가장 흔한
원인인데 Cloud Logging 으로 추적이 안 된다. 진입점 한 곳에서 사유+appId 를 남기게 고쳤다.
⚠️ `rate_limited` 만 뺐다 — **호출 횟수에 상한이 없는 유일한 사유**라, 찍으면 방금 0 으로
줄인 쓰기 비용이 로깅 비용으로 되돌아온다. 그건 429 응답코드가 함수 지표에 이미 잡힌다.

🔴 **주석 하나가 옛 근거를 그대로 달고 있었다.** 통 분리를 설명하는 새 주석 바로 위에
"지급과 같은 버킷을 공유한다 … 따로 두면 두 배로 두드릴 수 있다"가 남아 정면으로 모순됐다.
이 저장소가 이미 오탐 3건을 만든 바로 그 패턴이다 — **근거를 바꿀 땐 덧붙이지 말고 지운다.**

#### 📌 P1-5 교사 대시보드는 **N-fan-out** 으로 간다 (지금 정해 둔다)
"우리 반 오늘 전체"를 `collectionGroup('apps') + where(classCode, date)` 로 뽑으려면 **새 복합
인덱스**가 필요한데, 이 저장소 CI 는 `firestore:indexes` 를 배포하지 않는다.
→ 반 명부로 학생별 `days/{day}/apps` 를 도는 **경로 기반 조회**(인덱스 불필요, 읽기는 반 인원만큼).
P1-5 에서 collectionGroup 을 시도하다 뒤늦게 막히지 않도록 여기 박아 둔다.

### 🚦 파일럿(P1-4) 게이트 현황 — 2026-08-21 23:00 기준

| 게이트 | 상태 | 근거 |
|---|---|---|
| ① 원시 이벤트·세션 TTL | ✅ 닫힘 | `aapRewardSessions`·`appLearningEvents` 둘 다 **ACTIVE**(라이브 조회) |
| ② 환수 호출 경로 | ❌ **열림** | `clawbackAppReward` 는 배포됐지만 **부를 화면이 없다**. P1-5 소관 |
| ③ 경보 수신 | 🟡 배선 완료·수신 확인 대기 | 아래 |

**게이트 ③ 에서 실제로 만든 것** — 라이브에 알림 채널 0·정책 0·지표 0 이었다.
차단기가 울려도 **아무도 못 받는 상태**였다는 뜻이다.
- 로그 기반 지표 2개(`aap_reward_alert`·`aap_stats_denied`) · 이메일 채널 1개 · 경보 정책 2개
- 합성 로그로 끝까지 울려 **지표가 실제로 1 로 오르는 것까지 확인**(timeSeries 조회).
- 남은 한 칸은 **메일이 도착했는가** — 그건 사람만 확인할 수 있다.
  도구: `scripts/ops/monitoring-alerts.mjs list|setup|verify|test|teardown`

🔴 **"만들었다"와 "받는다"는 다른 문장이다.** 채널·정책이 존재해도 인증이 안 끝났으면
메일은 안 간다. 그래서 `test` 서브커맨드를 뒀다 — 배선의 마지막 칸은 코드가 아니라 수신함이다.

## 이 프로젝트에서 반드시 지키는 것
- `functions` 배포는 **`git push` → GitHub Actions 로만**. 로컬 `firebase deploy --only functions` 는 `functions/.env` 의 토큰을 파괴한다
- **커밋 여러 개를 한 번에 푸시해도** 배포가 건너뛰지 않는다(`deploy.yml` 푸시범위 기준, 2026-08-20 수정). 그래도 **배포 후엔 워크플로 초록불이 아니라 라이브 산출물을 확인**한다
- 저장소가 **PUBLIC** — 학생 실명·이메일·시크릿 커밋 금지
- `firestore.rules` 는 푸시 시 자동 배포된다. 잘못 잠그면 즉시 라이브 영향
