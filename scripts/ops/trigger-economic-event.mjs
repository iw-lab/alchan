// ⚠️ 운영 스크립트 — 실제 프로덕션 Firestore를 변경한다. 테스트 아니다.
//    2026-08-03 이동: 파일명이 test-* 라 자동 테스트로 오인·실행될 위험이 있었다.
/**
 * 경제 이벤트 테스트 스크립트
 * 방학 모드를 임시 비활성화하고 이벤트를 강제 실행합니다.
 */

// 사용법: SCHEDULER_AUTH_TOKEN=… node scripts/ops/trigger-economic-event.mjs
//
// ⚠️ 토큰을 여기 적지 말 것. 이 저장소는 **공개**다.
//    실제로 예전엔 값이 박혀 있었고(교체돼 지금은 무효), 같은 실수가 test-event.mjs 에서도
//    있었다. cron-setup.mjs·cron-verify.mjs 와 같은 규약(process.env)으로 맞춘다.
const TOKEN = process.env.SCHEDULER_AUTH_TOKEN || '';
if (!TOKEN) {
  console.error('SCHEDULER_AUTH_TOKEN 환경변수가 필요합니다.');
  process.exit(1);
}
const SCHEDULER_URL = 'https://economiceventscheduler-j7kazbsvxq-du.a.run.app';

// 1. 먼저 방학 모드 체크
console.log('1. 현재 상태 확인...');
const checkRes = await fetch(`${SCHEDULER_URL}?token=${TOKEN}`);
const checkData = await checkRes.json();
console.log('   응답:', JSON.stringify(checkData));

if (checkData.vacationMode) {
  console.log('\n⚠️  방학 모드가 켜져 있습니다.');
  console.log('   방학 모드를 끄려면 Firebase 콘솔 > Firestore > Settings/scheduler > vacationMode: false 로 변경하거나');
  console.log('   관리자 페이지에서 방학 모드를 비활성화하세요.');
  console.log('\n   또는 아래 명령으로 직접 테스트:');
  console.log('   관리자 페이지 > 경제 이벤트 관리 > "지금 실행" 버튼 클릭');
  process.exit(0);
}

console.log('✅ 방학 모드 꺼짐 - 이벤트 실행 완료!');
console.log(JSON.stringify(checkData, null, 2));
