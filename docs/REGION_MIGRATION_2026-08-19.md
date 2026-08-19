# Firestore 서울 이전 — 실행 기록 (2026-08-19)

> `(default)` 를 **미국(nam5)에서 삭제하고 서울(asia-northeast3)에 다시 만든다.**
> 계획서(`AI_PLATFORM_PLAN_2026-08-17.md` §2.2)는 이걸 겨울방학(P2-0)으로 미뤄뒀지만,
> 여름방학 창이 아직 열려 있고 **학기 중엔 못 한다**는 판단으로 앞당겼다.

## 왜 "새 DB 로 컷오버"가 아니라 "(default) 재생성"인가

지난 세션은 `alchan-kr` 이라는 **이름 있는 DB** 를 만들어 그쪽으로 옮겨가려 했다.
그 경로를 접은 이유는 검증 중 나온 사실 하나 때문이다.

> **무료 할당량은 프로젝트당 DB 하나에만 붙는다.**
> *"The free tier applies to only one Cloud Firestore database per project.
> The first database that is created in a project without a free tier database will get the free tier."*
> — Google Cloud / Firebase 문서(`manage-databases`, `create-databases`)

지금 그 할당량(하루 읽기 5만·쓰기 2만)은 2025-04-16 에 만들어진 `(default)` 가 갖고 있다.
이름 있는 DB 로 옮기면 **그 할당량을 잃는다.** 계획서 §6 은 "이전만으로 비용 1.5배 여유"라고 썼는데,
그 계산에 무료 할당량 상실이 빠져 있었다. 실제 손익분기는:

| | nam5 (지금, 무료할당량 있음) | 서울 이름있는DB (무료할당량 없음) |
|---|---|---|
| 하루 7만 읽기(2학급 실측) | (7만−5만)×$0.60/100만 ≈ **$0.012/일** | 7만×$0.38/100만 ≈ **$0.027/일** |
| 하루 150만 읽기(개방 규모) | **$0.90/일** | **$0.57/일** |

**손익분기 ≈ 하루 13.6만 읽기.** 즉 지금 규모에선 이름 있는 DB 로 가는 게 오히려 손해고,
개방 규모에서만 이득이다. `(default)` 재생성은 이 손해를 안 만들면서 같은 이득을 가져간다.

덤으로 **앱·함수 코드 변경이 0곳**이다. DB 이름이 그대로라서
`initializeFirestore(app, …)` 도 `admin.firestore()` 도 손댈 게 없다.
(이름 있는 DB 였다면 클라 1곳·함수 1곳·ops 스크립트 전부를 바꿔야 했다.)

## 사전 확인 (실측)

| 확인 | 결과 |
|---|---|
| `(default)` 삭제 보호 | `DELETE_PROTECTION_DISABLED` — 삭제 가능 |
| `(default)` PITR | `DISABLED` (버전 보존 1시간) — 시점 복구 못 씀 |
| Firestore 트리거 함수 | **0개** (`onDocument*` 검색 0건) — DB 재생성으로 깨질 트리거가 없다 |
| DB 초기화 지점 | 클라 1곳(`firebaseConfig.js`) · 함수 1곳(`utils.js`) — 둘 다 이름 미지정 |
| `(default)` 이름 재사용 가능 여부 | 생성 시도 → `409 Database already exists` (**id 자체는 유효**, 삭제 후 재생성 가능) |
| 예약 함수 | 4개(stockPrice `*/20`, hourly `0 *`, weeklyEconomy `30 8 월·금`, dividend) → **전부 일시정지** |
| 백업 스케줄 | **없었다** — 학생 자산을 다루는 앱인데 백업이 0이었다(이전 후 신설) |

## 절차

