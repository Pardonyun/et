export type UserRole = 'GENERATOR' | 'SELLER' | 'EXCHANGE';
export type AnnualStatus = 'PENDING' | 'OPEN' | 'CLOSED' | 'CLEARED';
export type MonthlyStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';
export type TradePhase = 'PRE_LISTING' | 'MATCHING' | 'NEGOTIATION' | 'CLOSED';
export type Side = 'BUY' | 'SELL';
export type Period = 'PEAK' | 'FLAT' | 'VALLEY';
export type ListingStatus = 'ACTIVE' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface BidSegment {
  volume: number;
  price: number;
}

export interface ClearingPoint {
  cumVolume: number;
  price: number;
  userId: string;
}

export interface ClearingResult {
  clearingPrice: number;
  clearingVolume: number;
  supplyCurve: { cumVolume: number; price: number }[];
  demandCurve: { cumVolume: number; price: number }[];
  results: {
    userId: string;
    companyName: string;
    role: string;
    clearedVolume: number;
    clearingPrice: number;
  }[];
}

export interface Constraints {
  maxBuyVolume: number;
  maxSellVolume: number;
  usedBuyVolume: number;
  usedSellVolume: number;
}
