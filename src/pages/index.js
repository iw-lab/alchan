// src/pages/index.js
// 🔥 페이지 컴포넌트 중앙 집중 export
// 향후 파일 이동 시 이 파일만 수정하면 됨

// 메인 페이지들 (pages/ 하위 폴더에 위치)
export { default as Dashboard } from './dashboard/Dashboard';
export { default as MyAssets } from './my-assets/MyAssets';
export { default as MyItems } from './my-items/MyItems';
export { default as MyProfile } from './my-profile/MyProfile';
export { default as LearningBoard } from './learning/LearningBoard';
export { default as StudentRequest } from './student/StudentRequest';
export { default as CouponGoalPage } from './coupon/CouponGoalPage';
export { default as RealEstateRegistry } from './real-estate/RealEstateRegistry';
export { default as Login } from './auth/Login';
export { default as OrganizationChart } from './organization/OrganizationChart';

// 음악 관련 페이지 (pages/music/에 위치)
export { default as MusicRequest } from './music/MusicRequest';
export { default as MusicRoom } from './music/MusicRoom';

// 금융 페이지
export { default as Banking } from './banking/Banking';
export { default as StockExchange } from './banking/StockExchange';
export { default as Investment } from './banking/Investment';
export { default as MoneyTransfer } from './banking/MoneyTransfer';
export { default as CouponTransfer } from './banking/CouponTransfer';

// 마켓 페이지
export { default as ItemStore } from './market/ItemStore';
export { default as PersonalShop } from './market/PersonalShop';
export { default as Auction } from './market/Auction';

// 정부 기관 페이지
export { default as Government } from './government/Government';
export { default as NationalAssembly } from './government/NationalAssembly';
export { default as Court } from './government/Court';
export { default as PoliceStation } from './government/PoliceStation';

// 게임 페이지
export { default as OmokGame } from './games/OmokGame';
export { default as ChessGame } from './games/ChessGame';
export { default as TypingPracticeGame } from './games/TypingPracticeGame';

// 관리자 페이지
export { default as AdminItemPage } from './admin/AdminItemPage';
export { default as AdminPage } from './admin/AdminPage';
export { default as AdminPanel } from './admin/AdminPanel';
export { default as AdminDatabase } from './admin/AdminDatabase';