```
① (default)[nam5] ──복사──▶ alchan-kr[서울]      + 로컬 JSONL 덤프 + 원본 해시
② 해시 대조 (원본 == 사본)
③ (default) 삭제 → asia-northeast3 로 재생성 → rules·indexes 배포
④ alchan-kr ──되담기──▶ (default)[서울]
⑤ 해시 대조 (원본 == 최종)  ← 무결성 증명
⑥ 예약 함수 재개 · 앱 스모크 테스트 · firebase.json 갱신 · 처리방침 정정
```

명령:

```bash
BK=~/Documents/dev/iwalchan/_backup-firestore-20260819    # 저장소 밖(학생 PII)

node scripts/ops/scheduler-pause.mjs pause                                    # 프리즈 시작
node scripts/ops/migrate-firestore-region.mjs --src '(default)' --dst alchan-kr --dump "$BK"
node scripts/ops/migrate-firestore-region.mjs --src alchan-kr --hash-only      # ② 사본 해시

firebase firestore:databases:delete "(default)" --project inconomysu-class --force
firebase firestore:databases:create "(default)" --location asia-northeast3 --project inconomysu-class
firebase deploy --only firestore --project inconomysu-class                   # rules + indexes

node scripts/ops/migrate-firestore-region.mjs --src alchan-kr --dst '(default)'
node scripts/ops/migrate-firestore-region.mjs --src '(default)' --hash-only    # ⑤ 최종 해시
node scripts/ops/scheduler-pause.mjs resume                                   # 프리즈 해제
```

## 무결성 증명 — 문서 수가 아니라 내용 해시

문서 수 대조는 약하다(같은 수의 다른 값도 통과한다). 그래서 **모든 문서를 정규형으로 직렬화해
sha256** 을 낸다. 정규형은 키를 정렬하고 `referenceValue` 에서 DB 이름을 지운다
— 그래서 nam5 원본과 서울 최종본이 **같은 해시**여야 한다.

| 단계 | 문서 수 | sha256 | 소요 |
|---|---|---|---|
| ① 원본 `(default)`@nam5 | 61,657 | `1ed5ca3d7dbe2c94724d915c162da9fad991a6aec4337f1c2e964bae01a012d0` | 1,054초 |
| ② 사본 `alchan-kr`@서울 | 61,657 | 동일 | 116초(읽기만) |
| ⑤ 최종 `(default)`@서울 | 61,657 | 동일 | 348초 복사 + 134초 검증 |

독립 검증(집계 쿼리, 순회와 다른 경로): 최상위 69개 + 컬렉션그룹 119개 전부 일치, 합계 61,657 / 61,657.

실행 시각: 프리즈 22:35 → 삭제 22:59 → 서울 재생성 23:04 → 되담기 23:11 → 해제 23:16 (KST).
`(default)` 는 삭제 후 **약 5분간 같은 ID 로 재생성이 막힌다**(`retry in N seconds`). 재시도 루프로 넘겼다.

## ⚠️ 이 작업에서 실제로 잃은 것 — 빈 문서 41건

정직하게 남긴다. **내 스크립트 버그로 문서 41건이 사라졌고 복구할 수 없다.**

- **무엇**: 필드가 **0개인 문서**. 원본의 `fields` 없는 항목 132건 중, 자식이 있어 구조로 재현된
  91건을 뺀 나머지.
- **왜**: Firestore REST 는 필드가 0개인 문서를 **`fields` 키 없이** 돌려준다 —
  "본문 없이 서브컬렉션만 있는 유령 부모"와 **응답 모양이 같다.**
  가르는 건 `createTime`(유령 부모엔 없다)인데, 스크립트가 `fields` 유무로만 갈랐다.
  (지난 세션 초안에는 `createTime` 을 언급한 주석이 있었는데 **동작하지 않는 빈 if 문**이었고,
  내가 다시 쓰면서 그 힌트째 지웠다.)
- **왜 해시가 못 잡았나**: 해시는 **"내가 읽은 것"끼리** 비교한다. 읽기가 빠뜨린 문서는
  양쪽에서 똑같이 빠져 **통과한다.** 순회와 독립적인 집계 쿼리(`--verify`)를 복사 **직후에**
  돌렸다면 잡혔다 — 순서를 틀렸다.
