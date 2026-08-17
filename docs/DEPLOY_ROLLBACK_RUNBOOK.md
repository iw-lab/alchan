# 배포·롤백 런북

**작성** 2026-08-17 · **계기** 교차검증(Gemini 운영렌즈)에서 "이 저장소엔 롤백 절차 문서가 없다"가 지적됨.
**대상** `inconomysu-class` (알찬 · 라이브: 4학급 85명)

이 문서는 **확인된 사실만** 담는다. 추측한 절차는 넣지 않는다.

---

## 1. 무엇이, 어떤 순서로 배포되는가

`.github/workflows/deploy.yml` — `push` 시 실행. 스텝은 **순차**이고 `continue-on-error` 가 없다.
즉 **앞 스텝이 실패하면 뒤 스텝은 통째로 건너뛴다.**

| # | 스텝 | 트리거 조건 | 실패 시 뒤 스텝 |
|---|---|---|---|
| 1 | 산출물 검사 (`check-build-integrity` · `check-hosting-headers`) | 항상 | 전부 중단 |
| 2 | **Hosting** 배포 | `build/**` 변경 | 이후 중단 |
| 3 | **Functions** 배포 (`npm run lint` 게이트 포함) | `functions/` 변경 | ④⑤ 중단 |
| 4 | **Storage rules** | `storage.rules` 변경 | ⑤ 중단 |
| 5 | **Firestore rules** | `firestore.rules` 변경 | — |

### ⚠️ 여기서 나오는 위험한 중간 상태
**②는 성공했는데 ③이 실패하면 → 새 프론트 + 옛 규칙**이 라이브에 남는다.
③의 가장 흔한 실패 원인은 `functions/npm run lint` 다(배포 게이트로 일부러 넣어둔 것).

> 배포 직전 로컬에서 `cd functions && npm run lint` 를 먼저 돌려라. 이 한 줄이 위 상태를 거의 다 막는다.

---

## 2. 배포 전 체크 (로컬에서, 순서대로)

```bash
cd alchan
npm test                      # 488/488 (2026-08-17 기준). --exclude 로 숨기지 말 것
npm run test:rules            # 156/156. ⚠️ CI 밖인데 rules 는 자동 배포된다 → 반드시 수동 실행
cd functions && npm run lint  # ③ 스텝의 게이트. 여기서 걸러야 중간 상태가 안 생긴다
cd .. && npm run build        # build/ 는 커밋 대상 (deploy.yml 이 build/** 로 트리거)
git add build/                # 빠뜨리면 push 해도 Hosting 이 안 바뀐다
```

---

## 3. 롤백

### 3-1. Firestore 규칙 (가장 급한 층 — 학생이 화면을 못 쓰게 될 수 있음)
**증상**: 로그인은 되는데 특정 화면이 비거나 `permission-denied` 가 콘솔에 뜬다.

```bash
git checkout <직전_정상_커밋> -- firestore.rules
firebase deploy --only firestore:rules --project inconomysu-class
```
- git 기반이라 콘솔 UI 에 의존하지 않는다. **가장 확실한 경로.**
- 콘솔 경로: Firebase Console → Firestore Database → 규칙 → **버전 기록**에서 이전 버전 선택 후 게시.

### 3-2. Functions
```bash
git checkout <직전_정상_커밋> -- functions/
cd functions && npm ci && npm run lint && cd ..
firebase deploy --only functions --project inconomysu-class
```
> 🚫 **로컬에서 functions 를 배포하면 `SCHEDULER_AUTH_TOKEN` 이 날아가 HTTP 스케줄러가 401 로 죽는다.**
> deploy.yml 은 GitHub Secrets 에서 `functions/.env` 를 만들어 넣는데 로컬엔 그게 없다.
> **되도록 롤백 커밋을 push 해서 GHA 로 돌려라.** 부득이 로컬로 했다면 배포 후 `.env` 를 복구하고 재배포해야 한다.

### 3-3. Hosting
- **콘솔**: Firebase Console → Hosting → 릴리스 목록 → 이전 버전 **롤백**. (가장 빠름)
- **git**: 직전 정상 커밋의 `build/` 를 복원해 push.
  ```bash
  git checkout <직전_정상_커밋> -- build/
  git commit -m "revert(hosting): 롤백" && git push
  ```
- ⚠️ 보존 버전 수가 제한돼 있다(2026-08 비용 정리 때 `maxVersions` 를 줄였다).
  **콘솔에서 되돌릴 버전이 아직 남아 있는지 먼저 확인**하고, 없으면 git 경로를 쓴다.

### 3-4. 주급이 잘못 나갔을 때
`reverseLastWeeklySalary` HTTP 엔드포인트가 있다(`?weekKey=...&dryRun=true` 가 **기본값**).
반드시 `dryRun=true` 로 먼저 결과를 보고, `dryRun=false&confirm=...` 로 실행한다.

---

## 4. 배포 후 확인 (카나리아)

콘솔이 아니라 **실제 계정으로** 본다. 방학 중이면 학생 트래픽이 없어 "조용함"은 정상 신호가 아니다.

**먼저 기계로 확인한다** — 게시된 규칙이 내 파일과 같은지는 CI 초록과 별개 사실이다:
```bash
node scripts/ops/verify-live-rules.mjs   # 라이브 ruleset 원문 vs 로컬 firestore.rules
```

| 확인 | 정상 |
|---|---|
| 학생 계정 로그인 → 사이드바 | 학습 사이트 10개가 그대로 보인다 |
| 학생 → 상점 / 직업 / 할일 | 목록이 뜬다 (읽기 규칙 봉인이 자기 학급은 막지 않는지) |
| 교사 → 관리자설정 → 메뉴 잠금 | 항목 목록에 학습 사이트가 포함돼 있다 |
| 브라우저 콘솔 | `permission-denied` 0건 |
| Cloud Logging | `[주급 지급]`·`[학급 정본]` error 0건 |

**하나라도 어긋나면 §3-1 부터 되돌린다.** 원인 조사는 되돌린 뒤에 한다.

---

## 5. 타이밍

- 학생 접속이 0에 가까운 시간대(금·토 심야)에 배포하고, **등교 전 24~48시간 버퍼**를 둔다.
- 개학 직전·수업 시간대 배포는 하지 않는다.
