export type UserRole = 'GENERATOR' | 'SELLER' | 'EXCHANGE';
export type AnnualStatus = 'PENDING' | 'OPEN' | 'CLOSED' | 'CLEARED';
export type MonthlyStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';
export type TradePhase = 'MATCHING' | 'NEGOTIATION' | 'CLOSED';
export type Side = 'BUY' | 'SELL';
export type Period = 'PEAK' | 'FLAT' | 'VALLEY';
export type ListingStatus = 'ACTIVE' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface GeneratorUnit {
  id?: string;
  type: string;
  capacityMW: number;
  marginalCost: number;
}

export interface GeneratorProfile {
  id: string;
  userId: string;
  companyName: string;
  units: GeneratorUnit[];
  user?: { username: string; id: string };
}

export interface SellerProfile {
  id: string;
  userId: string;
  companyName: string;
  loadMW: number;
  user?: { username: string; id: string };
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  generatorProfile?: GeneratorProfile;
  sellerProfile?: SellerProfile;
}

export interface BidSegment {
  volume: number;
  price: number;
}

export interface AnnualTrade {
  id: string;
  name: string;
  exchangeId: string;
  status: AnnualStatus;
  deadlineAt: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  bids?: AnnualBid[];
}

export interface AnnualBid {
  id: string;
  tradeId: string;
  userId: string;
  segments: string;
  submittedAt: string;
  user?: User;
}

export interface AnnualClearingResult {
  id: string;
  annualTradeId: string;
  userId: string;
  clearedVolume: number;
  clearingPrice: number;
}

export interface ClearingResponse {
  clearingPrice: number;
  clearingVolume: number;
  supplyCurve: { cumVolume: number; price: number; companyName: string; volume: number }[];
  demandCurve: { cumVolume: number; price: number; companyName: string; volume: number }[];
  genResults: {
    userId: string;
    companyName: string;
    price: number;
    declaredVol: number;
    clearedVol: number;
    revenue: number;
  }[];
  selResults: {
    userId: string;
    companyName: string;
    price: number;
    declaredVol: number;
    clearedVol: number;
    payment: number;
  }[];
}

export interface MonthlyTrade {
  id: string;
  name: string;
  exchangeId: string;
  annualTradeId: string;
  status: MonthlyStatus;
  phase: TradePhase;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface MonthlyListing {
  id: string;
  tradeId: string;
  userId: string;
  side: Side;
  period: Period;
  volumeMW: number;
  remainingMW: number;
  price: number;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  user?: { username: string; id: string };
}

export interface MonthlyMatch {
  id: string;
  tradeId: string;
  period: Period;
  bidListingId: string;
  askListingId: string;
  buyerId: string;
  sellerId: string;
  volumeMW: number;
  price: number;
  matchedAt: string;
}

export interface Transaction {
  id: string;
  tradeId: string;
  listingId: string;
  takerId: string;
  volumeMW: number;
  price: number;
  createdAt: string;
}

export interface Constraints {
  maxBuyVolume: number;
  maxSellVolume: number;
  usedBuyVolume: number;
  usedSellVolume: number;
}
