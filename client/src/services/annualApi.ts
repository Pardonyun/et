import api from './api';
import type { AnnualTrade, AnnualBid, ClearingResponse } from '../types';

export const annualApi = {
  list: (status?: string) =>
    api.get<AnnualTrade[]>('/annual', { params: status ? { status } : {} }),

  getDetail: (id: string) =>
    api.get<AnnualTrade>(`/annual/${id}`),

  create: (data: { name: string; deadlineAt: string }) =>
    api.post<AnnualTrade>('/annual', data),

  start: (id: string) =>
    api.post<AnnualTrade>(`/annual/${id}/start`),

  close: (id: string) =>
    api.post<{ trade: AnnualTrade; clearing: ClearingResponse }>(`/annual/${id}/close`),

  getMyBid: (id: string) =>
    api.get<AnnualBid | null>(`/annual/${id}/my-bid`),

  submitBid: (id: string, segments: { volume: number; price: number }[]) =>
    api.post<AnnualBid>(`/annual/${id}/bid`, { segments }),

  submitSegment: (id: string, index: number, volume: number, price: number) =>
    api.post<AnnualBid>(`/annual/${id}/bid/segment`, { index, volume, price }),

  cancelSegment: (id: string, index: number) =>
    api.delete(`/annual/${id}/bid/segment/${index}`),

  getClearing: (id: string) =>
    api.get<ClearingResponse>(`/annual/${id}/clearing`),

  delete: (id: string) => api.delete(`/annual/${id}`),
};
