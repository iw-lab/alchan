// src/types/index.ts
// 전체 프로젝트 공통 타입 정의

import { Timestamp } from 'firebase/firestore';

// ==================== User 관련 ====================
export interface User {
  id: string;
  uid: string;
  email: string;
  name: string;
  classCode: string;
  isAdmin: boolean;
  cash: number;
  savings: number;
  seatNumber?: number;
  profileImage?: string;
  selectedJobIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  lastActiveAt?: Timestamp;
}

export interface UserDocument extends Omit<User, 'id'> {}

// ==================== Item 관련 ====================
export interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  category: ItemCategory;
  quantity: number;
  classCode: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ItemCategory =
  | 'food'
  | 'stationery'
  | 'privilege'
  | 'decoration'
  | 'special'
  | 'other';

export interface InventoryItem extends Item {
  purchasedAt: Timestamp;
  source: 'store' | 'auction' | 'gift' | 'reward';
}

// ==================== Job 관련 ====================
export interface Job {
  id: string;
  title: string;
  description: string;
  weeklySalary: number;
  maxSlots: number;
  currentSlots: number;
  classCode: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==================== Auction 관련 ====================
export interface Auction {
  id: string;
  name: string;
  description: string;
  itemIcon: string;
  startPrice: number;
  currentBid: number;
  bidCount: number;
  seller: string;
  sellerName: string;
  highestBidder: string | null;
  highestBidderName: string | null;
  endTime: Timestamp;
  status: AuctionStatus;
  assetId: string;
  assetType: 'item';
  originalStoreItemId?: string;
  classCode: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AuctionStatus = 'ongoing' | 'completed' | 'cancelled' | 'error';

// ==================== Transaction 관련 ====================
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  senderId?: string;
  senderName?: string;
  receiverId?: string;
  receiverName?: string;
  description: string;
  classCode: string;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
}

export type TransactionType =
  | 'transfer'
  | 'purchase'
  | 'sale'
  | 'salary'
  | 'tax'
  | 'reward'
  | 'deposit'
  | 'withdrawal'
  | 'stock_buy'
  | 'stock_sell'
  | 'auction_bid'
  | 'auction_win'
  | 'real_estate';

// ==================== Stock 관련 ====================
export interface Stock {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  description?: string;
  classCode: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockHolding {
  stockId: string;
  stockName: string;
  stockSymbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
}

// ==================== Real Estate 관련 ====================
export interface RealEstate {
  id: string;
  name: string;
  description: string;
  location: string;
  price: number;
  monthlyRent: number;
  ownerId: string | null;
  ownerName: string | null;
  classCode: string;
  propertyType: PropertyType;
  isForSale: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PropertyType = 'house' | 'apartment' | 'land' | 'commercial' | 'other';

// ==================== Banking 관련 ====================
export interface BankProduct {
  id: string;
  name: string;
  type: BankProductType;
  interestRate: number;
  minAmount: number;
  maxAmount: number;
  termDays: number;
  description: string;
  classCode: string;
  isActive: boolean;
}

export type BankProductType = 'savings' | 'deposit' | 'loan';

// ==================== Tax/Salary 관련 ====================
export interface TaxSettings {
  stockTransactionTaxRate: number;
  realEstateTransactionTaxRate: number;
  itemStoreVATRate: number;
  auctionTransactionTaxRate: number;
  incomeTaxRate: number;
  transactionTaxRate: number;
  salaryTaxRate: number;
}

export interface SalarySettings {
  taxRate: number;
  weeklySalaryIncreaseRate: number;
  lastPaidDate: Timestamp | null;
}

export interface SalaryResult {
  success: boolean;
  message: string;
  paidCount: number;
  totalPaid: number;
}

// ==================== API Response 타입 ====================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== Form/UI State 타입 ====================
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isValid: boolean;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  duration?: number;
}

// ==================== Utility 타입 ====================
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'createdAt'>>;
