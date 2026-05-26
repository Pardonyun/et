import React, { useState, useEffect } from 'react';
import {
  Card, Button, Typography, Select, Divider, Space, InputNumber, message, Tag, Descriptions,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { authApi } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

const { Title } = Typography;
const generationTypes = ['水电', '火电', '风电', '光伏', '核电'];

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [loadMW, setLoadMW] = useState<number>(0);
  const [units, setUnits] = useState<Array<{
    id?: string; type: string; capacityMW: number; marginalCost: number;
  }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.generatorProfile) {
      if (Array.isArray(user.generatorProfile.units) && user.generatorProfile.units.length > 0) {
        setUnits(user.generatorProfile.units.map((u: any) => ({
          id: u.id,
          type: u.type,
          capacityMW: u.capacityMW,
          marginalCost: u.marginalCost,
        })));
      }
    }
    if (user?.sellerProfile) {
      setLoadMW(user.sellerProfile.loadMW);
    }
  }, [user]);

  if (!user) return null;
  const isExchange = user.role === 'EXCHANGE';
  const isGenerator = user.role === 'GENERATOR';

  const addUnit = () => setUnits([...units, { type: '火电', capacityMW: 0, marginalCost: 0 }]);
  const removeUnit = (idx: number) => {
    if (units.length > 1) setUnits(units.filter((_, i) => i !== idx));
  };
  const updateUnit = (idx: number, field: string, value: any) => {
    setUnits(units.map((u, i) => i === idx ? { ...u, [field]: value } : u));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const data: any = {};
      if (isGenerator) data.units = units.map(u => ({
        id: u.id,
        type: u.type,
        capacityMW: Number(u.capacityMW),
        marginalCost: Number(u.marginalCost),
      }));
      if (user.role === 'SELLER') data.loadMW = Number(loadMW);

      await authApi.updateProfile(data);
      const refreshed = await authApi.getMe();
      setUser(refreshed.data);
      message.success('信息修改成功');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (isExchange) {
    return (
      <div style={{ maxWidth: 500 }}>
        <Title level={4} style={{ color: '#1A3359' }}>我的账号</Title>
        <Card>
          <Descriptions column={1} size="middle">
            <Descriptions.Item label="账号">{user.username}</Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color="blue">电力交易所</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    );
  }

  const totalCapacity = units.reduce((s, u) => s + Number(u.capacityMW), 0);

  return (
    <div style={{ maxWidth: 700 }}>
      <Title level={4} style={{ color: '#1A3359' }}>公司信息</Title>
      <Card>
        <Descriptions column={1} size="middle" style={{ marginBottom: 24 }}>
          <Descriptions.Item label="账号">
            <span style={{ color: '#999' }}>{user.username}</span>
          </Descriptions.Item>
          <Descriptions.Item label="公司名称">
            <span style={{ color: '#999' }}>{user.generatorProfile?.companyName || user.sellerProfile?.companyName}</span>
          </Descriptions.Item>
        </Descriptions>

        {isGenerator && (
          <>
            <Divider>发电机组</Divider>
            <div style={{ marginBottom: 8, color: '#666' }}>
              总装机容量：<Tag color="green">{totalCapacity} MW</Tag>
            </div>
            {units.map((unit, idx) => (
              <Card
                key={idx}
                size="small"
                style={{ background: '#FAFCFF', marginBottom: 12 }}
                title={<span style={{ fontWeight: 600, fontSize: 13 }}>机组 {idx + 1}</span>}
                extra={
                  units.length > 1 && (
                    <Button type="text" danger icon={<DeleteOutlined />} size="small"
                      onClick={() => removeUnit(idx)}>删除</Button>
                  )
                }
              >
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <span style={{ fontSize: 12, color: '#999' }}>发电方式</span>
                    <Select
                      value={unit.type}
                      onChange={(v) => updateUnit(idx, 'type', v)}
                      style={{ width: '100%' }}
                      options={generationTypes.map(t => ({ value: t, label: t }))}
                    />
                  </div>
                  <Space>
                    <div>
                      <span style={{ fontSize: 12, color: '#999' }}>容量 (MW)</span>
                      <InputNumber min={0} value={unit.capacityMW}
                        onChange={(v) => updateUnit(idx, 'capacityMW', v || 0)}
                        addonAfter="MW" />
                    </div>
                    <div>
                      <span style={{ fontSize: 12, color: '#999' }}>边际成本 (元/MWh)</span>
                      <InputNumber min={0} value={unit.marginalCost}
                        onChange={(v) => updateUnit(idx, 'marginalCost', v || 0)}
                        addonAfter="元/MWh" />
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

        {user.role === 'SELLER' && (
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>总负荷 (MW)</div>
            <InputNumber min={0} value={loadMW}
              onChange={(v) => setLoadMW(v || 0)} addonAfter="MW"
              style={{ width: '100%' }} />
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <Button type="primary" loading={loading} onClick={handleSave} block style={{ height: 44 }}>
            保存修改
          </Button>
        </div>
      </Card>
    </div>
  );
}
