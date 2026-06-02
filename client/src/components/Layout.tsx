import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, Typography } from 'antd';
import {
  DashboardOutlined,
  CalendarOutlined,
  CalendarOutlined as MonthOutlined,
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

const roleNames: Record<string, string> = {
  GENERATOR: '发电公司',
  SELLER: '售电公司',
  EXCHANGE: '电力交易所',
};

const roleColors: Record<string, string> = {
  GENERATOR: '#52C41A',
  SELLER: '#FAAD14',
  EXCHANGE: '#4A90D9',
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isExchange = user.role === 'EXCHANGE';
  const isGenerator = user.role === 'GENERATOR';
  const isSeller = user.role === 'SELLER';

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
    { key: '/annual', icon: <CalendarOutlined />, label: '年度集中竞价' },
    { key: '/monthly', icon: <MonthOutlined />, label: '月度滚动撮合' },
    ...(isGenerator || isSeller
      ? [{ key: '/profile', icon: <SettingOutlined />, label: '公司信息' }]
      : []),
    ...(isExchange
      ? [{ key: '/companies', icon: <TeamOutlined />, label: '市场成员' }]
      : []),
  ];

  const handleMenuClick = (key: string) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid #D6E8FA',
          zIndex: 10,
        }}
      >
        <Text strong style={{ fontSize: 18, color: '#1A3359', letterSpacing: 2 }}>
          电力中长期交易系统
        </Text>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              size={36}
              style={{ backgroundColor: roleColors[user.role], flexShrink: 0 }}
              icon={<UserOutlined />}
            />
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#1A3359',
                lineHeight: 1.3,
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.generatorProfile?.companyName ||
                  user.sellerProfile?.companyName ||
                  user.username}
              </div>
              <div style={{
                fontSize: 12,
                color: roleColors[user.role],
                fontWeight: 500,
              }}>
                {roleNames[user.role]}
              </div>
            </div>
          </div>
        </Dropdown>
      </Header>
      <AntLayout>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          style={{ borderRight: '1px solid #E6F0FA' }}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}` : location.pathname]}
            items={menuItems}
            onClick={({ key }) => handleMenuClick(key)}
            style={{ marginTop: 8, borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#F0F5FF', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
