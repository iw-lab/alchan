// src/ParkingAccount.js
import React, { useState, useEffect, useCallback } from "react";
import {
 db,
 doc,
 getDoc,
 setDoc,
 serverTimestamp,
 updateDoc,
 increment,
 runTransaction,
 collection,
 getDocs,
 deleteDoc,
 query,
 where,
 limit,
} from "../../firebase";
import { format, isToday, differenceInCalendarDays, startOfDay } from "date-fns";
import {
 PiggyBank,
 Landmark,
 HandCoins,
 Wallet,
 X,
 TrendingUp,
} from "lucide-react";
import {
 formatKoreanCurrency,
 getCurrencyUnit,
} from "../../utils/numberFormatter";
import { logActivity, ACTIVITY_TYPES } from "../../utils/firestoreHelpers";
import { useCurrency } from "../../contexts/CurrencyContext";
import {
 isNetAssetsNegative,
 NEGATIVE_ASSETS_MESSAGE,
} from "../../utils/netAssets";

import { logger } from "../../utils/logger";
// 선생님(관리자) 계정 찾기 - 같은 학급의 관리자
const getTeacherAccount = async (classCode) => {
 if (!classCode) return null;

 try {
 const usersRef = collection(db, "users");
 const q = query(
 usersRef,
 where("classCode", "==", classCode),
 where("isAdmin", "==", true),
 limit(1),
 );
 const snapshot = await getDocs(q);

 if (!snapshot.empty) {
 const teacherDoc = snapshot.docs[0];
 return {
 id: teacherDoc.id,
 ...teacherDoc.data(),
 };
 }
 return null;
 } catch (error) {
 logger.error("선생님 계정 조회 오류:", error);
 return null;
 }
};

// --- Tailwind class helpers ---
const cls = {
 container: "font-sans bg-transparent p-4 md:p-6 min-h-0",
 message: (type) =>
 `px-5 py-4 rounded-xl mb-7 text-center text-base font-medium shadow-sm ${
 type === "error"
 ? "text-red-600 bg-red-50 border border-red-200"
 : "text-emerald-600 bg-emerald-50 border border-emerald-200"
 }`,
 grid: "grid grid-cols-1 md:grid-cols-2 gap-5 w-full",
 card: "bg-white shadow-[0_2px_12px_rgba(99,102,241,0.08)] rounded-2xl p-6 border border-[#e0e7ff]",
 cardHeader: "flex items-center gap-4 mb-5 pb-4 border-b-2 border-slate-100",
 cardTitle:
 "text-xl font-bold text-slate-800 tracking-tight",
 tabContainer: "flex border-b-2 border-slate-200 mb-5 gap-2",
 tabButton: (isActive) =>
 `px-6 py-3 border-none cursor-pointer text-[17px] rounded-t-lg transition-all duration-200 -mb-0.5 ${
 isActive
 ? "bg-indigo-50 font-bold text-indigo-600 border-b-[3px] border-b-indigo-500"
 : "font-medium text-slate-400 border-b-[3px] border-b-transparent hover:text-slate-600"
 }`,
 button: (disabled, variant = "primary") =>
 `text-white px-5 py-3 rounded-xl border-none text-[15px] font-semibold transition-all duration-200 ${
 disabled
 ? "cursor-not-allowed opacity-50"
 : "cursor-pointer shadow-md hover:-translate-y-0.5 hover:shadow-lg"
 } ${
 variant === "primary"
 ? "bg-indigo-500 hover:bg-indigo-600"
 : variant === "danger"
 ? "bg-red-500 hover:bg-red-600"
 : variant === "success"
 ? "bg-emerald-500 hover:bg-emerald-600"
 : "bg-slate-400 hover:bg-slate-500"
 }`,
 noProduct: "text-center text-slate-400 py-8 text-base italic",
 input:
 "w-full py-3.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl mb-4 text-base text-slate-800 transition-colors duration-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
 modalOverlay:
 "fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] backdrop-blur-[4px]",
 modalContent:
 "bg-white p-8 rounded-2xl w-[90%] max-w-[450px] relative shadow-2xl border border-slate-200 text-slate-700",
 modalTitle:
 "text-xl font-bold mb-5 text-slate-800",
 modalCloseBtn:
 "absolute top-5 right-5 bg-transparent border-none cursor-pointer text-slate-400 transition-colors duration-200 hover:text-slate-700",
};

// --- Helper Functions & Sub-Components ---
const formatCurrency = (amount) =>
 typeof amount === "number" ? Math.round(amount).toLocaleString() : "0";

// 화폐 단위를 포함한 금액 포맷 헬퍼
const formatCurrencyWithUnit = (amount) =>
 `${formatCurrency(amount)}${getCurrencyUnit()}`;

// 일복리 계산
const calculateCompoundInterest = (principal, dailyRate, days) => {
 if (principal <= 0 || !dailyRate || days <= 0)
 return { interest: 0, total: principal };
 const total = principal * Math.pow(1 + dailyRate / 100, days);
 const interest = total - principal;
 return { interest: Math.round(interest), total: Math.round(total) };
};

// 적금 이자 계산: 매일 납입 시 각 납입금이 남은 기간만큼 복리
// Day 0 → termInDays일간 이자, Day 1 → (termInDays-1)일간 이자, ...
const calculateSavingsInterest = (dailyAmount, dailyRate, termInDays, depositsCount) => {
 if (!dailyAmount || !dailyRate || termInDays <= 0)
 return { interest: 0, total: 0, totalDeposited: 0 };
 const r = dailyRate / 100;
 const actualDeposits = depositsCount != null ? depositsCount : termInDays;
 let total = 0;
 for (let i = 0; i < actualDeposits; i++) {
 const daysOfInterest = termInDays - i;
 total += dailyAmount * Math.pow(1 + r, daysOfInterest);
 }
 const totalDeposited = dailyAmount * actualDeposits;
 return {
 interest: Math.round(total - totalDeposited),
 total: Math.round(total),
 totalDeposited,
 };
};

// 일일 이자 계산 (메모이제이션으로 최적화)
const calculateDailyInterest = (principal, dailyRate) => {
 return Math.round(principal * (dailyRate / 100));
};

const ICON_MAP = {
 parking: <Wallet size={28} className="text-sky-700" />,
 deposits: <Landmark size={28} className="text-emerald-600" />,
 savings: <PiggyBank size={28} className="text-violet-600" />,
 loans: <HandCoins size={28} className="text-red-600" />,
};

// 대출 경과 이자 계산 (시작일 또는 마지막 상환일부터 현재까지)
const calculateAccruedLoanInterest = (balance, dailyRate, startDate, lastRepaymentDate) => {
 const baseDate = lastRepaymentDate
 ? new Date(lastRepaymentDate?.toDate ? lastRepaymentDate.toDate() : lastRepaymentDate)
 : new Date(startDate?.toDate ? startDate.toDate() : startDate);
 const elapsedDays = Math.max(0, differenceInCalendarDays(new Date(), baseDate));
 if (elapsedDays <= 0 || balance <= 0 || !dailyRate) return { interest: 0, total: balance, elapsedDays: 0 };
 const total = balance * Math.pow(1 + dailyRate / 100, elapsedDays);
 const interest = Math.round(total - balance);
 return { interest, total: Math.round(total), elapsedDays };
};

