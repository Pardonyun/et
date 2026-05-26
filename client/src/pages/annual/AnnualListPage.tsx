import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Tag, Space, Modal, Input, DatePicker, message, Typography,
} from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import { annualApi } from '../../services/annualApi';
import { useAuthStore } from '../../stores/authStore';
import { AnnualTradingRules } from '../../components/TradingRules';
import type { AnnualTrade } from '../../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const statusMap: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待开始' },
  OPEN: { color: 'processing', text: '报价中' },
  CLOSED: { color: 'warning', text: '出清中' },
  CLEARED: { color: 'success', text: '已出清' },
};

export default function AnnualListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [trades, setTrades] = useState<AnnualTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [deadline, setDeadline] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const isExchange = user?.role === 'EXCHANGE';

  useEffect(() => { fetchTrades(); }, []);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const res = await annualApi.list();
      setTrades(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!tradeName.trim()) { message.warning('请输入交易名称'); return; }
    if (!deadline) { message.warning('请设置交易时限'); return; }
    setCreating(true);
    try {
      await annualApi.create({
        name: tradeName.trim(),
        deadlineAt: deadline.toISOString(),
      });
      message.success('年度交易创建成功');
      setModalOpen(false);
      setTradeName('');
      setDeadline(null);
      fetchTrades();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await annualApi.start(id);
      message.success('交易已开始');
      fetchTrades();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleClose = async (id: string) => {
    Modal.confirm({
      title: '确认结束交易？',
      content: '结束后将自动执行出清计算，不可撤销。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await annualApi.close(id);
          message.success('交易已结束，出清完成');
          fetchTrades();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const columns = [
    { title: '交易名称', dataIndex: 'name', key: 'name',
      render: (text: string, record: AnnualTrade) => (
        <a onClick={() => navigate(`/annual/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag>,
    },
    {
      title: '报价数', key: 'bids', width: 80,
      render: (_: any, r: any) => r._count?.bids || 0,
    },
    {
      title: '截止时间', dataIndex: 'deadlineAt', key: 'deadline', width: 180,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作', key: 'action', width: isExchange ? 260 : 100,
      render: (_: any, record: AnnualTrade) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/annual/${record.id}`)}>
            {record.status === 'CLEARED' ? '查看结果' : '进入交易'}
          </Button>
          {isExchange && record.status === 'PENDING' && (
            <Button size="small" type="primary" onClick={() => handleStart(record.id)}>
              开始
            </Button>
          )}
          {isExchange && record.status === 'OPEN' && (
            <Button size="small" danger onClick={() => handleClose(record.id)}>
              结束
            </Button>
          )}
          {isExchange && record.status !== 'OPEN' && (
            <Button size="small" danger onClick={() => {
              Modal.confirm({
                title: '确认删除该交易？',
                content: '删除后不可恢复，关联的报价和出清结果都会被清除。',
                okText: '确认删除', cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: async () => {
                  try { await annualApi.delete(record.id); message.success('已删除'); fetchTrades(); }
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
        <Title level={4} style={{ margin: 0, color: '#1A3359' }}>
          <CalendarOutlined style={{ marginRight: 8 }} />年度集中竞价交易
        </Title>
        {isExchange && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建交易
          </Button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <AnnualTradingRules />
      </div>

      <Card>
        <Table
          dataSource={trades}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无交易，请等待电力交易所创建' }}
        />
      </Card>

      <Modal
        title="创建年度集中竞价交易"
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
            <Input placeholder="如：2026年度集中竞价" value={tradeName}
              onChange={(e) => setTradeName(e.target.value)} />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>交易时限</div>
            <DatePicker
              showTime
              value={deadline}
              onChange={setDeadline}
              style={{ width: '100%' }}
              placeholder="选择截止时间"
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