- **영향(전수 확인)**: 41건이 속한 최상위 컬렉션 33개는 전부 죽은 경로였다.
  `auctions`·`courtComplaints`·`policeReports`·`learningBoards` 등은 실사용 경로가
  `classes/{학급}/…` 이고 최상위는 이미 rules 에서 `if false`. `laws` 는
  `where("classCode","==",…)` 로만 조회하는데 **필드 없는 문서는 그 인덱스에 없어 원래도 안 잡혔다.**
  `economicEventLogs` 는 항상 `doc(classCode)` 로 직접 지정한다.
  → 기능 영향은 발견되지 않았다. 그래도 **잃은 건 잃은 것**이다.
- **고친 것**: 판정 기준을 `createTime` 으로 바꾸고 빈 문서 수를 따로 센다.
  `--verify` 를 컬렉션그룹까지 세도록 확장했다(서브컬렉션 유실도 잡히게).

## 교차검증이 뒤집은 것 (FULL · codex·Gemini·Claude 3계열)

세 계열 모두 REQUEST_CHANGES 였다. **겹치는 지적은 하나도 없었다** — 렌즈를 다르게 준 효과다.

| 계열 | 가장 값비싼 지적 | 조치 |
|---|---|---|
| codex | **프리즈가 프리즈가 아니었다** — 예약 함수만 멈췄고 클라이언트 직접 쓰기·onCall 함수·수동 GHA 는 열려 있었다. 순회에 `readTime` 스냅샷도 없어 17분 동안 컬렉션마다 다른 시점을 읽었다 | `--snapshot`(readTime 고정) 추가 · 스크립트 주석에 "완전한 프리즈가 아니다" 명시 |
| codex | 복사는 **upsert 지 mirror 가 아니다** — 대상에 남은 옛 문서를 지우지 않아 "동기화됨" 착각 | 비어 있지 않은 대상은 `--allow-nonempty` 없이는 거부 |
| codex | `paus` 같은 **오타가 resume 으로 처리**됐다(점검 중 쓰기 재개 = 최악) | 명령 화이트리스트 + 조회 실패 시 즉시 중단 |
| Claude | 예약 함수를 멈춘 채 잊으면 **주급·세금이 에러 없이 안 나간다**. 재발방지 장치가 0 | 정지 마커 + `--fail-if-paused` + CI 감시 워크플로 |
| Claude | `firebase.json` 배열화로 `firestore:rules` 가 **두 DB 에 배포**된다 → `alchan-kr` 삭제 시 CI 가 깨진다 | 삭제와 `firebase.json` 정리를 짝지어 문서화 |
| Gemini | 처리방침에 **이전받는 자의 연락처**가 없다(법 제28조의8 제2항 제3호) · 동의서 조문이 제22조(구법)로 박혀 있다 | 연락처 추가 · **제22조의2**(2023-09-15 시행)로 정정 · 동의서에 첨부파일 국외저장 고지 |

내가 직접 확인한 것: 제28조의8 제2항 제3호 원문("이전받는 자의 성명(법인인 경우에는 그 명칭과
**연락처**를 말한다)")과 제22조의2 신설 사실. 그리고 **제1항 제3호** — 처리위탁·보관은
제2항 각 호를 처리방침에 공개하면 별도 동의를 갈음할 수 있다. 그래서 첨부파일 국외저장은
동의 체크박스가 아니라 **처리방침 공개**로 처리했다.

기각한 것: 집계 응답 다중 프레임(`j[0]`만 읽는 문제)은 이 프로젝트에서 재현되지 않았지만
**고치는 비용이 거의 0**이라 방어적으로 반영했다. `-0` 소실은 실측 없이 등급을 올리지 않고
1줄 방어만 넣었다.

## 롤백

