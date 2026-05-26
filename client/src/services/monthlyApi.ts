import api from './api';
import type { MonthlyTrade, MonthlyListing, MonthlyMatch, Transaction, Constraints } from '../types';

export const monthlyApi = {
  list: () => api.get<MonthlyTrade[]>('/monthly'),

  getDetail: (id: string) => api.get<MonthlyTrade>(`/monthly/${id}`),

  create: (data: { name: string; annualTradeId: string }) =>
    api.post<MonthlyTrade>('/monthly', data),

  start: (id: string) => api.post<MonthlyTrade>(`/monthly/${id}/start`),

  nextPhase: (id: string) => api.post<MonthlyTrade>(`/monthly/${id}/next-phase`),

  getListings: (id: string) =>
    api.get<MonthlyListing[]>(`/monthly/${id}/listings`),

  createListing: (id: string, data: { side: string; period: string; volumeMW: number; price: number }) =>
    api.post<MonthlyListing>(`/monthly/${id}/listings`, data),

  modifyListing: (tradeId: string, listingId: string, data: { price?: number; volumeMW?: number }) =>
    api.put<MonthlyListing>(`/monthly/${tradeId}/listings/${listingId}`, data),

  cancelListing: (tradeId: string, listingId: string) =>
    api.delete(`/monthly/${tradeId}/listings/${listingId}`),

  takeListing: (tradeId: string, listingId: string, volume: number) =>
    api.post(`/monthly/${tradeId}/listings/${listingId}/take`, { volume }),

  getMatches: (id: string) =>
    api.get<MonthlyMatch[]>(`/monthly/${id}/matches`),

  getTransactions: (id: string) =>
    api.get<Transaction[]>(`/monthly/${id}/transactions`),

  getConstraints: (id: string) =>
    api.get<Constraints>(`/monthly/${id}/constraints`),

  getCurves: (id: string) => api.get<Record<string, { pricePoints: [string, number][]; volumePoints: [string, number][] }>>(`/monthly/${id}/curves`),

  delete: (id: string) => api.delete(`/monthly/${id}`),
};
