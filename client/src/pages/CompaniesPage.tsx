import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tabs, Tag, Typography, Result, Button, Space, Modal, message } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { authApi } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';
import type { GeneratorProfile, SellerProfile } from '../types';

const { Title } = Typography;

export default function CompaniesPage() {
  const user = useAuthStore((s) => s.user);
  const [generators, setGenerators] = useState<GeneratorProfile[]>([]);
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      authApi.getCompanies('GENERATOR'),
      authApi.getCompanies('SELLER'),
    ]).then(([gRes, sRes]) => {
      setGenerators(gRes.data as GeneratorProfile[]);
      setSellers(sRes.data as SellerProfile[]);
    }).finally(() => setLoading(false));
  }, []);

  if (user?.role !== 'EXCHANGE') {
    return <Result status="403" title="无权访问" subTitle="仅电力交易所可查看市场成员信息" />;
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeleteUser = (userId: string, username: string) => {
    Modal.confirm({
      title: `确认注销「${username}」？`,
      content: '注销后该账号将无法登录，所有关联数据会被清除。',
      okText: '确认注销', cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await authApi.deleteUser(userId); message.success('已注销'); fetchData(); }
        catch (err: any) { message.error(err.message); }
      },
    });
  };

  const genColumns = [
    { title: '公司名称', dataIndex: 'companyName' },
    {
      title: '账号', key: 'username', render: (_: any, r: any) => r.user?.username || '-',
    },
    {
      title: '机组数', key: 'units', render: (_: any, r: any) => r.units?.length || 0,
    },
    {
      title: '总容量 (MW)', key: 'capacity',
      render: (_: any, r: any) => (r.units || []).reduce((s: number, u: any) => s + u.capacityMW, 0),
    },
    {
      title: '发电方式', key: 'types',
      render: (_: any, r: any) => {
        const types = [...new Set((r.units || []).map((u: any) => u.type))] as string[];
        return types.map((t) => <Tag key={t} color="blue">{t}</Tag>);
      },
    },
    {
      title: '详情', key: 'detail',
      render: (_: any, r: any) => (
        <div style={{ fontSize: 12, color: '#666' }}>
          {(r.units || []).map((u: any, i: number) => (
            <div key={i}>{u.type}: {u.capacityMW}MW, 边际成本 {u.marginalCost}元/MWh</div>
          ))}
        </div>
      ),
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Button size="small" danger onClick={() => handleDeleteUser(r.userId, r.user?.username || '')}>
          注销
        </Button>
      ),
    },
  ];

  const selColumns = [
    { title: '公司名称', dataIndex: 'companyName' },
    {
      title: '账号', key: 'username', render: (_: any, r: any) => r.user?.username || '-',
    },
    { title: '总负荷 (MW)', dataIndex: 'loadMW' },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Button size="small" danger onClick={() => handleDeleteUser(r.userId, r.user?.username || '')}>
          注销
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#1A3359', marginBottom: 16 }}>
        <TeamOutlined style={{ marginRight: 8 }} />市场成员
      </Title>

      <Card>
        <Tabs
          items={[
            {
              key: 'generators',
              label: <span><Tag color="green">发电公司</Tag> ({generators.length})</span>,
              children: (
                <Table
                  dataSource={generators}
                  columns={genColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{ emptyText: '暂无注册的发电公司' }}
                />
              ),
            },
            {
              key: 'sellers',
              label: <span><Tag color="gold">售电公司</Tag> ({sellers.length})</span>,
              children: (
                <Table
                  dataSource={sellers}
                  columns={selColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{ emptyText: '暂无注册的售电公司' }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