- **③ 이전**: 아무것도 안 건드렸다. 예약 함수만 재개하면 원상복구.
- **③ 이후 재생성이 실패하면**: 데이터는 `alchan-kr`(서울)에 그대로 있다.
  클라 1곳·함수 1곳의 초기화에 `alchan-kr` 을 넘기면 그대로 산다 — 즉 **최악이 애초의 B안**이다.
- **양쪽 다 잃는 경우**: 로컬 JSONL 덤프(`$BK/default.jsonl`)로 재적재.
  이 덤프는 **학생 개인정보를 포함**하므로 저장소 밖에 두고, 이전 검증이 끝나면 지운다.

## 이전과 함께 켠 것

- **일 단위 백업(보존 7일)** — 이전엔 백업 스케줄이 **0개**였다.
  `firebase firestore:backups:schedules:create --retention 7d --recurrence DAILY`
- **예약 함수 정지 방치 감시**(`.github/workflows/scheduler-guard.yml`) — 이번에 예약 함수를
  41분간 멈췄는데, 멈춘 채로 잊으면 **주급·세금이 에러 없이 안 나간다.** 3시간마다 +
  주급 30분 전(월·금 08:00 KST)에 상태를 확인해 하나라도 PAUSED 면 워크플로를 실패시킨다.
  `pause` 는 `systemState/schedulerPause` 에 마커를 남기고 `status` 가 경과 시간을 보여준다.
- **마이그레이션 스크립트 실쓰기에 `--commit` 요구** — 인자 없이 돌리면 기본값이
  `(default)` → `alchan-kr` 실쓰기라, 몇 달 뒤 맨몸 실행이 **롤백 사본을 덮어쓸** 수 있었다.
- **ops 스크립트 토큰 로직 단일화**(`scripts/ops/_auth.mjs`) — 같은 토큰 교환 코드가 5곳에
  복붙돼 있었다. 신규 2개는 공용 모듈을 쓴다(기존 3개 `verify-live-rules`·`live-audit-p0`·
  `seed-app-registry` 이관은 후속 작업). CI 용 `FIREBASE_TOKEN` 폴백도 여기 한 곳에만 있다.

## 남는 것 (이번 범위 밖)

- **Storage 는 여전히 미국(US-CENTRAL1)** 이다. 살아 있는 업로드 경로는 **학습게시판 하나**
  (`LearningBoard.js:527`)뿐이다 — `TrialRoom.js:440` 에도 업로드가 있지만 그 페이지는
  `AlchanLayout` 에 라우트가 없는 죽은 코드다. 버킷도 위치 변경이 불가라
  서울 버킷 신설 + 객체 이동 + `REACT_APP_FIREBASE_STORAGE_BUCKET` 교체가 별건으로 필요하다.
  **객체는 2개·30MB 뿐**이라 작업 자체는 작다(2026-08-19 실측).
- `alchan-kr`(사본)은 당분간 **롤백용으로 남긴다**. 이전이 안정됐다고 판단되면 삭제한다.
  ⚠️ **지울 때 `firebase.json` 의 `alchan-kr` 블록도 같이 지울 것.** 안 지우면 다음번
  `firebase deploy --only firestore:rules`(CI 가 매 배포마다 돈다)가 없는 DB 에 규칙을 배포하려다
  실패한다 — 배열 설정에서 `firestore:rules` 는 "규칙만"이라는 뜻이지 DB 선택이 아니라서
  **모든 항목**에 배포된다(firebase-tools `fsConfig.js` 확인).
- 죽은 최상위 컬렉션 33개와 `omokGames` 933건은 **이번에 같이 옮겼다**(무결성 증명 우선).
  정리는 별도 커밋으로 — 마이그레이션과 삭제를 한 커밋에 섞지 않는다.
- 그래서 처리방침 §7 은 **"DB 는 서울, 파일 저장소는 미국"** 으로 정확히 적는다.
  이전 문구("국내 서버에 저장됩니다")는 DB 에 대해서만 참이 됐고 파일에 대해선 여전히 거짓이다.
