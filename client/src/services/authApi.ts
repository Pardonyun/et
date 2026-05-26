import api from './api';
import type { User, GeneratorProfile, SellerProfile, GeneratorUnit } from '../types';

export interface RegisterData {
  username: string;
  role: string;
  companyName?: string;
  loadMW?: number;
  units?: Omit<GeneratorUnit, 'id'>[];
}

export const authApi = {
  register: (data: RegisterData) =>
    api.post<{ userId: string; username: string; role: string }>('/auth/register', data),

  login: (username: string) =>
    api.post<User>('/auth/login', { username }),

  getMe: () => api.get<User>('/auth/me'),

  updateProfile: (data: {
    companyName?: string;
    loadMW?: number;
    units?: GeneratorUnit[];
  }) => api.put('/auth/profile', data),

  getCompanies: (role: string) =>
    api.get<(GeneratorProfile | SellerProfile)[]>('/auth/companies', { params: { role } }),

  deleteUser: (userId: string) => api.delete(`/auth/user/${userId}`),
};
