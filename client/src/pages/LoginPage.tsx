import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Button, Typography, message, Space } from 'antd';
import { ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import { authApi } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) {
      message.warning('请输入账号');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(username.trim());
      setUser(res.data);
      message.success('欢迎回来');
      navigate('/dashboard');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #E6F0FA 0%, #D6E8FA 50%, #C5D9F5 100%)',
      }}
    >
      <Card
        style={{ width: 400, boxShadow: '0 4px 24px rgba(74, 144, 217, 0.15)', borderRadius: 12 }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: '#4A90D9', marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4, color: '#1A3359' }}>
            电力中长期交易系统
          </Title>
          <Text type="secondary">请输入账号登录</Text>
        </div>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            size="large"
            placeholder="请输入账号"
            prefix={<UserOutlined />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onPressEnter={handleLogin}
            autoFocus
          />
          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={handleLogin}
            style={{ height: 44 }}
          >
            登录
          </Button>
          <Button
            type="link"
            block
            onClick={() => navigate('/register')}
          >
            还没有账号？立即注册
          </Button>
        </Space>
      </Card>
    </div>
  );
}