const SubscribedProductItem = ({ product, onCancel, onMaturity, onLoanRepay }) => {
 const isMatured = product.maturityDate && startOfDay(new Date()) >= startOfDay(new Date(product.maturityDate));
 const daysRemaining = product.maturityDate
 ? Math.max(0, differenceInCalendarDays(new Date(product.maturityDate), new Date()))
 : 0;
 const isSavings = product.type === "savings";
 const isLoan = product.type === "loan";

 // 적금: dailyAmount 기반 계산 / 예금·대출: 기존 방식
 const dailyAmount = product.dailyAmount || 0;
 const depositsCount = product.depositsCount || 0;
 const totalDeposited = product.totalDeposited || product.balance;

 let interest, total;
 if (isSavings && dailyAmount > 0) {
 const result = calculateSavingsInterest(dailyAmount, product.rate, product.termInDays, product.termInDays);
 interest = result.interest;
 total = result.total;
 } else {
 const result = calculateCompoundInterest(product.balance, product.rate, product.termInDays);
 interest = result.interest;
 total = result.total;
 }

 // 대출: 경과 이자 계산
 let accruedInterest = 0, accruedTotal = 0, elapsedDays = 0;
 if (isLoan) {
 const accrued = calculateAccruedLoanInterest(
 product.balance, product.rate, product.startDate, product.lastRepaymentDate
 );
 accruedInterest = accrued.interest;
 accruedTotal = accrued.total;
 elapsedDays = accrued.elapsedDays;
 }

 const dailyInterestAmount = calculateDailyInterest(
 isSavings ? totalDeposited : product.balance,
 product.rate,
 );

 const repaymentTypeLabel = product.repaymentType === "installment" ? "분할 상환" : "일시 상환";

 return (
 <div
 className={`p-5 border-2 rounded-xl mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.2)] ${
 isMatured
 ? "border-emerald-500/50 bg-emerald-500/10"
 : isLoan
 ? "border-red-200 bg-red-50"
 : "border-slate-200 bg-slate-50"
 }`}
 >
 <div className="flex justify-between items-start mb-3">
 <div>
 <div className="font-bold text-lg text-slate-700 mb-1">
 {product.name}
 </div>
 <div className="flex gap-2 mt-1">
 {isMatured && (
 <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[13px] font-semibold">
 만기
 </span>
 )}
 {isLoan && (
 <span className="bg-red-50 text-red-400 px-3 py-1 rounded-full text-[13px] font-semibold border border-red-200">
 {repaymentTypeLabel}
 </span>
 )}
 </div>
 </div>
 <span className="text-xl font-bold text-indigo-600">
 {isSavings ? formatCurrencyWithUnit(totalDeposited) : formatCurrencyWithUnit(product.balance)}
 </span>
 </div>

 <div className="text-[15px] text-slate-600 mt-4 grid gap-2.5 bg-slate-50 p-4 rounded-lg border border-slate-200">
 <div className="flex justify-between">
 <span className="font-medium">금리 (일):</span>
 <span className="font-bold text-indigo-600">{product.rate}%</span>
 </div>
 {isLoan ? (
 <>
 <div className="flex justify-between">
 <span className="font-medium">대출 원금:</span>
 <span className="font-bold text-red-400">
 {formatCurrencyWithUnit(product.originalBalance || product.balance)}
 </span>
 </div>
 {product.repaymentType === "installment" && product.originalBalance && product.balance < product.originalBalance && (
 <div className="flex justify-between">
 <span className="font-medium">남은 원금:</span>
 <span className="font-bold text-amber-600">
 {formatCurrencyWithUnit(product.balance)}
 </span>
 </div>
 )}
 <div className="flex justify-between">
 <span className="font-medium">경과일:</span>
 <span className="font-bold text-slate-700">{elapsedDays}일</span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">현재 누적 이자:</span>
 <span className="font-bold text-red-400">
 +{formatCurrencyWithUnit(accruedInterest)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">일일 이자:</span>
 <span className="font-bold text-red-400">
 +{formatCurrencyWithUnit(dailyInterestAmount)}/일
 </span>
 </div>
 {product.totalInterestPaid > 0 && (
 <div className="flex justify-between">
 <span className="font-medium">기납부 이자:</span>
 <span className="font-bold text-emerald-400">
 {formatCurrencyWithUnit(product.totalInterestPaid)}
 </span>
 </div>
 )}
 </>
 ) : isSavings && dailyAmount > 0 ? (
 <>
 <div className="flex justify-between">
 <span className="font-medium">일 납입금:</span>
 <span className="font-bold text-violet-600">
 {formatCurrencyWithUnit(dailyAmount)}/일
 </span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">납입 진행:</span>
 <span className="font-bold text-violet-600">
 {depositsCount}/{product.termInDays}일
 </span>
 </div>
 <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
 <div
 className="bg-violet-500 h-2 rounded-full transition-all"
 style={{ width: `${Math.min(100, (depositsCount / product.termInDays) * 100)}%` }}
 />
 </div>
 </>
 ) : (
 <div className="flex justify-between">
 <span className="font-medium">일일 이자:</span>
 <span className="font-bold text-emerald-400">
 +{formatCurrencyWithUnit(dailyInterestAmount)}/일
 </span>
 </div>
 )}
 {product.maturityDate && (
 <>
 <div className="flex justify-between">
 <span className="font-medium">만기일:</span>
 <span className="font-semibold text-slate-700">
 {format(product.maturityDate, "yyyy-MM-dd")}
 </span>
 </div>
 {!isMatured && (
 <div className="flex justify-between">
 <span className="font-medium">남은 기간:</span>
 <span className="font-semibold text-indigo-600">
 {daysRemaining}일
 </span>
 </div>
 )}
 </>
 )}
 </div>

 <div className="border-t border-dashed border-slate-200 my-4"></div>

 {isLoan ? (
 <div className="text-[15px] text-slate-700 grid gap-2.5 bg-red-50 p-4 rounded-lg border border-red-200">
 <div className="flex justify-between">
 <span className="font-semibold">현재 상환 금액:</span>
 <span className="font-bold text-red-400 text-[17px]">
 {formatCurrencyWithUnit(accruedTotal)}
 </span>
 </div>
 <div className="text-[13px] text-slate-500">
 (원금 {formatCurrency(product.balance)} + 이자 {formatCurrency(accruedInterest)})
 </div>
 <div className="flex justify-between">
 <span className="font-semibold">만기 시 총 상환금:</span>
 <span className="font-bold text-slate-700">
 {formatCurrencyWithUnit(total)}
 </span>
 </div>
 </div>
 ) : (
 <div className="text-[15px] text-slate-700 grid gap-2.5 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
 {isSavings && dailyAmount > 0 && (
 <div className="flex justify-between">
 <span className="font-semibold">총 납입 예정액:</span>
 <span className="font-bold text-slate-700">
 {formatCurrencyWithUnit(dailyAmount * product.termInDays)}
 </span>
 </div>
 )}
 <div className="flex justify-between">
 <span className="font-semibold">만기 시 이자 (세전):</span>
 <span className="font-bold text-emerald-400 text-[17px]">
 +{formatCurrencyWithUnit(interest)}
 </span>
 </div>
 <div className="flex justify-between text-[17px]">
 <span className="font-bold">만기 시 총 수령액:</span>
 <span className="font-bold text-indigo-600">
 {formatCurrencyWithUnit(total)}
 </span>
 </div>
 </div>
 )}

 <div className="mt-5 text-right flex gap-2 justify-end">
 {isLoan ? (
 isMatured ? (
 <button
 onClick={onMaturity}
 className={cls.button(false, "danger") + " px-5 py-2.5 text-[15px]"}
 >
 만기 상환 ({formatCurrencyWithUnit(total)})
 </button>
 ) : product.repaymentType === "installment" ? (
 <>
 <button
 onClick={() => onLoanRepay && onLoanRepay(product, "installment")}
 className={cls.button(false, "primary") + " px-5 py-2.5 text-[15px]"}
 >
 분할 상환
 </button>
 <button
 onClick={() => onLoanRepay && onLoanRepay(product, "lumpSum")}
 className={cls.button(false, "danger") + " px-5 py-2.5 text-[15px]"}
 >
 전액 상환 ({formatCurrencyWithUnit(accruedTotal)})
 </button>
 </>
 ) : (
 <button
 onClick={() => onLoanRepay && onLoanRepay(product, "lumpSum")}
 className={cls.button(false, "danger") + " px-5 py-2.5 text-[15px]"}
 >
 일시 상환 ({formatCurrencyWithUnit(accruedTotal)})
 </button>
 )
 ) : isMatured ? (
 <button
 onClick={onMaturity}
 className={cls.button(false, "success") + " px-5 py-2.5 text-[15px]"}
 >
 만기 수령 ({formatCurrencyWithUnit(total)})
 </button>
 ) : (
 <button
 onClick={onCancel}
 className={cls.button(false, "danger") + " px-5 py-2.5 text-[15px]"}
 >
 중도 해지
 </button>
 )}
 </div>
 </div>
 );
};

const AvailableProductItem = ({ product, onSubscribe }) => {
 const dailyRate = product.dailyRate;
 const { interest: projectedInterest } = calculateCompoundInterest(
 100000,
 dailyRate,
 product.termInDays,
 );

 return (
 <div className="px-3 py-2.5 border border-slate-200 rounded-lg mb-2 flex justify-between items-center bg-slate-50 hover:bg-white hover:shadow-sm transition-all duration-200 gap-3">
 <div className="min-w-0 flex-1">
 <div className="font-bold text-sm text-slate-700 leading-tight">
 {product.name}
 </div>
 <div className="text-xs text-slate-600 mt-0.5">
 <strong className="text-indigo-600">일 {product.dailyRate}%</strong>{" "}
 · {product.termInDays}일
 </div>
 <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
 <TrendingUp size={11} className="inline mr-0.5" />
 10만 가입 시 +{formatCurrencyWithUnit(projectedInterest)}
 </div>
 </div>
 <button
 onClick={onSubscribe}
 className={cls.button(false) + " px-4 py-2 text-sm flex-shrink-0"}
 >
 가입
 </button>
 </div>
 );
};

const ProductSection = ({
 title,
 icon,
 subscribedProducts,
 availableProducts,
 onSubscribe,
 onCancel,
 onMaturity,
 onLoanRepay,
 sectionStyle = {},
}) => {
 return (
 <div
 className={cls.card}
 style={{
 ...sectionStyle,
 display: "flex",
 flexDirection: "column",
 maxHeight: "calc(100vh - 320px)",
 minHeight: 360,
 }}
 >
 <div className={cls.cardHeader}>
 {icon}
 <h2 className={cls.cardTitle}>{title}</h2>
 </div>
 <div
 style={{
 flex: 1,
 minHeight: 0,
 overflowY: "auto",
 paddingRight: 4,
 }}
 >
 <h3 className="text-sm font-bold text-slate-700 mb-2 pb-1.5 border-b border-slate-200 sticky top-0 bg-white/80 backdrop-blur-sm z-[1]">
 가입 가능한 상품
 </h3>
 {availableProducts.length > 0 ? (
 availableProducts.map((p) => (
 <AvailableProductItem
 key={p.id}
 product={p}
 onSubscribe={() => onSubscribe(p)}
 />
 ))
 ) : (
 <p className={cls.noProduct}>가입 가능한 상품이 없습니다.</p>
 )}
 <h3 className="text-sm font-bold text-slate-700 mt-4 mb-2 pb-1.5 border-b border-slate-200 sticky top-0 bg-white/80 backdrop-blur-sm z-[1]">
 가입한 상품
 </h3>
 {subscribedProducts.length > 0 ? (
 subscribedProducts.map((p) => (
 <SubscribedProductItem
 key={p.id}
 product={p}
 onCancel={() => onCancel(p)}
 onMaturity={() => onMaturity(p)}
 onLoanRepay={onLoanRepay}
 />
 ))
 ) : (
 <p className={cls.noProduct}>가입한 상품이 없습니다.</p>
 )}
 </div>
 </div>
 );
};

const SubscriptionModal = ({
 isOpen,
 onClose,
 product,
 productType,
 onConfirm,
 isProcessing,
}) => {
 const [amount, setAmount] = useState("");
 const [repaymentType, setRepaymentType] = useState("lumpSum");

 if (!isOpen || !product) return null;

 const numAmount = parseFloat(amount);
 const dailyRate = product.dailyRate;
 const isSavings = productType === "savings";
 const isLoan = productType === "loans";

 // 적금: 일 납입금 기반 예상 이자 / 예금: 일시불 기반
 let projectedInterest = 0, projectedTotal = 0, projectedTotalDeposited = 0;
 if (!isNaN(numAmount) && numAmount > 0) {
 if (isSavings) {
 const result = calculateSavingsInterest(numAmount, dailyRate, product.termInDays);
 projectedInterest = result.interest;
 projectedTotal = result.total;
 projectedTotalDeposited = result.totalDeposited;
 } else {
 const result = calculateCompoundInterest(numAmount, dailyRate, product.termInDays);
 projectedInterest = result.interest;
 projectedTotal = result.total;
 }
 }

 return (
 <div className={cls.modalOverlay} onClick={onClose}>
 <div className={cls.modalContent} onClick={(e) => e.stopPropagation()}>
 <button
 onClick={onClose}
 className={cls.modalCloseBtn}
 aria-label="닫기"
 >
 <X size={24} />
 </button>
 <h3 className={cls.modalTitle}>{product.name} {isLoan ? "대출" : "가입"}</h3>

 <div className={`mb-5 p-4 rounded-[10px] border ${isLoan ? "bg-red-50 border-red-200" : "bg-indigo-50 border-indigo-200"}`}>
 <div className="text-[15px] text-slate-600 mb-2">
 <strong className={isLoan ? "text-red-600" : "text-indigo-600"}>금리:</strong> 일{" "}
 {product.dailyRate}% (일복리)
 </div>
 <div className="text-[15px] text-slate-600">
 <strong className={isLoan ? "text-red-600" : "text-indigo-600"}>기간:</strong>{" "}
 {product.termInDays}일
 </div>
 {isSavings && (
 <>
 <div className="text-[15px] text-violet-600 mt-2 font-semibold">
 매일 자동으로 납입됩니다 (첫 납입은 즉시 처리)
 </div>
 <div className="text-[13px] text-amber-600 mt-1">
 ※ 일 납입금은 보유 현금 ÷ 기간일 이하만 가능
 </div>
 </>
 )}
 </div>

 {/* 대출 상환 방식 선택 */}
 {isLoan && (
 <div className="mb-5">
 <p className="mb-3 text-base font-semibold text-slate-700">상환 방식을 선택하세요</p>
 <div className="grid grid-cols-2 gap-3">
 <button
 onClick={() => setRepaymentType("lumpSum")}
 className={`p-4 rounded-xl border-2 transition-all text-left ${
 repaymentType === "lumpSum"
 ? "border-red-400 bg-red-500/10"
 : "border-slate-200 bg-slate-50"
 }`}
 >
 <div className="font-bold text-[15px] text-slate-700 mb-1">일시 상환</div>
 <div className="text-[13px] text-slate-400">만기 또는 중도에 원금+이자 전액 상환</div>
 </button>
 <button
 onClick={() => setRepaymentType("installment")}
 className={`p-4 rounded-xl border-2 transition-all text-left ${
 repaymentType === "installment"
 ? "border-red-400 bg-red-500/10"
 : "border-slate-200 bg-slate-50"
 }`}
 >
 <div className="font-bold text-[15px] text-slate-700 mb-1">분할 상환</div>
 <div className="text-[13px] text-slate-400">원하는 금액만큼 나눠서 상환 (이자 우선)</div>
 </button>
 </div>
 </div>
 )}

 <p className="mb-3 text-base font-semibold text-slate-700">
 {isSavings ? "일 납입 금액을 입력해주세요" : isLoan ? "대출 금액을 입력해주세요" : "가입 금액을 입력해주세요"}
 </p>
 <input
 type="number"
 value={amount}
 onChange={(e) => setAmount(e.target.value)}
 className={cls.input}
 placeholder={isLoan
 ? `최대 ${formatCurrencyWithUnit(product.maxAmount || 0)}`
 : `${formatCurrencyWithUnit(product.minAmount || 0)} 이상`
 }
 autoFocus
 />

 {numAmount > 0 && (
 <div className={`mb-5 p-4 rounded-[10px] border ${isLoan ? "bg-red-500/10 border-red-200" : "bg-emerald-500/10 border-emerald-500/30"}`}>
 {isSavings && (
 <div className="text-[15px] text-slate-600 mb-1.5">
 총 납입 예정액: <strong>{formatCurrencyWithUnit(projectedTotalDeposited)}</strong>
 <span className="text-slate-500 text-sm"> ({formatCurrencyWithUnit(numAmount)} x {product.termInDays}일)</span>
 </div>
 )}
 <div className={`text-[15px] mb-1.5 ${isLoan ? "text-red-400" : "text-emerald-400"}`}>
 {isLoan ? "만기 시 총 이자:" : "예상 만기 이자:"}{" "}
 <strong>{isLoan ? "" : "+"}{formatCurrencyWithUnit(projectedInterest)}</strong>
 </div>
 <div className={`text-base font-bold ${isLoan ? "text-red-400" : "text-emerald-400"}`}>
 {isLoan ? "만기 시 총 상환금:" : "만기 시 총 수령액:"} {formatCurrencyWithUnit(projectedTotal)}
 </div>
 </div>
 )}

 <button
 onClick={() => {
 onConfirm(amount, isLoan ? repaymentType : undefined);
 setAmount("");
 setRepaymentType("lumpSum");
 }}
 disabled={isProcessing || !amount}
 className={
 cls.button(isProcessing || !amount, isLoan ? "danger" : "primary") + " w-full text-[17px] py-4"
 }
 >
 {isProcessing ? "처리 중..." : isLoan ? "대출 실행" : "가입하기"}
 </button>
 </div>
 </div>
 );
};

// 대출 분할 상환 모달
const LoanRepaymentModal = ({
 isOpen,
 onClose,
 product,
 onConfirmLumpSum,
 onConfirmInstallment,
 isProcessing,
 repayMode,
}) => {
 const [installmentAmount, setInstallmentAmount] = useState("");
 const [splitMethod, setSplitMethod] = useState("interestFirst"); // "interestFirst" | "proportional"

 if (!isOpen || !product) return null;

 const { interest: accruedInterest, total: accruedTotal, elapsedDays } = calculateAccruedLoanInterest(
 product.balance, product.rate, product.startDate, product.lastRepaymentDate
 );

 const numInstallment = parseFloat(installmentAmount);
 let interestPortion = 0, principalPortion = 0;
 if (!isNaN(numInstallment) && numInstallment > 0) {
 if (splitMethod === "interestFirst") {
 // 이자 우선: 이자 먼저 갚고 나머지로 원금
 interestPortion = Math.min(numInstallment, accruedInterest);
 principalPortion = Math.max(0, numInstallment - interestPortion);
 } else {
 // 원리금 균등: 원금과 이자를 비율로 분배
 if (accruedTotal > 0) {
 const interestRatio = accruedInterest / accruedTotal;
 const principalRatio = product.balance / accruedTotal;
 interestPortion = Math.round(numInstallment * interestRatio);
 principalPortion = Math.round(numInstallment * principalRatio);
 // 반올림 오차 보정
 const diff = numInstallment - (interestPortion + principalPortion);
 principalPortion += diff;
 }
 }
 // 원금 초과 방지
 if (principalPortion > product.balance) {
 principalPortion = product.balance;
 interestPortion = numInstallment - principalPortion;
 }
 }

 const isLumpSum = repayMode === "lumpSum";

 return (
 <div className={cls.modalOverlay} onClick={onClose}>
 <div className={cls.modalContent} onClick={(e) => e.stopPropagation()}>
 <button onClick={onClose} className={cls.modalCloseBtn} aria-label="닫기">
 <X size={24} />
 </button>
 <h3 className={cls.modalTitle}>
 {isLumpSum ? "일시 상환" : "분할 상환"}
 </h3>

 <div className="mb-5 p-4 bg-red-50 rounded-[10px] border border-red-200">
 <div className="text-[15px] text-slate-400 mb-2">
 <strong className="text-slate-200">{product.name}</strong>
 </div>
 <div className="grid gap-2 text-[15px]">
 <div className="flex justify-between">
 <span className="text-slate-400">남은 원금:</span>
 <span className="font-bold text-slate-700">{formatCurrencyWithUnit(product.balance)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-slate-400">경과일:</span>
 <span className="font-bold text-slate-700">{elapsedDays}일</span>
 </div>
 <div className="flex justify-between">
 <span className="text-slate-400">누적 이자:</span>
 <span className="font-bold text-red-400">+{formatCurrencyWithUnit(accruedInterest)}</span>
 </div>
 <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
 <span className="text-slate-200 font-semibold">총 상환 필요금:</span>
 <span className="font-bold text-red-400 text-[17px]">{formatCurrencyWithUnit(accruedTotal)}</span>
 </div>
 </div>
 </div>

 {isLumpSum ? (
 <button
 onClick={onConfirmLumpSum}
 disabled={isProcessing}
 className={cls.button(isProcessing, "danger") + " w-full text-[17px] py-4"}
 >
 {isProcessing ? "처리 중..." : `전액 상환 (${formatCurrencyWithUnit(accruedTotal)})`}
 </button>
 ) : (
 <>
 {/* 분할 상환 방식 선택 */}
 <div className="mb-4">
 <p className="mb-2 text-sm font-semibold text-slate-400">상환 배분 방식</p>
 <div className="grid grid-cols-2 gap-2">
 <button
 onClick={() => setSplitMethod("interestFirst")}
 className={`p-3 rounded-lg border-2 transition-all text-left ${
 splitMethod === "interestFirst"
 ? "border-amber-400 bg-amber-500/10"
 : "border-slate-200 bg-slate-50"
 }`}
 >
 <div className="font-bold text-[14px] text-slate-700">이자 우선</div>
 <div className="text-[12px] text-slate-400 mt-0.5">이자 먼저 갚고 나머지 원금</div>
 </button>
 <button
 onClick={() => setSplitMethod("proportional")}
 className={`p-3 rounded-lg border-2 transition-all text-left ${
 splitMethod === "proportional"
 ? "border-amber-400 bg-amber-500/10"
 : "border-slate-200 bg-slate-50"
 }`}
 >
 <div className="font-bold text-[14px] text-slate-700">원리금 균등</div>
 <div className="text-[12px] text-slate-400 mt-0.5">원금·이자 비율로 분배</div>
 </button>
 </div>
 </div>

 <p className="mb-3 text-base font-semibold text-slate-700">상환할 금액을 입력하세요</p>
 <input
 type="number"
 value={installmentAmount}
 onChange={(e) => setInstallmentAmount(e.target.value)}
 className={cls.input}
 placeholder={`최소 1 이상 (총 ${formatCurrency(accruedTotal)})`}
 autoFocus
 />

 {numInstallment > 0 && (
 <div className="mb-5 p-4 bg-amber-500/10 rounded-[10px] border border-amber-500/30">
 <div className="text-[15px] text-slate-600 mb-1.5">
 이자 상환: <strong className="text-red-400">{formatCurrencyWithUnit(interestPortion)}</strong>
 {splitMethod === "proportional" && accruedTotal > 0 && (
 <span className="text-slate-500 text-sm"> ({Math.round((accruedInterest / accruedTotal) * 100)}%)</span>
 )}
 </div>
 <div className="text-[15px] text-slate-600 mb-1.5">
 원금 상환: <strong className="text-emerald-400">{formatCurrencyWithUnit(principalPortion)}</strong>
 {splitMethod === "proportional" && accruedTotal > 0 && (
 <span className="text-slate-500 text-sm"> ({Math.round((product.balance / accruedTotal) * 100)}%)</span>
 )}
 </div>
 {principalPortion > 0 && (
 <div className="text-base text-slate-700 font-bold border-t border-slate-200 pt-2 mt-2">
 상환 후 남은 원금: {formatCurrencyWithUnit(Math.max(0, product.balance - principalPortion))}
 </div>
 )}
 {numInstallment >= accruedTotal && (
 <div className="text-[13px] text-emerald-400 mt-2 font-semibold">
 * 전액 상환됩니다 (대출 완료)
 </div>
 )}
 </div>
 )}

 <button
 onClick={() => {
 onConfirmInstallment(installmentAmount, splitMethod);
 setInstallmentAmount("");
 }}
 disabled={isProcessing || !installmentAmount || numInstallment <= 0}
 className={cls.button(isProcessing || !installmentAmount || numInstallment <= 0, "danger") + " w-full text-[17px] py-4"}
 >
 {isProcessing ? "처리 중..." : "상환하기"}
 </button>
 </>
 )}
 </div>
 </div>
 );
};

const ParkingAccountSection = ({
 balance,
 dailyInterest,
 onDeposit,
 onWithdraw,
 isProcessing,
 userCash,
 parkingRate = 0.1,
}) => {
 const [amount, setAmount] = useState("");

 return (
 <div data-parking="true" className="parking-wrap bg-gradient-to-br from-indigo-100 to-blue-100 shadow-[0_4px_16px_rgba(99,102,241,0.15)] rounded-2xl p-6 border border-indigo-300">
 <div className="flex items-center gap-3 mb-5 pb-4 border-b-2 border-indigo-100">
 <Wallet size={28} className="parking-icon" />
 <h2 className="text-xl font-bold parking-title">
 파킹통장
 </h2>
 </div>

 {/* 보유현금 표시 */}
 <div className="bg-white/70 px-4 py-3 rounded-xl mb-4 flex justify-between items-center border border-indigo-100">
 <span className="text-sm font-medium parking-label">보유 현금</span>
 <span className="text-lg font-bold parking-accent">
 {formatCurrencyWithUnit(userCash || 0)}
 </span>
 </div>

 <div className="text-[36px] font-bold mb-1 parking-balance">
 {formatCurrencyWithUnit(balance)}
 </div>

 <p className="text-sm mb-4 font-medium parking-desc">
 매일 이자가 자동 지급되는 자유 입출금 통장
 </p>

 <div className="bg-white/70 p-4 rounded-xl mb-5 border border-indigo-100">
 <div className="flex items-center gap-2 mb-1.5">
 <TrendingUp size={18} className="parking-interest-icon" />
 <span className="text-sm font-semibold parking-label">
 일일 이자 수익
 </span>
 </div>
 <div className="text-2xl font-bold parking-interest">
 +{formatCurrencyWithUnit(dailyInterest)}/일
 </div>
 <div className="text-xs mt-1 parking-muted">
 (일 {parkingRate}% 복리 기준)
 </div>
 </div>

 <div className="flex gap-2.5">
 <input
 type="number"
 value={amount}
 onChange={(e) => setAmount(e.target.value)}
 placeholder="금액 입력"
 className="flex-1 py-3 px-4 bg-white border border-slate-200 rounded-xl text-base text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
 disabled={isProcessing}
 />
 <button
 onClick={() => {
 onDeposit(amount);
 setAmount("");
 }}
 disabled={isProcessing}
 className={
 cls.button(isProcessing, "success") + " text-base px-6 py-3"
 }
 >
 입금
 </button>
 <button
 onClick={() => {
 onWithdraw(amount);
 setAmount("");
 }}
 disabled={isProcessing}
 className={
 cls.button(isProcessing) +
 " !bg-slate-400 text-base px-6 py-3"
 }
 >
 출금
 </button>
 </div>
 </div>
 );
};

// --- Main Component ---
const ParkingAccount = ({
 auth = {},
 depositProducts = [],
 installmentProducts = [],
 loanProducts = [],
 activeView = "parking",
 onViewChange,
 onLoadUserProducts,
 allUserProducts = [],
 onDeleteUserProduct,
}) => {
 const {
 user,
 userDoc,
 loading,
 refreshUserDocument,
 isAdmin,
 addCash,
 deductCash,
 } = auth;
 const userId = user?.uid;

 const [isProcessing, setIsProcessing] = useState(false);
 const [message, setMessage] = useState(null);
 const [messageType, setMessageType] = useState("");
 const [parkingBalance, setParkingBalance] = useState(0);
 const [parkingDailyInterest, setParkingDailyInterest] = useState(0);
 const [parkingRate, setParkingRate] = useState(0.1);
 const [userDeposits, setUserDeposits] = useState([]);
 const [userSavings, setUserSavings] = useState([]);
 const [userLoans, setUserLoans] = useState([]);
 const [modal, setModal] = useState({
 isOpen: false,
 product: null,
 type: "",
 });
 const [loanRepayModal, setLoanRepayModal] = useState({
 isOpen: false,
 product: null,
 repayMode: "lumpSum",
 });
 const [currentCash, setCurrentCash] = useState(userDoc?.cash || 0);
 const { currencyUnit } = useCurrency();

 const displayMessage = (text, type = "info", duration = 3000) => {
 setMessage(text);
 setMessageType(type);
 if (duration) setTimeout(() => setMessage(null), duration);
 };

 const loadAllData = useCallback(async () => {
 if (!userId) return;
 setIsProcessing(true);
 try {
 // 파킹통장 처리
 const parkingRef = doc(
 db,
 "users",
 userId,
 "financials",
 "parkingAccount",
 );
 const parkingRateProduct =
 depositProducts.length > 0 ? depositProducts[0] : null;

 if (parkingRateProduct) {
 const parkingDoc = await getDoc(parkingRef);
 if (parkingDoc.exists()) {
 const data = parkingDoc.data();
 const lastInterestDate = data.lastInterestDate?.toDate();

 if (!lastInterestDate || !isToday(lastInterestDate)) {
 const daysToApply = lastInterestDate
 ? differenceInCalendarDays(new Date(), lastInterestDate)
 : 1;
 if (daysToApply > 0) {
 const dailyRate = 0.1; // 파킹통장 일일 이자율 0.1% 고정
 const { interest } = calculateCompoundInterest(
 data.balance || 0,
 dailyRate,
 daysToApply,
 );

 if (interest > 0) {
 await updateDoc(parkingRef, {
 balance: increment(interest),
 lastInterestDate: serverTimestamp(),
 });
 displayMessage(
 `파킹통장 이자 ${formatCurrency(interest)}${currencyUnit}이 지급되었습니다.`,
 "success",
 );
 }
 }
 }
 } else {
 // 파킹통장이 없으면 생성
 await setDoc(parkingRef, {
 balance: 0,
 lastInterestDate: serverTimestamp(),
 });
 }
 }

 // 최종 잔액 조회
 const finalParkingDoc = await getDoc(parkingRef);
 if (finalParkingDoc.exists()) {
 const balance = finalParkingDoc.data().balance || 0;
 setParkingBalance(balance);

 // 일일 이자 계산 (상품 설정 이자율 기준)
 const actualDailyRate = 0.1; // 파킹통장 일일 이자율 0.1% 고정
 setParkingRate(actualDailyRate);
 const dailyInterest = calculateDailyInterest(balance, actualDailyRate);
 setParkingDailyInterest(dailyInterest);
 }

 // 가입 상품 조회
 const productsRef = collection(db, "users", userId, "products");
 const snapshot = await getDocs(productsRef);
 const deposits = [],
 savings = [],
 loans = [];

 snapshot.forEach((docSnap) => {
 const product = {
 id: docSnap.id,
 ...docSnap.data(),
 maturityDate: docSnap.data().maturityDate?.toDate
 ? docSnap.data().maturityDate.toDate()
 : docSnap.data().maturityDate,
 };
 if (product.type === "deposit") deposits.push(product);
 else if (product.type === "savings") savings.push(product);
 else if (product.type === "loan") loans.push(product);
 });

 setUserDeposits(deposits);
 setUserSavings(savings);
 setUserLoans(loans);
 } catch (error) {
 logger.error("데이터 로드 오류:", error);
 displayMessage("데이터를 불러오는 데 실패했습니다.", "error");
 } finally {
 setIsProcessing(false);
 }
 }, [userId, depositProducts, currencyUnit]);

 useEffect(() => {
 if (!loading && userId) loadAllData();
 }, [userId, loading, loadAllData]);

 // userDoc의 cash가 변경될 때마다 currentCash 업데이트
 useEffect(() => {
 if (userDoc?.cash !== undefined) {
 setCurrentCash(userDoc.cash);
 logger.log("[ParkingAccount] currentCash 업데이트:", userDoc.cash);
 }
 }, [userDoc?.cash]);

 // 만기 도달 대출 자동 강제 상환은 AlchanLayout의 useAutoLoanRepay hook에서 글로벌 처리

 const handleOpenModal = (product, type) =>
 setModal({ isOpen: true, product, type });
 const handleCloseModal = () =>
 setModal({ isOpen: false, product: null, type: "" });

 const handleOpenLoanRepayModal = (product, repayMode) => {
 setLoanRepayModal({ isOpen: true, product, repayMode });
 };
 const handleCloseLoanRepayModal = () => {
 setLoanRepayModal({ isOpen: false, product: null, repayMode: "lumpSum" });
 };

 // 대출 일시 상환 (전액: 원금 + 경과 이자)
 const handleLoanLumpSumRepay = async () => {
 const product = loanRepayModal.product;
 if (!product || !userId) return;

 const { id, name, balance, rate, teacherId } = product;
 const { interest: accruedInterest, total: accruedTotal, elapsedDays } = calculateAccruedLoanInterest(
 balance, rate, product.startDate, product.lastRepaymentDate
 );

 setIsProcessing(true);
 handleCloseLoanRepayModal();

 let teacherAccountId = teacherId;
 if (!teacherAccountId) {
 const teacherAccount = await getTeacherAccount(userDoc?.classCode);
 if (!teacherAccount) {
 displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
 setIsProcessing(false);
 return;
 }
 teacherAccountId = teacherAccount.id;
 }

 // 낙관적 업데이트
 const originalLoans = [...userLoans];
 const originalCash = currentCash;
 setUserLoans((prev) => prev.filter((p) => p.id !== id));
 setCurrentCash((prev) => prev - accruedTotal);

 try {
 const productRef = doc(db, "users", userId, "products", String(id));
 await runTransaction(db, async (transaction) => {
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherAccountId);
 const userSnapshot = await transaction.get(userRef);
 const teacherSnapshot = await transaction.get(teacherRef);

 if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
 if (!teacherSnapshot.exists()) throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

 const currentCashInDb = userSnapshot.data()?.cash ?? 0;
 if (currentCashInDb < accruedTotal) {
 throw new Error(`상환금이 부족합니다. (필요: ${formatCurrency(accruedTotal)}${currencyUnit}, 보유: ${formatCurrency(currentCashInDb)}${currencyUnit})`);
 }

 transaction.update(userRef, { cash: increment(-accruedTotal) });
 transaction.update(teacherRef, { cash: increment(accruedTotal) });
 transaction.delete(productRef);
 });

 displayMessage(`대출 일시 상환 완료: ${formatCurrency(accruedTotal)}${currencyUnit} (원금 ${formatCurrency(balance)} + 이자 ${formatCurrency(accruedInterest)})`, "success");

 logActivity(db, {
 classCode: userDoc?.classCode,
 userId, userName: userDoc?.name || "사용자",
 type: ACTIVITY_TYPES.LOAN_REPAY,
 description: `대출 일시 상환: ${name} (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(accruedInterest)}, 경과: ${elapsedDays}일)`,
 amount: -accruedTotal,
 metadata: { productName: name, principal: balance, interest: accruedInterest, total: accruedTotal, elapsedDays, teacherId: teacherAccountId, repaymentType: "lumpSum" },
 });

 if (refreshUserDocument) refreshUserDocument();
 await loadAllData();
 } catch (error) {
 logger.error("일시 상환 오류:", error);
 displayMessage(`처리 오류: ${error.message}`, "error");
 setUserLoans(originalLoans);
 setCurrentCash(originalCash);
 } finally {
 setIsProcessing(false);
 }
 };

 // 대출 분할 상환 (부분 상환: 이자 우선 또는 원리금 균등)
 const handleLoanInstallmentRepay = async (repayAmountStr, splitMethod = "interestFirst") => {
 const product = loanRepayModal.product;
 if (!product || !userId) return;

 const repayAmount = Math.round(parseFloat(repayAmountStr));
 if (isNaN(repayAmount) || repayAmount <= 0) {
 return displayMessage("유효한 금액을 입력하세요.", "error");
 }

 const { id, name, balance, rate, teacherId } = product;
 const { interest: accruedInterest, total: accruedTotal } = calculateAccruedLoanInterest(
 balance, rate, product.startDate, product.lastRepaymentDate
 );

 if (repayAmount > accruedTotal) {
 return displayMessage(`상환 금액이 총 상환금(${formatCurrency(accruedTotal)}${currencyUnit})을 초과합니다.`, "error");
 }

 let interestPortion, principalPortion;
 if (splitMethod === "proportional" && accruedTotal > 0) {
 // 원리금 균등: 비율로 분배
 const interestRatio = accruedInterest / accruedTotal;
 interestPortion = Math.round(repayAmount * interestRatio);
 principalPortion = repayAmount - interestPortion;
 // 원금 초과 방지
 if (principalPortion > balance) {
 principalPortion = balance;
 interestPortion = repayAmount - principalPortion;
 }
 } else {
 // 이자 우선: 이자 먼저 갚고 나머지 원금
 interestPortion = Math.min(repayAmount, accruedInterest);
 principalPortion = Math.max(0, repayAmount - interestPortion);
 }

 const newBalance = Math.max(0, balance - principalPortion);
 const isFullyRepaid = newBalance <= 0 && repayAmount >= accruedTotal;

 setIsProcessing(true);
 handleCloseLoanRepayModal();

 let teacherAccountId = teacherId;
 if (!teacherAccountId) {
 const teacherAccount = await getTeacherAccount(userDoc?.classCode);
 if (!teacherAccount) {
 displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
 setIsProcessing(false);
 return;
 }
 teacherAccountId = teacherAccount.id;
 }

 // 낙관적 업데이트
 const originalLoans = [...userLoans];
 const originalCash = currentCash;
 if (isFullyRepaid) {
 setUserLoans((prev) => prev.filter((p) => p.id !== id));
 } else {
 setUserLoans((prev) => prev.map((p) => p.id === id ? { ...p, balance: newBalance } : p));
 }
 setCurrentCash((prev) => prev - repayAmount);

 try {
 const productRef = doc(db, "users", userId, "products", String(id));
 await runTransaction(db, async (transaction) => {
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherAccountId);
 const userSnapshot = await transaction.get(userRef);
 const teacherSnapshot = await transaction.get(teacherRef);

 if (!userSnapshot.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
 if (!teacherSnapshot.exists()) throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

 const currentCashInDb = userSnapshot.data()?.cash ?? 0;
 if (currentCashInDb < repayAmount) {
 throw new Error(`상환금이 부족합니다. (필요: ${formatCurrency(repayAmount)}${currencyUnit}, 보유: ${formatCurrency(currentCashInDb)}${currencyUnit})`);
 }

 transaction.update(userRef, { cash: increment(-repayAmount) });
 transaction.update(teacherRef, { cash: increment(repayAmount) });

 if (isFullyRepaid) {
 transaction.delete(productRef);
 } else {
 transaction.update(productRef, {
 balance: newBalance,
 lastRepaymentDate: serverTimestamp(),
 totalInterestPaid: increment(interestPortion),
 });
 }
 });

 const resultMsg = isFullyRepaid
 ? `대출 완납! 총 ${formatCurrency(repayAmount)}${currencyUnit} 상환 (대출 종료)`
 : `분할 상환 완료: ${formatCurrency(repayAmount)}${currencyUnit} (이자 ${formatCurrency(interestPortion)} + 원금 ${formatCurrency(principalPortion)}) / 남은 원금: ${formatCurrency(newBalance)}${currencyUnit}`;
 displayMessage(resultMsg, "success");

 logActivity(db, {
 classCode: userDoc?.classCode,
 userId, userName: userDoc?.name || "사용자",
 type: ACTIVITY_TYPES.LOAN_REPAY,
 description: `대출 분할 상환: ${name} (이자: ${formatCurrency(interestPortion)}, 원금: ${formatCurrency(principalPortion)}, 남은 원금: ${formatCurrency(newBalance)})`,
 amount: -repayAmount,
 metadata: { productName: name, interestPaid: interestPortion, principalPaid: principalPortion, remainingBalance: newBalance, isFullyRepaid, teacherId: teacherAccountId, repaymentType: "installment", splitMethod },
 });

 if (refreshUserDocument) refreshUserDocument();
 await loadAllData();
 } catch (error) {
 logger.error("분할 상환 오류:", error);
 displayMessage(`처리 오류: ${error.message}`, "error");
 setUserLoans(originalLoans);
 setCurrentCash(originalCash);
 } finally {
 setIsProcessing(false);
 }
 };

 const handleSubscribe = async (subscribeAmount, repaymentType) => {
 logger.log("--- handleSubscribe 시작 ---");
 const amount = parseFloat(subscribeAmount);
 const { product, type } = modal;

 logger.log("가입할 상품:", product);
 logger.log(`가입 유형: ${type}, 가입 금액: ${amount}`);

 if (isNaN(amount) || amount <= 0) {
 logger.error("유효하지 않은 금액:", subscribeAmount);
 return displayMessage("유효한 금액을 입력하세요.", "error");
 }
 if (product.minAmount && amount < product.minAmount) {
 logger.error(`최소 가입 금액 미달: ${amount} < ${product.minAmount}`);
 return displayMessage(
 `최소 가입 금액은 ${formatCurrency(product.minAmount)}${currencyUnit}입니다.`,
 "error",
 );
 }
 if (product.maxAmount && amount > product.maxAmount) {
 logger.error(`최대 가입 한도 초과: ${amount} > ${product.maxAmount}`);
 return displayMessage(
 `최대 가입 한도는 ${formatCurrency(product.maxAmount)}${currencyUnit}입니다.`,
 "error",
 );
 }

 // 🔥 대출 한도: 보유 현금의 10배까지만 가능
 if (type === "loans") {
 // 🔥 기존 미상환 대출이 있으면 추가 대출 불가
 const hasActiveLoan = (userLoans || []).some(
 (l) => !l.isOptimistic && Number(l.balance) > 0,
 );
 if (hasActiveLoan) {
 return displayMessage(
 "이미 미상환 대출이 있습니다. 기존 대출을 먼저 갚아주세요.",
 "error",
 );
 }
 if (await isNetAssetsNegative(userDoc)) {
 return displayMessage(NEGATIVE_ASSETS_MESSAGE, "error");
 }
 const availableCash = Number(currentCash) || 0;
 if (availableCash <= 0) {
 return displayMessage(
 "대출은 현금을 1원 이상 보유해야 신청할 수 있습니다.",
 "error",
 );
 }
 const maxLoan = availableCash * 10;
 if (amount > maxLoan) {
 return displayMessage(
 `대출 한도 초과: 보유 현금(${formatCurrency(availableCash)}${currencyUnit})의 10배(${formatCurrency(maxLoan)}${currencyUnit})까지만 가능합니다.`,
 "error",
 );
 }
 }

 setIsProcessing(true);
 handleCloseModal(); // UX 개선을 위해 모달 즉시 닫기

 // --- 선생님 계정 조회 ---
 const teacherAccount = await getTeacherAccount(userDoc?.classCode);
 if (!teacherAccount) {
 displayMessage(
 "선생님(은행) 계정을 찾을 수 없습니다. 관리자에게 문의하세요.",
 "error",
 );
 setIsProcessing(false);
 return;
 }
 logger.log("선생님 계정:", teacherAccount.name, teacherAccount.id);

 // --- 낙관적 업데이트 (Optimistic Update) ---
 const tempId = `temp_${Date.now()}`;
 const maturityDate = new Date(
 Date.now() + product.termInDays * 24 * 60 * 60 * 1000,
 );
 const optimisticProduct = {
 id: tempId,
 name: product.name,
 termInDays: product.termInDays,
 rate: product.dailyRate,
 balance: amount,
 startDate: new Date(),
 maturityDate: maturityDate,
 type:
 type === "deposits"
 ? "deposit"
 : type === "savings"
 ? "savings"
 : "loan",
 isOptimistic: true, // 임시 데이터임을 표시
 };

 // 상품 목록 낙관적 업데이트
 if (optimisticProduct.type === "deposit") {
 setUserDeposits((prev) => [...prev, optimisticProduct]);
 } else if (optimisticProduct.type === "savings") {
 setUserSavings((prev) => [...prev, optimisticProduct]);
 } else if (optimisticProduct.type === "loan") {
 setUserLoans((prev) => [...prev, optimisticProduct]);
 }

 // 현금 보유량 낙관적 업데이트
 const cashChangeAmount = type === "loans" ? amount : -amount;
 setCurrentCash((prev) => prev + cashChangeAmount); // 로컬 UI 상태만 먼저 업데이트

 try {
 await runTransaction(db, async (transaction) => {
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherAccount.id);

 const userSnapshot = await transaction.get(userRef);
 const teacherSnapshot = await transaction.get(teacherRef);

 if (!userSnapshot.exists())
 throw new Error("사용자 정보를 찾을 수 없습니다.");
 if (!teacherSnapshot.exists())
 throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

 const currentCashInDb = userSnapshot.data()?.cash ?? 0;
 const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;

 // 예금/적금: 학생 현금 확인
 if (type !== "loans" && currentCashInDb < amount) {
 throw new Error("보유 현금이 부족합니다.");
 }

 // 적금: 일 납입금 ≤ 보유 현금 ÷ 기간일 (매일 납입 가능해야 함)
 if (type === "savings") {
 const maxDailyAmount = Math.floor(currentCashInDb / product.termInDays);
 if (amount > maxDailyAmount) {
 throw new Error(
 `적금 일 납입금은 보유 현금 ÷ 기간(${product.termInDays}일) 이하만 가능합니다. (최대: ${formatCurrency(maxDailyAmount)}${currencyUnit})`
 );
 }
 }

 // 🔥 대출 한도: 학생 보유 현금의 10배까지만 (DB 기준 재확인)
 if (type === "loans") {
 if (currentCashInDb <= 0) {
 throw new Error("대출은 현금을 1원 이상 보유해야 신청할 수 있습니다.");
 }
 const maxLoan = currentCashInDb * 10;
 if (amount > maxLoan) {
 throw new Error(
 `대출 한도 초과: 보유 현금(${formatCurrency(currentCashInDb)}${currencyUnit})의 10배(${formatCurrency(maxLoan)}${currencyUnit})까지만 가능합니다.`
 );
 }
 }

 // 대출: 선생님(은행) 현금 부족 시 경고만 (마이너스 허용)
 if (type === "loans" && teacherCashInDb < amount) {
 logger.log(`[은행] 대출 - 선생님 잔액 부족하지만 진행 (필요: ${amount}, 보유: ${teacherCashInDb})`);
 }

 const isSavingsType = type === "savings";
 const isLoanType = type === "loans";
 const newProductData = {
 name: product.name,
 termInDays: product.termInDays,
 rate: product.dailyRate,
 balance: amount,
 startDate: serverTimestamp(),
 maturityDate: maturityDate,
 type:
 type === "deposits"
 ? "deposit"
 : type === "savings"
 ? "savings"
 : "loan",
 teacherId: teacherAccount.id,
 teacherName: teacherAccount.name || "선생님",
 // 적금 전용 필드
 ...(isSavingsType && {
 dailyAmount: amount, // 일 납입금
 totalDeposited: amount, // 누적 납입액 (첫 1일치)
 depositsCount: 1, // 납입 횟수
 }),
 // 대출 전용 필드
 ...(isLoanType && {
 repaymentType: repaymentType || "lumpSum", // 상환 방식
 originalBalance: amount, // 최초 대출 원금
 lastRepaymentDate: null, // 마지막 상환일
 totalInterestPaid: 0, // 누적 이자 납부액
 }),
 };

 const newProductRef = doc(collection(db, "users", userId, "products"));
 transaction.set(newProductRef, newProductData);

 // 예금/적금: 학생 → 선생님
 // 대출: 선생님 → 학생
 if (type === "loans") {
 // 대출: 선생님에서 학생으로
 transaction.update(userRef, { cash: increment(amount) });
 transaction.update(teacherRef, { cash: increment(-amount) });
 } else {
 // 예금/적금: 학생에서 선생님으로 (적금은 첫 1일치만)
 transaction.update(userRef, { cash: increment(-amount) });
 transaction.update(teacherRef, { cash: increment(amount) });
 }
 });

 const actionText = type === "loans" ? "대출" : "가입";
 const repayLabel = type === "loans" ? (repaymentType === "installment" ? " [분할 상환]" : " [일시 상환]") : "";
 displayMessage(
 `${product.name} ${actionText}이 완료되었습니다.${repayLabel} (선생님 계정과 연동)`,
 "success",
 );

 // 🔥 활동 로그 기록 (예금/적금/대출 가입)
 const activityType =
 type === "deposits"
 ? ACTIVITY_TYPES.DEPOSIT_CREATE
 : type === "savings"
 ? ACTIVITY_TYPES.DEPOSIT_CREATE
 : ACTIVITY_TYPES.LOAN_CREATE;
 logActivity(db, {
 classCode: userDoc?.classCode,
 userId: userId,
 userName: userDoc?.name || "사용자",
 type: activityType,
 description: `${product.name} ${type === "loans" ? "대출" : "가입"} (${formatCurrency(amount)}원) - 선생님 계정 연동`,
 amount: cashChangeAmount,
 metadata: {
 productName: product.name,
 productType: type,
 termInDays: product.termInDays,
 dailyRate: product.dailyRate,
 maturityDate: maturityDate.toISOString(),
 teacherId: teacherAccount.id,
 teacherName: teacherAccount.name,
 },
 });

 // 서버 데이터로 다시 로드하여 낙관적 업데이트 결과 교체
 await loadAllData();
 if (refreshUserDocument) refreshUserDocument();
 } catch (error) {
 logger.error("가입 처리 중 오류 발생:", error);
 displayMessage(`처리 오류: ${error.message}`, "error");

 // --- 낙관적 업데이트 롤백 ---
 if (optimisticProduct.type === "deposit") {
 setUserDeposits((prev) => prev.filter((p) => p.id !== tempId));
 } else if (optimisticProduct.type === "savings") {
 setUserSavings((prev) => prev.filter((p) => p.id !== tempId));
 } else if (optimisticProduct.type === "loan") {
 setUserLoans((prev) => prev.filter((p) => p.id !== tempId));
 }

 // 현금 롤백 (로컬 UI)
 setCurrentCash((prev) => prev - cashChangeAmount);
 } finally {
 setIsProcessing(false);
 }
 };

 // 만기 수령 / 강제 상환 (force=true면 confirm 스킵, 자동 트리거 용도)
 const handleMaturity = async (product, options = {}) => {
 const { force = false } = options;
 logger.log(`--- handleMaturity 시작 ${force ? "(강제 상환)" : ""} ---`);
 logger.log("처리할 상품:", product);

 const { id, name, type, balance, termInDays, rate, teacherId } = product;
 const isLoan = type === "loan";

 if (!userId) {
 displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
 logger.error("handleMaturity: userId가 없습니다.");
 return;
 }

 const dailyRate = rate;
 const isSavings = type === "savings" && product.dailyAmount > 0;
 let total, interest;
 if (isSavings) {
 const result = calculateSavingsInterest(product.dailyAmount, dailyRate, termInDays, termInDays);
 total = result.total;
 interest = result.interest;
 } else {
 const result = calculateCompoundInterest(balance, dailyRate, termInDays);
 total = result.total;
 interest = result.interest;
 }

 logger.log(`계산 결과: ${isSavings ? '적금' : '예금'} 원금=${isSavings ? product.totalDeposited : balance}, 이자=${interest}, 총액=${total}`);

 // 강제 상환(force)은 만기 도달 시 자동 트리거 — 학생 동의 없이 즉시 차감
 if (!force) {
 const confirmMsg = isLoan
 ? `대출 만기 상환: 원금 ${formatCurrency(balance)}${currencyUnit} + 이자 ${formatCurrency(interest)}${currencyUnit} = ${formatCurrency(total)}${currencyUnit}을 상환하시겠습니까?`
 : `만기 수령: 원금 ${formatCurrency(balance)}${currencyUnit} + 이자 ${formatCurrency(interest)}${currencyUnit} = ${formatCurrency(total)}${currencyUnit}을 수령하시겠습니까?`;

 if (!window.confirm(confirmMsg)) {
 logger.log("사용자가 만기 처리를 취소했습니다.");
 return;
 }
 }

 setIsProcessing(true);
 logger.log("만기 처리 시작...");

 // 선생님 계정 조회 (저장된 teacherId 사용 또는 새로 조회)
 let teacherAccountId = teacherId;
 if (!teacherAccountId) {
 const teacherAccount = await getTeacherAccount(userDoc?.classCode);
 if (!teacherAccount) {
 displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
 setIsProcessing(false);
 return;
 }
 teacherAccountId = teacherAccount.id;
 }
 logger.log("선생님 계정 ID:", teacherAccountId);

 try {
 const productRef = doc(db, "users", userId, "products", String(id));
 logger.log("Firestore 문서 참조:", productRef.path);

 await runTransaction(db, async (transaction) => {
 logger.log("트랜잭션 시작");
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherAccountId);

 const userSnapshot = await transaction.get(userRef);
 const teacherSnapshot = await transaction.get(teacherRef);

 if (!userSnapshot.exists())
 throw new Error("사용자 정보를 찾을 수 없습니다.");
 if (!teacherSnapshot.exists())
 throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

 const currentCashInDb = userSnapshot.data()?.cash ?? 0;
 const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;

 if (isLoan) {
 // 대출 만기 상환: 학생 → 선생님 (원금+이자, 잔액 부족 시 마이너스 허용)
 if (currentCashInDb < total) {
 logger.log(`[은행] 대출 만기 상환 - 학생 잔액 부족, 마이너스 차감 진행 (필요: ${total}, 보유: ${currentCashInDb}, 차감 후: ${currentCashInDb - total})`);
 }
 transaction.update(userRef, { cash: increment(-total) });
 transaction.update(teacherRef, { cash: increment(total) });
 logger.log(`대출 상환: 학생 -${total}, 선생님 +${total}`);
 } else {
 // 예금/적금 만기 수령: 선생님 → 학생 (원금+이자, 마이너스 허용)
 if (teacherCashInDb < total) {
 logger.log(`[은행] 만기 수령 - 선생님 잔액 부족하지만 진행 (필요: ${total}, 보유: ${teacherCashInDb})`);
 }
 transaction.update(userRef, { cash: increment(total) });
 transaction.update(teacherRef, { cash: increment(-total) });
 logger.log(`만기 수령: 학생 +${total}, 선생님 -${total}`);
 }

 transaction.delete(productRef);
 logger.log("상품 문서 삭제 예약");
 logger.log("트랜잭션 커밋 시도");
 });

 logger.log("트랜잭션 성공");

 const finalCash = (currentCash || 0) - total;
 const successMsg = isLoan
 ? `${force ? "⚠️ 만기일 도래 - 자동 강제 상환: " : "대출 상환 완료: "}${formatCurrency(total)}${currencyUnit} (선생님 계정으로 이체)${finalCash < 0 ? ` · 잔액 ${formatCurrency(finalCash)}${currencyUnit} (마이너스)` : ""}`
 : `만기 수령 완료: ${formatCurrency(total)}${currencyUnit} (선생님 계정에서 지급)`;
 displayMessage(successMsg, "success");

 // 🔥 활동 로그 기록 (예금 만기 / 대출 상환)
 const activityType = isLoan
 ? ACTIVITY_TYPES.LOAN_REPAY
 : ACTIVITY_TYPES.DEPOSIT_MATURITY;
 logActivity(db, {
 classCode: userDoc?.classCode,
 userId: userId,
 userName: userDoc?.name || "사용자",
 type: activityType,
 description: isLoan
 ? `대출 만기 상환: ${name} (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(interest)}) - 선생님 계정으로`
 : `${name} 만기 수령 (원금: ${formatCurrency(balance)}, 이자: ${formatCurrency(interest)}) - 선생님 계정에서`,
 amount: isLoan ? -total : total,
 metadata: {
 productName: name,
 productType: type,
 principal: balance,
 interest,
 total,
 teacherId: teacherAccountId,
 },
 });

 // 백그라운드에서 userDoc 갱신
 if (refreshUserDocument) {
 logger.log("userDoc 갱신 시작");
 refreshUserDocument().then(() => {
 logger.log("[ParkingAccount] 만기 처리 후 userDoc 갱신 완료");
 });
 }

 logger.log("전체 데이터 다시 로드");
 await loadAllData();
 } catch (error) {
 logger.error("만기 처리 중 오류 발생:", error);
 displayMessage(`처리 오류: ${error.message}`, "error");
 // 에러 발생 시 currentCash 롤백
 if (userDoc?.cash !== undefined) {
 logger.log("오류 발생으로 현금 롤백:", userDoc.cash);
 setCurrentCash(userDoc.cash);
 }
 } finally {
 setIsProcessing(false);
 logger.log("--- handleMaturity 종료 ---");
 }
 };

 // 중도 해지
 const handleCancelEarly = async (product) => {
 logger.log("--- handleCancelEarly 시작 ---");
 logger.log("중도 해지할 상품:", product);

 const { id, name, type, balance } = product;
 const isLoan = type === "loan";
 // 적금: totalDeposited 사용 (실제 납입한 금액만 반환)
 const refundAmount = (type === "savings" && product.totalDeposited) ? product.totalDeposited : balance;

 // 🔥 대출 일시 상환: 경과 이자까지 합산 (원금 + 누적 이자)
 let loanAccruedInterest = 0;
 let loanTotalRepay = balance;
 let loanElapsedDays = 0;
 if (isLoan) {
 const accrued = calculateAccruedLoanInterest(
 product.balance,
 product.rate,
 product.startDate,
 product.lastRepaymentDate,
 );
 loanAccruedInterest = accrued.interest;
 loanTotalRepay = accrued.total;
 loanElapsedDays = accrued.elapsedDays;
 }

 if (!userId) {
 displayMessage("사용자 정보가 없습니다. 다시 로그인해주세요.", "error");
 logger.error("handleCancelEarly: userId가 없습니다.");
 return;
 }

 const confirmMessage = isLoan
 ? `대출 일시 상환\n\n원금: ${formatCurrency(balance)}${currencyUnit}\n경과 이자: ${formatCurrency(loanAccruedInterest)}${currencyUnit} (${loanElapsedDays}일)\n총 상환액: ${formatCurrency(loanTotalRepay)}${currencyUnit}\n\n상환하시겠습니까?`
 : `'${name}'을(를) 중도 해지하시겠습니까? (이자 없이 납입 원금 ${formatCurrency(refundAmount)}${currencyUnit}만 반환됩니다)`;

 if (!window.confirm(confirmMessage)) {
 logger.log("사용자가 중도 해지를 취소했습니다.");
 return;
 }

 setIsProcessing(true);
 logger.log("중도 해지 처리 시작...");

 // 선생님 계정 조회 (저장된 teacherId 사용 또는 새로 조회)
 const teacherId = product.teacherId;
 let teacherAccountId = teacherId;
 if (!teacherAccountId) {
 const teacherAccount = await getTeacherAccount(userDoc?.classCode);
 if (!teacherAccount) {
 displayMessage("선생님(은행) 계정을 찾을 수 없습니다.", "error");
 setIsProcessing(false);
 return;
 }
 teacherAccountId = teacherAccount.id;
 }
 logger.log("선생님 계정 ID:", teacherAccountId);

 // --- 낙관적 업데이트 (Optimistic Update) ---
 const originalProducts = {
 deposit: [...userDeposits],
 savings: [...userSavings],
 loan: [...userLoans],
 };
 const originalCash = currentCash;

 const cashChangeAmount = isLoan ? -loanTotalRepay : refundAmount;
 setCurrentCash((prev) => prev + cashChangeAmount);

 if (type === "deposit") {
 setUserDeposits((prev) => prev.filter((p) => p.id !== id));
 } else if (type === "savings") {
 setUserSavings((prev) => prev.filter((p) => p.id !== id));
 } else if (type === "loan") {
 setUserLoans((prev) => prev.filter((p) => p.id !== id));
 }

 try {
 const productRef = doc(db, "users", userId, "products", String(id));
 logger.log("Firestore 문서 참조:", productRef.path);

 await runTransaction(db, async (transaction) => {
 logger.log("트랜잭션 시작");
 const userRef = doc(db, "users", userId);
 const teacherRef = doc(db, "users", teacherAccountId);

 const userSnapshot = await transaction.get(userRef);
 const teacherSnapshot = await transaction.get(teacherRef);

 if (!userSnapshot.exists())
 throw new Error("사용자 정보를 찾을 수 없습니다.");
 if (!teacherSnapshot.exists())
 throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");

 const currentCashInDb = userSnapshot.data()?.cash ?? 0;
 const teacherCashInDb = teacherSnapshot.data()?.cash ?? 0;
 logger.log(
 `현재 보유 현금 (DB): ${currentCashInDb}, 선생님 보유 현금: ${teacherCashInDb}`,
 );

 if (isLoan) {
 // 대출 일시 상환: 학생 → 선생님 (원금 + 경과 이자)
 if (currentCashInDb < loanTotalRepay) {
 throw new Error(
 `대출금을 상환하기에 현금이 부족합니다. (필요: ${formatCurrency(loanTotalRepay)}${currencyUnit} = 원금 ${formatCurrency(balance)} + 이자 ${formatCurrency(loanAccruedInterest)})`
 );
 }
 transaction.update(userRef, { cash: increment(-loanTotalRepay) });
 transaction.update(teacherRef, { cash: increment(loanTotalRepay) });
 logger.log(`대출 일시 상환: 학생 -${loanTotalRepay} (원금 ${balance} + 이자 ${loanAccruedInterest}, ${loanElapsedDays}일 경과)`);
 } else {
 // 예금/적금 중도 해지: 선생님 → 학생 (납입 원금만, 이자 없음, 마이너스 허용)
 if (teacherCashInDb < refundAmount) {
 logger.log(`[은행] 중도 해지 - 선생님 잔액 부족하지만 진행 (필요: ${refundAmount}, 보유: ${teacherCashInDb})`);
 }
 transaction.update(userRef, { cash: increment(refundAmount) });
 transaction.update(teacherRef, { cash: increment(-refundAmount) });
 logger.log(`중도 해지: 학생 +${refundAmount}, 선생님 -${refundAmount}`);
 }

 transaction.delete(productRef);
 logger.log("상품 문서 삭제 예약");
 logger.log("트랜잭션 커밋 시도");
 });

 logger.log("트랜잭션 성공");

 const successMsg = isLoan
 ? `대출 상환 완료: 원금 ${formatCurrency(balance)} + 이자 ${formatCurrency(loanAccruedInterest)} = 총 ${formatCurrency(loanTotalRepay)}${currencyUnit} (${loanElapsedDays}일 경과)`
 : `중도 해지 완료: 원금 ${formatCurrency(balance)}${currencyUnit} 반환 (선생님 계정에서 지급)`;
 displayMessage(successMsg, "success");

 // 🔥 활동 로그 기록 (중도 해지 / 대출 상환)
 const activityType = isLoan
 ? ACTIVITY_TYPES.LOAN_REPAY
 : ACTIVITY_TYPES.DEPOSIT_WITHDRAW;
 logActivity(db, {
 classCode: userDoc?.classCode,
 userId: userId,
 userName: userDoc?.name || "사용자",
 type: activityType,
 description: isLoan
 ? `대출 일시 상환: ${name} (원금 ${formatCurrency(balance)} + 이자 ${formatCurrency(loanAccruedInterest)} = ${formatCurrency(loanTotalRepay)}원, ${loanElapsedDays}일 경과)`
 : `중도 해지: ${name} (원금 ${formatCurrency(balance)}원) - 선생님 계정에서`,
 amount: cashChangeAmount,
 metadata: {
 productName: name,
 productType: type,
 principal: balance,
 ...(isLoan && {
 accruedInterest: loanAccruedInterest,
 totalRepaid: loanTotalRepay,
 elapsedDays: loanElapsedDays,
 }),
 isEarlyCancellation: true,
 teacherId: teacherAccountId,
 },
 });

 // 백그라운드에서 userDoc 갱신
 if (refreshUserDocument) {
 logger.log("userDoc 갱신 시작");
 refreshUserDocument();
 }
 await loadAllData();
 } catch (error) {
 logger.error("중도 해지 처리 중 오류 발생:", error);
 displayMessage(`처리 오류: ${error.message}`, "error");

 // --- 낙관적 업데이트 롤백 ---
 setUserDeposits(originalProducts.deposit);
 setUserSavings(originalProducts.savings);
 setUserLoans(originalProducts.loan);
 setCurrentCash(originalCash);
 } finally {
 setIsProcessing(false);
 logger.log("--- handleCancelEarly 종료 ---");
 }
 };

 const handleParkingDeposit = async (amountStr) => {
 const amount = parseFloat(amountStr);
 if (isNaN(amount) || amount <= 0)
 return displayMessage("유효한 금액을 입력하세요.", "error");

 setIsProcessing(true);
 const previousParkingBalance = parkingBalance; // Store for rollback
 const previousCurrentCash = currentCash; // Store for rollback

 // Optimistically update UI for parking balance
 setParkingBalance((prev) => prev + amount);

 try {
 // 🔥 사용자 현금 차감 + 파킹통장 증가를 하나의 트랜잭션으로 처리 (돈 증발 방지)
 await runTransaction(db, async (transaction) => {
 const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
 const userRef = doc(db, "users", userId);
 const userSnapshot = await transaction.get(userRef);
 const parkingSnapshot = await transaction.get(parkingRef);

 const currentUserCash = userSnapshot.data()?.cash ?? 0;
 if (currentUserCash < amount) {
 throw new Error("보유 현금이 부족합니다.");
 }

 transaction.update(userRef, { cash: increment(-amount), updatedAt: serverTimestamp() });

 if (parkingSnapshot.exists()) {
 transaction.update(parkingRef, { balance: increment(amount) });
 } else {
 transaction.set(parkingRef, {
 balance: amount,
 lastInterestDate: serverTimestamp(),
 });
 }
 });

 displayMessage(
 `${formatCurrency(amount)}${currencyUnit} 입금 완료.`,
 "success",
 );

 // 🔥 활동 로그 기록 (파킹통장 입금)
 logActivity(db, {
 classCode: userDoc?.classCode,
 userId: userId,
 userName: userDoc?.name || "사용자",
 type: ACTIVITY_TYPES.PARKING_DEPOSIT,
 description: `파킹통장 입금 ${formatCurrency(amount)}원`,
 amount: -amount,
 metadata: { parkingBalance: parkingBalance + amount },
 });

 await loadAllData(); // Reconcile parkingBalance and other products
 } catch (error) {
 displayMessage(`처리 오류: ${error.message}`, "error");
 // Rollback UI on error
 setParkingBalance(previousParkingBalance);
 setCurrentCash(previousCurrentCash);
 } finally {
 setIsProcessing(false);
 }
 };

 const handleParkingWithdraw = async (amountStr) => {
 const amount = parseFloat(amountStr);
 if (isNaN(amount) || amount <= 0)
 return displayMessage("유효한 금액을 입력하세요.", "error");

 setIsProcessing(true);
 const previousParkingBalance = parkingBalance; // Store for rollback
 const previousCurrentCash = currentCash; // Store for rollback

 // Optimistically update UI for parking balance
 setParkingBalance((prev) => prev - amount);

 try {
 // 🔥 파킹통장 차감 + 사용자 현금 증가를 하나의 트랜잭션으로 처리 (돈 증발 방지)
 await runTransaction(db, async (transaction) => {
 const parkingRef = doc(db, "users", userId, "financials", "parkingAccount");
 const userRef = doc(db, "users", userId);
 const parkingSnapshot = await transaction.get(parkingRef);
 const userSnapshot = await transaction.get(userRef);
 const currentParkingBalance = parkingSnapshot.data()?.balance ?? 0;

 if (currentParkingBalance < amount)
 throw new Error("파킹통장 잔액이 부족합니다.");

 transaction.update(parkingRef, { balance: increment(-amount) });
 transaction.update(userRef, { cash: increment(amount), updatedAt: serverTimestamp() });
 });

 displayMessage(
 `${formatCurrency(amount)}${currencyUnit} 출금 완료.`,
 "success",
 );

 // 🔥 활동 로그 기록 (파킹통장 출금)
 logActivity(db, {
 classCode: userDoc?.classCode,
 userId: userId,
 userName: userDoc?.name || "사용자",
 type: ACTIVITY_TYPES.PARKING_WITHDRAW,
 description: `파킹통장 출금 ${formatCurrency(amount)}원`,
 amount: amount,
 metadata: { parkingBalance: parkingBalance - amount },
 });

 await loadAllData(); // Reconcile parkingBalance and other products
 } catch (error) {
 displayMessage(`처리 오류: ${error.message}`, "error");
 // Rollback UI on error
 setParkingBalance(previousParkingBalance);
 setCurrentCash(previousCurrentCash);
 } finally {
 setIsProcessing(false);
 }
 };

 const handleAdminDeleteSubscribedProduct = async (product) => {
 if (!isAdmin()) {
 displayMessage("관리자 권한이 필요합니다.", "error");
 return;
 }

 if (
 !window.confirm(
 `정말로 이 상품(${product.name})을 강제로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
 )
 ) {
 return;
 }

 setIsProcessing(true);
 try {
 const productRef = doc(
 db,
 "users",
 product.userId,
 "products",
 product.id,
 );
 await deleteDoc(productRef);
 displayMessage("상품이 강제로 삭제되었습니다.", "success");
 loadAllData();
 } catch (error) {
 logger.error("관리자 상품 삭제 중 오류:", error);
 displayMessage(`삭제 처리 오류: ${error.message}`, "error");
 } finally {
 setIsProcessing(false);
 }
 };

 if (loading)
 return (
 <div className={cls.container}>금융 정보를 불러오는 중입니다...</div>
 );
 if (!user) return <div className={cls.container}>로그인이 필요합니다.</div>;

 const mainTabClass = (isActive) =>
 `px-6 py-3 border-none cursor-pointer text-base rounded-t-lg transition-all duration-200 -mb-0.5 ${
 isActive
 ? "bg-indigo-50 font-bold text-indigo-600 border-b-[3px] border-b-indigo-500"
 : "font-medium text-slate-400 border-b-[3px] border-b-transparent hover:text-slate-600"
 }`;

 return (
 <div className={cls.container}>
 {/* 탭 메뉴 */}
 <div className="flex gap-2.5 mb-6 border-b-2 border-slate-200 relative">
 <button
 onClick={() => onViewChange && onViewChange("parking")}
 className={mainTabClass(activeView === "parking")}
 >
 나의 금융 현황
 </button>
 {isAdmin && isAdmin() && (
 <>
 <button
 onClick={async () => {
 if (!window.confirm("파킹통장 입출금 기록을 검사하여 증발된 돈을 복구합니다. 진행하시겠습니까?")) return;
 setIsProcessing(true);
 displayMessage("복구 스캔 중...", "info");
 try {
 const classCode = userDoc?.classCode;
 if (!classCode) throw new Error("학급코드 없음");
 const usersSnap = await getDocs(query(collection(db, "users"), where("classCode", "==", classCode)));
 let fixedCount = 0;
 let totalRecovered = 0;
 for (const uDoc of usersSnap.docs) {
 if (uDoc.data().isAdmin) continue;
 const uid = uDoc.id;
 // 트랜잭션 기록에서 파킹통장 관련 조회
 const txSnap = await getDocs(collection(db, "users", uid, "transactions"));
 let deposits = 0, withdraws = 0;
 txSnap.docs.forEach(d => {
 const desc = d.data().description || "";
 const amt = d.data().amount || 0;
 if (desc.includes("파킹통장 입금")) deposits += Math.abs(amt);
 if (desc.includes("파킹통장 출금")) withdraws += Math.abs(amt);
 });
 if (deposits === 0 && withdraws === 0) continue;
 // 현재 파킹 잔액
 const pDoc = await getDoc(doc(db, "users", uid, "financials", "parkingAccount"));
 const pBal = pDoc.exists() ? (pDoc.data().balance || 0) : 0;
 // 예상 파킹 잔액 (이자 제외)
 const expected = deposits - withdraws;
 // 차이 = 파킹에서 빠졌는데 cash에 안 들어간 금액
 // expected < pBal: 이자 때문에 정상 (파킹이 더 큼)
 // expected > pBal: 입금됐는데 파킹에 안 들어간 것 → cash 복구
 if (expected > pBal + 1000) { // 이자 오차 허용
 const lostAmount = expected - pBal;
 await updateDoc(doc(db, "users", uid), { cash: increment(lostAmount) });
 fixedCount++;
 totalRecovered += lostAmount;
 console.log(`[복구] ${uDoc.data().name}: +${lostAmount.toLocaleString()}원`);
 }
 }
 displayMessage(fixedCount > 0
 ? `복구 완료! ${fixedCount}명에게 총 ${totalRecovered.toLocaleString()}원 복구`
 : "증발된 돈이 감지되지 않았습니다.", fixedCount > 0 ? "success" : "info");
 } catch (e) {
 displayMessage("복구 오류: " + e.message, "error");
 } finally {
 setIsProcessing(false);
 }
 }}
 className={mainTabClass(false)}
 disabled={isProcessing}
 style={{ fontSize: '0.8rem' }}
 >
 🔧 파킹 복구
 </button>
 <button
 onClick={() => onViewChange && onViewChange("admin")}
 className={mainTabClass(activeView === "admin")}
 >
 상품 관리
 </button>
 <button
 onClick={() => {
 if (onViewChange) onViewChange("userProducts");
 if (onLoadUserProducts) onLoadUserProducts();
 }}
 className={mainTabClass(activeView === "userProducts")}
 >
 유저 상품 조회
 </button>
 </>
 )}
 </div>

 {message && <div className={cls.message(messageType)}>{message}</div>}

 {/* 유저 상품 조회 화면 */}
 {activeView === "userProducts" && isAdmin && isAdmin() && (
 <div className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(99,102,241,0.08)] border border-[#e0e7ff]">
 <h2 className="text-2xl font-bold mb-4 text-slate-800">
 유저별 가입 상품 조회 및 관리
 </h2>
 <p className="text-sm text-slate-400 mb-5">
 클래스 내 모든 유저의 가입 상품을 조회하고 필요시 강제 삭제할 수
 있습니다.
 </p>

 {allUserProducts.length === 0 ? (
 <p className="text-center p-10 text-slate-400">
 가입된 상품이 없습니다.
 </p>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full border-collapse">
 <thead>
 <tr className="bg-white/5 border-b-2 border-slate-200">
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 사용자
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 상품명
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 종류
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 잔액/금액
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 금리(일)
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 기간(일)
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 만기일
 </th>
 <th className="p-3 text-left text-sm font-semibold text-slate-400">
 관리
 </th>
 </tr>
 </thead>
 <tbody>
 {allUserProducts.map((product, index) => {
 const typeLabel =
 product.type === "deposit"
 ? "예금"
 : product.type === "savings"
 ? "적금"
 : product.type === "loan"
 ? "대출"
 : "기타";
 return (
 <tr
 key={`${product.userId}-${product.id}-${index}`}
 className="border-b border-slate-100"
 >
 <td className="p-3 text-sm text-slate-700">
 {product.userName}
 </td>
 <td className="p-3 text-sm text-slate-700">
 {product.name}
 </td>
 <td className="p-3 text-sm text-slate-700">
 {typeLabel}
 </td>
 <td className="p-3 text-sm text-indigo-600">
 {formatKoreanCurrency(product.balance || 0)}
 </td>
 <td className="p-3 text-sm text-slate-700">
 {product.rate}%
 </td>
 <td className="p-3 text-sm text-slate-700">
 {product.termInDays}일
 </td>
 <td className="p-3 text-sm text-slate-700">
 {product.maturityDate
 ? new Date(product.maturityDate).toLocaleDateString(
 "ko-KR",
 )
 : "-"}
 </td>
 <td className="p-3">
 <button
 onClick={() =>
 onDeleteUserProduct &&
 onDeleteUserProduct(product)
 }
 className={
 cls.button(false, "danger") +
 " text-xs px-3 py-1.5"
 }
 >
 삭제
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 <div className="mt-5 text-right text-slate-400 text-sm">
 총 {allUserProducts.length}개의 상품
 </div>
 </div>
 )}
 </div>
 )}

 {/* 기존 금융 현황 화면 */}
 {activeView === "parking" && (
 <div className={cls.grid}>
 <ParkingAccountSection
 balance={parkingBalance}
 dailyInterest={parkingDailyInterest}
 onDeposit={handleParkingDeposit}
 onWithdraw={handleParkingWithdraw}
 isProcessing={isProcessing}
 userCash={currentCash}
 parkingRate={parkingRate}
 />
 <ProductSection
 title="예금"
 icon={ICON_MAP.deposits}
 sectionStyle={{ background: 'linear-gradient(to bottom right, #d1fae5, #ccfbf1)', border: '1px solid #6ee7b7', boxShadow: '0 4px 16px rgba(16,185,129,0.12)' }}
 subscribedProducts={userDeposits}
 availableProducts={depositProducts}
 onSubscribe={(p) => handleOpenModal(p, "deposits")}
 onCancel={handleCancelEarly}
 onMaturity={handleMaturity}
 isAdmin={isAdmin()}
 onAdminDelete={handleAdminDeleteSubscribedProduct}
 />
 <ProductSection
 title="적금"
 icon={ICON_MAP.savings}
 sectionStyle={{ background: 'linear-gradient(to bottom right, #ede9fe, #f3e8ff)', border: '1px solid #c4b5fd', boxShadow: '0 4px 16px rgba(139,92,246,0.12)' }}
 subscribedProducts={userSavings}
 availableProducts={installmentProducts}
 onSubscribe={(p) => handleOpenModal(p, "savings")}
 onCancel={handleCancelEarly}
 onMaturity={handleMaturity}
 isAdmin={isAdmin()}
 onAdminDelete={handleAdminDeleteSubscribedProduct}
 />
 <ProductSection
 title="대출"
 icon={ICON_MAP.loans}
 sectionStyle={{ background: 'linear-gradient(to bottom right, #fee2e2, #ffe4e6)', border: '1px solid #fca5a5', boxShadow: '0 4px 16px rgba(239,68,68,0.12)' }}
 subscribedProducts={userLoans}
 availableProducts={loanProducts}
 onSubscribe={(p) => {
 const hasActiveLoan = (userLoans || []).some(
 (l) => !l.isOptimistic && Number(l.balance) > 0,
 );
 if (hasActiveLoan) {
 return displayMessage(
 "이미 미상환 대출이 있습니다. 기존 대출을 먼저 갚아주세요.",
 "error",
 );
 }
 handleOpenModal(p, "loans");
 }}
 onCancel={handleCancelEarly}
 onMaturity={handleMaturity}
 onLoanRepay={handleOpenLoanRepayModal}
 isAdmin={isAdmin()}
 onAdminDelete={handleAdminDeleteSubscribedProduct}
 />
 </div>
 )}
 <SubscriptionModal
 isOpen={modal.isOpen}
 onClose={handleCloseModal}
 product={modal.product}
 productType={modal.type}
 onConfirm={handleSubscribe}
 isProcessing={isProcessing}
 />
 <LoanRepaymentModal
 isOpen={loanRepayModal.isOpen}
 onClose={handleCloseLoanRepayModal}
 product={loanRepayModal.product}
 repayMode={loanRepayModal.repayMode}
 onConfirmLumpSum={handleLoanLumpSumRepay}
 onConfirmInstallment={handleLoanInstallmentRepay}
 isProcessing={isProcessing}
 />
 </div>
 );
};

export default ParkingAccount;
