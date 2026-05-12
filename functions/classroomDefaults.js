const DEFAULT_JOBS = [
 {
 title: "경찰청장",
 tasks: [
 {
 name: "사건 처리",
 reward: 1,
 maxClicks: 10,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "교실 질서 유지하기",
 reward: 2,
 maxClicks: 5,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "환경 미화원",
 tasks: [
 {
 name: "쓰레기통 비우기",
 reward: 50,
 maxClicks: 1,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "아침 쓸기",
 reward: 10,
 maxClicks: 1,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "분리수거 정리하기",
 reward: 20,
 maxClicks: 1,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "글씨 감사인",
 tasks: [
 {
 name: "검사해주기",
 reward: 1,
 maxClicks: 25,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "공책 정리 확인하기",
 reward: 2,
 maxClicks: 10,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "국세청 직원",
 tasks: [
 {
 name: "세금 안내하기",
 reward: 1,
 maxClicks: 25,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "가계부 점검하기",
 reward: 2,
 maxClicks: 5,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "아르바이트",
 tasks: [
 {
 name: "아르바이트",
 reward: 1,
 maxClicks: 10,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "심부름하기",
 reward: 2,
 maxClicks: 5,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "학급 반장",
 tasks: [
 {
 name: "조회/종회 진행하기",
 reward: 3,
 maxClicks: 2,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "출석 확인하기",
 reward: 2,
 maxClicks: 1,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "도서 관리인",
 tasks: [
 {
 name: "도서 정리하기",
 reward: 5,
 maxClicks: 2,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "대출/반납 기록하기",
 reward: 2,
 maxClicks: 10,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
 {
 title: "방송 담당",
 tasks: [
 {
 name: "아침 방송하기",
 reward: 10,
 maxClicks: 1,
 clicks: 0,
 requiresApproval: true,
 },
 {
 name: "공지 전달하기",
 reward: 3,
 maxClicks: 3,
 clicks: 0,
 requiresApproval: true,
 },
 ],
 },
];

// 새 학급 기본 상점 아이템
const DEFAULT_STORE_ITEMS = [
 {
 name: "자유 시간 10분",
 price: 2000,
 stock: 5,
 icon: "⏰",
 description: "10분간 자유 시간을 사용할 수 있습니다",
 },
 {
 name: "자리 바꾸기",
 price: 500,
 stock: 10,
 icon: "💺",
 description: "원하는 자리로 이동할 수 있습니다",
 },
 {
 name: "과자",
 price: 200,
 stock: 30,
 icon: "🍪",
 description: "맛있는 과자 1개",
 },
 {
 name: "사탕",
 price: 200,
 stock: 50,
 icon: "🍬",
 description: "달콤한 사탕 1개",
 },
 {
 name: "음료수",
 price: 200,
 stock: 20,
 icon: "🧃",
 description: "시원한 음료수 1개",
 },
 {
 name: "초콜릿",
 price: 200,
 stock: 20,
 icon: "🍫",
 description: "초콜릿 1개",
 },
 {
 name: "숙제 면제권",
 price: 500,
 stock: 5,
 icon: "📝",
 description: "숙제 1회 면제",
 },
 {
 name: "1일 반장 체험",
 price: 300,
 stock: 3,
 icon: "👑",
 description: "하루 동안 반장 역할 체험",
 },
 {
 name: "선생님 의자 사용권",
 price: 300,
 stock: 3,
 icon: "🪑",
 description: "하루 동안 선생님 의자 사용",
 },
 {
 name: "젤리",
 price: 200,
 stock: 30,
 icon: "🧸",
 description: "말랑말랑 젤리 1개",
 },
];

// 새 학급 기본 은행 설정
const DEFAULT_BANKING = {
 deposits: [
 {
 id: 1,
 name: "일복리예금 90일",
 annualRate: 0.01,
 termInDays: 90,
 minAmount: 500000,
 },
 {
 id: 2,
 name: "일복리예금 180일",
 annualRate: 0.012,
 termInDays: 180,
 minAmount: 1000000,
 },
 {
 id: 3,
 name: "일복리예금 365일",
 annualRate: 0.015,
 termInDays: 365,
 minAmount: 2000000,
 },
 ],
 savings: [
 {
 id: 1,
 name: "일복리적금 180일",
 annualRate: 0.011,
 termInDays: 180,
 minAmount: 100000,
 },
 {
 id: 2,
 name: "일복리적금 365일",
 annualRate: 0.014,
 termInDays: 365,
 minAmount: 100000,
 },
 {
 id: 3,
 name: "일복리적금 730일",
 annualRate: 0.018,
 termInDays: 730,
 minAmount: 50000,
 },
 ],
 loans: [
 {
 id: 1,
 name: "일복리대출 90일",
 annualRate: 0.05,
 termInDays: 90,
 maxAmount: 3000000,
 },
 {
 id: 2,
 name: "일복리대출 365일",
 annualRate: 0.08,
 termInDays: 365,
 maxAmount: 10000000,
 },
 {
 id: 3,
 name: "일복리대출 730일",
 annualRate: 0.1,
 termInDays: 730,
 maxAmount: 50000000,
 },
 ],
};

// 새 학급 기본 급여 설정
const DEFAULT_SALARIES = {
 경찰청장: 4500,
 "환경 미화원": 4000,
 "글씨 감사인": 4000,
 "국세청 직원": 4500,
 아르바이트: 2000,
 "학급 반장": 5000,
 "도서 관리인": 3500,
 "방송 담당": 3500,
 무직: 1000,
};

module.exports = { DEFAULT_JOBS, DEFAULT_STORE_ITEMS, DEFAULT_BANKING, DEFAULT_SALARIES };
