import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import AppLayout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import AnnualListPage from './pages/annual/AnnualListPage';
import AnnualDetailPage from './pages/annual/AnnualDetailPage';
import CompaniesPage from './pages/CompaniesPage';
import MonthlyListPage from './pages/monthly/MonthlyListPage';
import MonthlyTradingPage from './pages/monthly/MonthlyTradingPage';

export default function App() {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="annual" element={<AnnualListPage />} />
            <Route path="annual/:id" element={<AnnualDetailPage />} />
            <Route path="monthly" element={<MonthlyListPage />} />
            <Route path="monthly/:id" element={<MonthlyTradingPage />} />
            <Route path="companies" element={<CompaniesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
