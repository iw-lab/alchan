// scripts/e2e/seed-rich.mjs — 화면 배치 검사용 «꽉 찬 학급» 을 에뮬레이터에 심는다(운영에는 절대 안 닿는다).
// 빈 학급에서는 긴 이름·억 단위 돈·목록 30줄이 없어서 잘림·세로글자가 안 보인다 — 2026-11-25 실측:
// 빈 학급으로 228화면을 재고 «넘침 0» 이었는데 눈으로 보니 버튼이 화면 밖에 있었다.
// 실행: node scripts/e2e/seed-rich.mjs   (seed.mjs + run.mjs 로 학급이 있어야 한다)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!/^127\.0\.0\.1|^localhost/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("에뮬레이터가 아닌 곳으로 시드하지 않는다");
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const PROJECT = JSON.parse(readFileSync(new URL("../../.firebaserc", import.meta.url), "utf8")).projects.default;
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore(), now = admin.firestore.Timestamp.now(), DAY = 864e5;
const at = (d) => admin.firestore.Timestamp.fromMillis(Date.now() + d * DAY);

const teachers = (await db.collection("users").where("isAdmin", "==", true).get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  .filter((u) => /^teacher\d+@e2e\.test$/.test(u.email || "") && u.classCode && u.classCode !== "미지정")
  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
if (!teachers.length) throw new Error("e2e 선생님 학급이 없다 — scripts/e2e/run.mjs 를 먼저 돌린다");
const T = teachers[0], code = T.classCode;
const studs = (await db.collection("users").where("classCode", "==", code).get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => !u.isAdmin && !u.isTeacher);
const me = studs.find((u) => /^2번/.test(u.name || "")) || studs[0];
const batchAll = async (ops) => { for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); for (const [ref, v, o] of ops.slice(i, i + 400)) b.set(ref, v, o || {}); await b.commit(); } };
const ops = [];
const NAMES = ["반짝이는 하늘다람쥐", "용감한 북극곰", "느긋한 나무늘보", "씩씩한 검은고양이", "재빠른 얼룩말", "똑똑한 코끼리", "상냥한 흰돌고래", "호기심 많은 수달"];
for (let i = 5; i <= 26; i++) ops.push([db.doc(`users/rich_${i}`), { name: `${i}번 ${NAMES[i % 8]}`, nickname: `${i}번 ${NAMES[i % 8]}`, email: `rich${i}@e2e.test`, classCode: code, teacherId: T.id, isAdmin: false, isTeacher: false, isApproved: true, cash: 3e6 * i * i, coupons: i * 3, selectedJobIds: [], createdAt: now, __rich: true }, { merge: true }]);
ops.push([db.doc(`users/${me.id}`), { cash: 1234567890, coupons: 347, nickname: "2번 반짝이는 하늘다람쥐", name: "2번 반짝이는 하늘다람쥐" }, { merge: true }]);
ops.push([db.doc(`users/${me.id}/financials/parkingAccount`), { balance: 987654321, lastInterestDate: now, updatedAt: now }, { merge: true }]);
const prod = (id, o) => ops.push([db.doc(`users/${me.id}/products/${id}`), { termInDays: 365, rate: 0.015, startDate: at(-20), maturityDate: at(345), teacherId: T.id, teacherName: "김교사", ...o }]);
prod("rich_dep", { name: "일복리예금 365일", type: "deposit", balance: 200000000 });
prod("rich_dep2", { name: "일복리예금 90일", type: "deposit", balance: 50000000, termInDays: 90, maturityDate: at(70) });
prod("rich_sav", { name: "일복리적금 180일", type: "savings", balance: 12000000, dailyAmount: 600000, totalDeposited: 12000000, depositsCount: 20, termInDays: 180, maturityDate: at(160) });
prod("rich_loan", { name: "일반대출 365일", type: "loan", balance: 30000000, originalBalance: 50000000, repaymentType: "free", totalInterestPaid: 123456, creditGrade: "B", creditScore: 712 });
// 주식 — 실제 종목명 길이(한글 12자·ETF) 를 흉내
const ST = ["알찬반도체우선주", "한빛전자", "무지개자동차", "KODEX 미국나스닥100레버리지", "TIGER 미국S&P500", "구름바이오로직스", "초록식품", "별빛게임즈", "강물에너지솔루션", "금(Gold) 선물 ETF", "국채 10년물", "하늘항공우주산업", "달나라금융지주", "바다조선해양"];
const stocks = ST.map((name, i) => ({ id: `rich_s${i}`, name, price: 1200 * (i + 1) * (i + 3), initialPrice: 1000 * (i + 1) * (i + 3), minListingPrice: 100, isListed: true, isManual: false, isRealStock: true, productType: /국채/.test(name) ? "bond" : /ETF|KODEX|TIGER/.test(name) ? "etf" : "stock", sector: ["반도체", "IT", "자동차", "금융", "에너지"][i % 5], volatility: 0.02, holderCount: i, tradingVolume: 12345 * i, buyVolume: 10 * i, sellVolume: 5 * i, recentBuyVolume: 3, recentSellVolume: 2, priceHistory: Array.from({ length: 20 }, (_, k) => Math.round(1200 * (i + 1) * (i + 3) * (1 + Math.sin(k + i) * 0.05))), realStockSymbol: `00${i}000.KS`, realStockData: null, previousClose: 1180 * (i + 1) * (i + 3), changePercent: (i % 2 ? -1 : 1) * (1.23 + i / 7), marketState: "REGULAR", lastUpdated: now, volatilityMultiplier: 1 }));
for (const s of stocks) ops.push([db.doc(`CentralStocks/${s.id}`), { ...s, createdAt: now, dividendYieldAnnual: 0.02 }]);
ops.push([db.doc("Settings/centralStocksCache"), { updatedAt: now, count: stocks.length, stocks }]);
stocks.slice(0, 5).forEach((s, i) => ops.push([db.doc(`users/${me.id}/portfolio/${s.id}`), { stockId: s.id, stockName: s.name, quantity: 1234 * (i + 1), averagePrice: Math.round(s.price * (1 + (i - 2) * 0.07)), classCode: code, lastBuyTime: now, delistedAt: null, updatedAt: now, productType: s.productType }]));
// 내 아이템·상점·쿠폰 목표·함께구매
const items = (await db.collection("storeItems").where("classCode", "==", code).get()).docs;
items.slice(0, 8).forEach((d, i) => ops.push([db.doc(`users/${me.id}/inventory/${d.id}`), { itemId: d.id, name: d.data().name, icon: d.data().icon || "🎁", description: d.data().description || "", quantity: i * 3 + 1, price: d.data().price, type: "item", createdAt: now, updatedAt: now }]));
items.slice(0, 4).forEach((d) => ops.push([d.ref, { price: 123456789, name: `${d.data().name.replace(/ \(.*/, "")} (이번 주만 특별)` }, { merge: true }]));
ops.push([db.doc(`goals/${code}_goal`), { classCode: code, title: "우리 반 영화 보기 + 과자 파티", description: "모두 함께 쿠폰을 모아요", targetAmount: 1000, progress: 347, donationCount: 23, donations: Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, userId: `rich_${i + 5}`, userName: `${i + 5}번 ${NAMES[i % 8]}`, amount: 12 + i, message: "힘내자!", timestamp: new Date(Date.now() - i * DAY).toISOString(), classCode: code })), createdBy: T.id, createdAt: now, updatedAt: now }]);
for (let i = 0; i < 3; i++) ops.push([db.doc(`groupPurchases/rich_${i}`), { classCode: code, itemName: items[i]?.data().name || "간식", itemIcon: "🍕", itemDescription: "함께 모아서 사요", selectedItemId: items[i]?.id || "x", targetPrice: 5e6 * (i + 1), currentAmount: 2e6 * (i + 1), status: "active", initiatorId: me.id, initiatorName: "2번 반짝이는 하늘다람쥐", contributors: [{ userId: me.id, userName: "2번 반짝이는 하늘다람쥐", amount: 2e6 * (i + 1) }], createdAt: now }]);
for (let i = 0; i < 4; i++) { const sid = `rich_shop${i}`; ops.push([db.doc(`personalShops/${sid}`), { classCode: code, ownerId: `rich_${5 + i}`, ownerName: `${5 + i}번 ${NAMES[i]}`, name: ["반짝이 액세서리 전문점", "숙제 도우미 사무소", "그림 그려드려요", "보드게임 대여점"][i], shopName: ["반짝이 액세서리 전문점", "숙제 도우미 사무소", "그림 그려드려요", "보드게임 대여점"][i], description: "친절하게 해드립니다. 쉬는 시간에 찾아오세요!", icon: "🏪", isOpen: true, createdAt: now }]); for (let k = 0; k < 2; k++) ops.push([db.doc(`shopProducts/${sid}_${k}`), { classCode: code, shopId: sid, ownerId: `rich_${5 + i}`, ownerName: `${5 + i}번 ${NAMES[i]}`, name: ["하트 머리핀 세트", "맞춤 캐릭터 그림"][k], description: "하나하나 손으로 만들었어요", price: 1234567 * (k + 1), stock: 5, createdAt: now }]); }
// 부동산·법원·경찰·국회·게시판
const cls = (p) => db.doc(`classes/${code}/${p}`);
for (let i = 1; i <= 20; i++) ops.push([cls(`realEstateProperties/${i}`), { id: String(i), classCode: code, owner: i % 3 ? `rich_${i + 4 > 26 ? 5 : i + 4}` : "government", ownerId: i % 3 ? `rich_${i + 4 > 26 ? 5 : i + 4}` : "government", ownerName: i % 3 ? `${i + 4}번 ${NAMES[i % 8]}` : "정부", tenant: i % 4 ? null : me.id, tenantId: i % 4 ? null : me.id, tenantName: i % 4 ? null : "2번 반짝이는 하늘다람쥐", price: 123456789 * ((i % 4) + 1), rent: 1234567, forSale: i % 5 === 0, salePrice: i % 5 === 0 ? 345678901 : null, createdAt: now, updatedAt: now, acquiredFree: false }]);
ops.push([db.doc(`realEstateSettings/${code}`), { classCode: code, totalProperties: 20, basePrice: 100000000, rentPercentage: 1, updatedAt: now }, { merge: true }]);
["복도에서 뛰지 않기 법", "급식 남기지 않기 법", "쉬는 시간에 바른말 고운말을 쓰는 법", "청소 시간에 자기 자리 정리하기 법"].forEach((title, i) => ops.push([cls(`nationalAssemblyLaws/rich_${i}`), { title, classCode: code, proposerId: "rich_7", proposerName: "7번 상냥한 흰돌고래", description: "우리 반 모두가 안전하고 즐겁게 지내기 위해 복도에서는 걸어 다닙니다. 어기면 벌금을 냅니다.", purpose: "안전한 학급 만들기", fine: "50만원", approvals: 12 + i, disapprovals: 3, voters: {}, status: ["pending", "approved", "pending_government_approval", "vetoed"][i], timestamp: now, updatedAt: now }]));
for (let i = 0; i < 4; i++) { ops.push([cls(`courtComplaints/rich_${i}`), { classCode: code, complainantId: "rich_8", complainantName: "8번 반짝이는 하늘다람쥐", defendantId: "rich_9", defendantName: "9번 용감한 북극곰", reason: "쉬는 시간에 제 지우개를 허락 없이 가져가서 돌려주지 않았습니다. 여러 번 말했는데도 그랬습니다.", desiredResolution: "사과와 지우개값 배상", caseType: "civil", status: ["pending", "indicted", "on_trial", "resolved"][i], submissionDate: now, updatedAt: now, likedBy: [], dislikedBy: [], settlementPaid: false }]); ops.push([cls(`policeReports/rich_${i}`), { classCode: code, reporterId: "rich_10", reporterName: "10번 느긋한 나무늘보", complainantId: "rich_10", defendantId: "rich_11", reportedUserId: "rich_11", reason: "복도에서 뛰지 않기 법 위반", details: "점심시간에 복도에서 뛰어다니다가 친구와 부딪혔습니다.", description: "", amount: 500000, status: ["submitted", "accepted", "resolved", "submitted"][i], submitDate: now, updatedAt: now, isLawReport: true, settlementAmount: 0, settlementPaid: false }]); }
for (let i = 0; i < 3; i++) { ops.push([cls(`learningBoards/rich_${i}`), { name: ["독서 감상문 나누기", "과학 탐구 보고서 게시판", "질문 있어요"][i], classCode: code, isHidden: false, isAnonymous: i === 2, createdAt: now, updatedAt: now }]); for (let k = 0; k < 6; k++) ops.push([cls(`learningBoards/rich_${i}/posts/p${k}`), { title: "『어린 왕자』를 읽고 느낀 점을 정리해 보았습니다", content: "길들인다는 것은 서로에게 하나뿐인 존재가 된다는 뜻이라는 말이 기억에 남았다.", authorId: `rich_${5 + k}`, authorName: `${5 + k}번 ${NAMES[k]}`, classCode: code, createdAt: now, updatedAt: now, likes: [], comments: [] }]); }
for (let i = 5; i < 14; i++) ops.push([cls(`personalBoards/rich_${i}`), { ownerId: `rich_${i}`, ownerName: `${i}번 ${NAMES[i % 8]}`, visibility: "class", createdAt: now }]);
ops.push([cls("auctions/rich_0"), { classCode: code, itemId: "rich_5", name: "급식 자리 우선권 (이번 주만 특별)", title: "급식 자리 우선권 (이번 주만 특별)", description: "맛있게 먹어요", startPrice: 1e6, currentBid: 12345678, highestBidder: "rich_6", highestBidderName: "6번 똑똑한 코끼리", seller: "rich_5", sellerName: "5번 똑똑한 코끼리", status: "ongoing", createdAt: now, endTime: at(1) }]);
// 활동 로그·할 일 승인 대기
for (let i = 0; i < 40; i++) ops.push([db.doc(`activity_logs/rich_${i}`), { userId: `rich_${5 + (i % 20)}`, userName: `${5 + (i % 20)}번 ${NAMES[i % 8]}`, classCode: code, amount: 1234567 * (i + 1), couponAmount: 0, type: ["현금 입금", "아이템 구매", "송금", "세금 납부"][i % 4], description: "급식 자리 우선권 (이번 주만 특별) 2개 구매 — 부가세 10% 포함", metadata: {}, timestamp: at(-i / 24), expireAt: at(90) }]);
for (let i = 0; i < 12; i++) ops.push([db.doc(`pendingApprovals/rich_${i}`), { classCode: code, studentId: `rich_${5 + i}`, studentName: `${5 + i}번 ${NAMES[i % 8]}`, userId: `rich_${5 + i}`, userName: `${5 + i}번 ${NAMES[i % 8]}`, taskId: `t${i}`, taskName: "아침 독서 20분 하고 독서록 쓰기", rewardAmount: 300000, cardType: "cash", jobId: null, jobTitle: "공통 할일", status: "pending", requestedAt: now, createdAt: now }]);
ops.push([db.doc(`nationalTreasuries/${code}`), { totalAmount: 9876543210, incomeTaxRevenue: 123456789, vatRevenue: 98765432, stockTaxRevenue: 12345678, realEstateTransactionTaxRevenue: 45678901 }, { merge: true }]);
await batchAll(ops);
console.log(JSON.stringify({ ok: true, classCode: code, teacher: T.email, docs: ops.length }));
process.exit(0);
