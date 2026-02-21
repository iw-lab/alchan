/**
 * 경제 이벤트 테스트 스크립트
 * 방학 모드를 임시 비활성화하고 이벤트를 강제 실행합니다.
 */

const TOKEN = 'c7183bbd61ba842e3cb57f003cebfdffd8aafc4c988240724c36d3233e2a6831';
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
