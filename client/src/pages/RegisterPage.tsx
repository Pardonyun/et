import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Button, Typography, Select, Form, Divider, Space, InputNumber, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { authApi } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;

const generationTypes = ['水电', '火电', '风电', '光伏', '核电'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [role, setRole] = useState<string>('GENERATOR');
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loadMW, setLoadMW] = useState<number>(0);
  const [units, setUnits] = useState([{ type: '水电', capacityMW: 0, marginalCost: 0 }]);
  const [loading, setLoading] = useState(false);

  const addUnit = () => {
    setUnits([...units, { type: '火电', capacityMW: 0, marginalCost: 0 }]);
  };

  const removeUnit = (idx: number) => {
    if (units.length > 1) {
      setUnits(units.filter((_, i) => i !== idx));
    }
  };

  const updateUnit = (idx: number, field: string, value: any) => {
    const newUnits = [...units];
    (newUnits[idx] as any)[field] = value;
    setUnits(newUnits);
  };

  const handleRegister = async () => {
    if (!username.trim()) { message.warning('请设置账号'); return; }
    if (role !== 'EXCHANGE' && !companyName.trim()) { message.warning('请填写公司名称'); return; }

    setLoading(true);
    try {
      const data: any = { username: username.trim(), role };
      if (role === 'GENERATOR') {
        data.companyName = companyName.trim();
        data.units = units.map(u => ({ ...u, capacityMW: Number(u.capacityMW), marginalCost: Number(u.marginalCost) }));
      } else if (role === 'SELLER') {
        data.companyName = companyName.trim();
        data.loadMW = Number(loadMW);
      }

      const res = await authApi.register(data);
      setUser(res.data as any);
      message.success('注册成功');
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
        padding: 24,
      }}
    >
      <Card
        style={{ width: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 4px 24px rgba(74, 144, 217, 0.15)', borderRadius: 12 }}
        bodyStyle={{ padding: '32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <ThunderboltOutlined style={{ fontSize: 40, color: '#4A90D9', marginBottom: 12 }} />
          <Title level={3} style={{ color: '#1A3359' }}>注册新账号</Title>
        </div>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>选择身份</Text>
            <Select
              value={role}
              onChange={setRole}
              style={{ width: '100%' }}
              size="large"
              options={[
                { value: 'GENERATOR', label: '发电公司（卖电方）' },
                { value: 'SELLER', label: '售电公司（买电方）' },
                { value: 'EXCHANGE', label: '电力交易所（管理方）' },
              ]}
            />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>自定义账号</Text>
            <Input
              size="large"
              placeholder="输入账号名（不限格式，仅凭账号登录）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {role !== 'EXCHANGE' && (
            <>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>公司名称</Text>
                <Input
                  size="large"
                  placeholder="输入公司名称"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              {role === 'GENERATOR' && (
                <>
                  <Divider>发电机组信息</Divider>
                  {units.map((unit, idx) => (
                    <Card
                      key={idx}
                      size="small"
                      style={{ background: '#FAFCFF' }}
                      extra={
                        units.length > 1 && (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            onClick={() => removeUnit(idx)}
                          />
                        )
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>发电方式</Text>
                          <Select
                            value={unit.type}
                            onChange={(v) => updateUnit(idx, 'type', v)}
                            style={{ width: '100%' }}
                            options={generationTypes.map(t => ({ value: t, label: t }))}
                          />
                        </div>
                        <Space>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>机组容量 (MW)</Text>
                            <InputNumber
                              min={0}
                              value={unit.capacityMW}
                              onChange={(v) => updateUnit(idx, 'capacityMW', v || 0)}
                              style={{ width: '100%' }}
                              addonAfter="MW"
                            />
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>边际成本 (元/MWh)</Text>
                            <InputNumber
                              min={0}
                              value={unit.marginalCost}
                              onChange={(v) => updateUnit(idx, 'marginalCost', v || 0)}
                              style={{ width: '100%' }}
                              addonAfter="元/MWh"
                            />
                          </div>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={addUnit}>
                    添加机组
                  </Button>
                </>
              )}

              {role === 'SELLER' && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>总负荷 (MW)</Text>
                  <InputNumber
                    min={0}
                    value={loadMW}
                    onChange={(v) => setLoadMW(v || 0)}
                    style={{ width: '100%' }}
                    size="large"
                    addonAfter="MW"
                    placeholder="输入公司总负荷"
                  />
                </div>
              )}
            </>
          )}

          <Space style={{ width: '100%' }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/login')}>
              返回登录
            </Button>
            <Button type="primary" loading={loading} onClick={handleRegister} style={{ flex: 1, height: 44 }}>
              注册
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
