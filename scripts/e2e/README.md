# 에뮬레이터 실조작 E2E

운영 데이터에 닿지 않고 **실제 화면을 눌러** 기능별로 Firestore 결과까지 대조한다.
(개발 모드 `vite` 는 `src/firebase/firebaseConfig.js` 가 에뮬레이터에 붙인다.)

```bash
# 1) 에뮬레이터 — JDK 21+ 필요. NODE_OPTIONS 는 Functions 에뮬레이터 결함 우회(파일 주석 참고)
JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
NODE_OPTIONS="--require $PWD/scripts/e2e/emulator-admin-bind-patch.cjs" \
  firebase emulators:start --only auth,firestore,functions --project inconomysu-class
# 2) 규칙 업로드 + 앱 관리자 계정
node scripts/e2e/seed.mjs
# 3) 개발 서버
npx vite --port 5199 --strictPort --host 127.0.0.1
# 4) 실행 — 교사 가입 → 승인 → 학생 4명 → 시나리오
node scripts/e2e/run.mjs                 # 전 시나리오
node scripts/e2e/run.mjs --visit         # + 세 역할로 전 화면 순회(콘솔 오류 0 검사)
node scripts/e2e/run.mjs --only=board,wall --shots
```

- 판정: `console.error`·`pageerror`·에뮬레이터 4xx/5xx·화면의 «권한/오류» 문구 + 시나리오별 Firestore 대조.
  하나라도 어긋나면 종료코드 1 (`E2E FAIL`), 전부 맞으면 `E2E PASS console_errors=0`.
- 실패한 단계는 모든 세션의 화면을 `$E2E_OUT/FAIL-<단계>-<역할>.png` 로 남긴다.
- 학급코드 없는 학생 로그인(`studentLogin`)은 운영 identitytoolkit 에 비밀번호를 묻기 때문에 여기선 재지 않는다.
- `_cf-probe.mjs`·`_rules-probe.mjs` = CF·규칙 단건 확인용(에뮬레이터 계정으로 로그인해 한 번 부른다).
