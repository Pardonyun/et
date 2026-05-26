import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Tag, Space, Modal, Input, Select, message, Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { monthlyApi } from '../../services/monthlyApi';
import { annualApi } from '../../services/annualApi';
import { useAuthStore } from '../../stores/authStore';
import { MonthlyTradingRules } from '../../components/TradingRules';
import type { MonthlyTrade, AnnualTrade } from '../../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const phaseMap: Record<string, { color: string; text: string }> = {
  MATCHING: { color: 'gold', text: '自动撮合' },
  NEGOTIATION: { color: 'green', text: '手动摘牌' },
  CLOSED: { color: 'default', text: '已结束' },
};

export default function MonthlyListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [trades, setTrades] = useState<MonthlyTrade[]>([]);
  const [clearedTrades, setClearedTrades] = useState<AnnualTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [annualTradeId, setAnnualTradeId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const isExchange = user?.role === 'EXCHANGE';

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        monthlyApi.list(),
        annualApi.list('CLEARED'),
      ]);
      setTrades(mRes.data);
      setClearedTrades(aRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!tradeName.trim()) { message.warning('请输入交易名称'); return; }
    if (!annualTradeId) { message.warning('请选择已出清的年度交易'); return; }
    setCreating(true);
    try {
      await monthlyApi.create({ name: tradeName.trim(), annualTradeId });
      message.success('月度交易创建成功');
      setModalOpen(false);
      setTradeName('');
      setAnnualTradeId('');
      fetchAll();
    } catch (err: any) { message.error(err.message); }
    finally { setCreating(false); }
  };

  const handleStart = async (id: string) => {
    try {
      await monthlyApi.start(id);
      message.success('交易已开始，进入预挂牌阶段');
      fetchAll();
    } catch (err: any) { message.error(err.message); }
  };

  const columns = [
    { title: '交易名称', dataIndex: 'name', key: 'name',
      render: (text: string, record: MonthlyTrade) => (
        <a onClick={() => navigate(`/monthly/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '状态', key: 'status', width: 100,
      render: (_: any, r: MonthlyTrade) => (
        <Tag color={r.status === 'ACTIVE' ? 'processing' : r.status === 'CLOSED' ? 'default' : 'default'}>
          {r.status === 'ACTIVE' ? '进行中' : r.status === 'CLOSED' ? '已结束' : '待开始'}
        </Tag>
      ),
    },
    {
      title: '当前阶段', key: 'phase', width: 100,
      render: (_: any, r: MonthlyTrade) => (
        <Tag color={phaseMap[r.phase]?.color}>{phaseMap[r.phase]?.text}</Tag>
      ),
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'action', width: 210,
      render: (_: any, record: MonthlyTrade) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/monthly/${record.id}`)}>
            {record.status === 'CLOSED' ? '查看结果' : '进入交易'}
          </Button>
          {isExchange && record.status === 'PENDING' && (
            <Button size="small" type="primary" onClick={() => handleStart(record.id)}>
              开始
            </Button>
          )}
          {isExchange && record.status !== 'ACTIVE' && (
            <Button size="small" danger onClick={() => {
              Modal.confirm({
                title: '确认删除该月度交易？',
                content: '删除后不可恢复，关联的挂牌和成交记录都会被清除。',
                okText: '确认删除', cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: async () => {
                  try { await monthlyApi.delete(record.id); message.success('已删除'); fetchAll(); }
                  catch (err: any) { message.error(err.message); }
                },
              });
            }}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: '#1A3359' }}>月度滚动撮合交易</Title>
        {isExchange && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
            disabled={clearedTrades.length === 0}>
            创建交易
          </Button>
        )}
      </div>

      <MonthlyTradingRules />

      <Card style={{ marginTop: 16 }}>
        <Table
          dataSource={trades}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无月度交易' }}
        />
      </Card>

      <Modal
        title="创建月度滚动撮合交易"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <div style={{ marginBottom: 4 }}>交易名称</div>
            <Input placeholder="如：2026年1月月度交易" value={tradeName}
              onChange={(e) => setTradeName(e.target.value)} />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>基于已出清的年度交易</div>
            <Select
              style={{ width: '100%' }}
              placeholder="选择年度交易"
              value={annualTradeId || undefined}
              onChange={setAnnualTradeId}
              options={clearedTrades.map((t: any) => ({ value: t.id, label: t.name }))}
            />
          </div>
          {clearedTrades.length === 0 && (
            <div style={{ color: '#FF4D4F', fontSize: 12 }}>
              暂无可用的已出清年度交易，请先在年度集中竞价中完成一次出清。
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
}
