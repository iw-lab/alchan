#!/usr/bin/env node
/**
 * 로컬에서의 직접 배포를 막는다.
 *
 * 왜: functions 는 `SCHEDULER_AUTH_TOKEN` 없이는 못 돈다. 그 값은 저장소에 없고,
 * 배포 시점에 GitHub Actions 가 secrets 에서 꺼내 `functions/.env` 로 써 넣는다
 * (.github/workflows/deploy.yml). 로컬에는 그 파일이 없으므로, 여기서 배포하면
 * **토큰이 빈 채로 올라가고 스케줄러가 401 로 죽는다.** 되돌리려면 재배포해야 하는데,
 * 그동안 자동 정산·이벤트가 멈춘다.
 *
 * 예전엔 `npm run deploy` 가 곧바로 `firebase deploy --only functions` 였다.
 * 한 단어 오타로 운영이 깨질 수 있는 배선이라 게이트를 세운다.
 *
 * 정상 경로: main 에 push → deploy.yml 이 배포한다.
 * 정말 로컬에서 해야 하면 그 이유를 알고 npx firebase-tools 를 직접 부를 것.
 */
const what = process.argv[2] || "이 대상";

console.error(`
❌ 로컬 배포는 막혀 있습니다 (${what}).

   functions 는 SCHEDULER_AUTH_TOKEN 이 있어야 동작하고, 그 값은
   GitHub Actions 가 배포 때마다 functions/.env 로 주입합니다.
   로컬에는 그 파일이 없어서, 여기서 배포하면 토큰이 빈 채로 올라가고
   스케줄러가 401 로 멈춥니다.

   ✅ 올바른 방법:  main 브랜치에 push → .github/workflows/deploy.yml 이 배포

   그래도 로컬에서 해야 한다면, 무엇을 하는지 알고 직접 부르세요:
      npx firebase-tools deploy --only <target>
   (functions 를 그렇게 배포했다면 곧바로 GHA 재배포로 토큰을 되살릴 것)
`);
process.exit(1);
