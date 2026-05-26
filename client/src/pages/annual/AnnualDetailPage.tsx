import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Tag, Space, Spin, Typography, InputNumber, message, Table, Row, Col, Divider, Empty, Modal, Statistic,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { annualApi } from '../../services/annualApi';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import SupplyDemandChart from '../../components/SupplyDemandChart';
import { AnnualTradingRules } from '../../components/TradingRules';
import type { AnnualTrade, AnnualBid, ClearingResponse } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusMap: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待开始' },
  OPEN: { color: 'processing', text: '报价中' },
  CLOSED: { color: 'warning', text: '出清中' },
  CLEARED: { color: 'success', text: '已出清' },
};

export default function AnnualDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { socket } = useSocket();

  const [trade, setTrade] = useState<AnnualTrade | null>(null);
  const [myBid, setMyBid] = useState<AnnualBid | null>(null);
  const [clearing, setClearing] = useState<ClearingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Per-segment state: each slot has volume, price, and submitted status
  const [segmentStates, setSegmentStates] = useState([
    { volume: 0, price: 0, submitted: false },
    { volume: 0, price: 0, submitted: false },
    { volume: 0, price: 0, submitted: false },
  ]);
  const [submittingIdx, setSubmittingIdx] = useState<number | null>(null);

  const isExchange = user?.role === 'EXCHANGE';
  const canBid = user?.role === 'GENERATOR' || user?.role === 'SELLER';

  // Compute constraints
  const totalCapacity = user?.generatorProfile?.units?.reduce((s: number, u: any) => s + u.capacityMW, 0) || 0;
  const totalLoad = user?.sellerProfile?.loadMW || 0;
  const maxBidVolume = user?.role === 'GENERATOR' ? totalCapacity : user?.role === 'SELLER' ? totalLoad : 0;

  const currentTotalVolume = segmentStates
    .filter((s) => s.submitted)
    .reduce((sum, s) => sum + s.volume, 0);

  const remainingCapacity = Math.max(0, maxBidVolume - currentTotalVolume);
  const submittedCount = segmentStates.filter((s) => s.submitted).length;
  const remainingSegments = 3 - submittedCount;

  const fetchTrade = useCallback(async () => {
    if (!id) return;
    try {
      const res = await annualApi.getDetail(id);
      setTrade(res.data);
      if (res.data.status === 'CLEARED') {
        try { const cr = await annualApi.getClearing(id); setClearing(cr.data); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  const fetchMyBid = useCallback(async () => {
    if (!id || !canBid) return;
    try {
      const res = await annualApi.getMyBid(id);
      setMyBid(res.data);
      if (res.data?.segments) {
        try {
          const parsed: { volume: number; price: number }[] = JSON.parse(res.data.segments);
          const newStates = [
            { volume: 0, price: 0, submitted: false },
            { volume: 0, price: 0, submitted: false },
            { volume: 0, price: 0, submitted: false },
          ];
          parsed.forEach((seg, i) => {
            if (i < 3 && seg.volume > 0) {
              newStates[i] = { volume: seg.volume, price: seg.price, submitted: true };
            }
          });
          setSegmentStates(newStates);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, [id, canBid]);

  useEffect(() => { fetchTrade(); fetchMyBid(); }, [fetchTrade, fetchMyBid]);

  // WebSocket
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join:annual', id);
    socket.on('annual:status', (data: any) => { if (data.tradeId === id) fetchTrade(); });
    socket.on('annual:bid:updated', (data: any) => {
      if (data.tradeId === id && data.userId === user?.id) fetchMyBid();
    });
    socket.on('annual:bid:cancelled', (data: any) => {
      if (data.tradeId === id && data.userId === user?.id) {
        setMyBid(null);
        setSegmentStates([
          { volume: 0, price: 0, submitted: false },
          { volume: 0, price: 0, submitted: false },
          { volume: 0, price: 0, submitted: false },
        ]);
      }
    });
    socket.on('annual:cleared', (data: any) => { setClearing(data); fetchTrade(); });
    return () => {
      socket.off('annual:status'); socket.off('annual:bid:updated');
      socket.off('annual:bid:cancelled'); socket.off('annual:cleared');
      socket.emit('leave:annual', id);
    };
  }, [socket, id, user?.id, fetchTrade, fetchMyBid]);

  const handleSubmitSegment = async (idx: number) => {
    if (!id) return;
    const seg = segmentStates[idx];
    if (seg.volume <= 0) { message.warning('请输入电量'); return; }
    if (seg.price < 0) { message.warning('请输入价格'); return; }
    if (!seg.submitted && seg.volume > remainingCapacity && user?.role !== 'EXCHANGE') {
      message.warning(`报量超过剩余容量 ${remainingCapacity}MW`);
      return;
    }
    setSubmittingIdx(idx);
    try {
      await annualApi.submitSegment(id, idx, seg.volume, seg.price);
      message.success(`第${idx + 1}段报价已提交`);
      fetchMyBid();
    } catch (err: any) { message.error(err.message); }
    finally { setSubmittingIdx(null); }
  };

  const handleCancelSegment = async (idx: number) => {
    if (!id) return;
    try {
      await annualApi.cancelSegment(id, idx);
      message.success(`第${idx + 1}段报价已撤销`);
      fetchMyBid();
    } catch (err: any) { message.error(err.message); }
  };

  const handleClose = () => {
    if (!id) return;
    Modal.confirm({
      title: '确认结束交易？', content: '结束后将自动执行出清计算。',
      onOk: async () => {
        try {
          await annualApi.close(id); message.success('已结束并出清'); fetchTrade();
        } catch (err: any) { message.error(err.message); }
      },
    });
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!trade) return <Empty description="交易不存在" />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/annual')}>返回列表</Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#1A3359' }}>{trade.name}</Title>
            <Space style={{ marginTop: 8 }}>
              <Tag color={statusMap[trade.status]?.color}>{statusMap[trade.status]?.text}</Tag>
              {trade.startedAt && <Text type="secondary">开始: {dayjs(trade.startedAt).format('YYYY-MM-DD HH:mm')}</Text>}
              {trade.deadlineAt && <Text type="secondary">截止: {dayjs(trade.deadlineAt).format('YYYY-MM-DD HH:mm')}</Text>}
            </Space>
          </div>
          {isExchange && trade.status === 'OPEN' && (
            <Button danger onClick={handleClose}>结束交易并出清</Button>
          )}
        </div>
      </Card>

      <AnnualTradingRules />

      {/* Per-segment bid section */}
      {canBid && trade.status === 'OPEN' && (
        <Card
          title={
            <Space>
              <span>逐段报量报价</span>
              <Tag color="blue">已报 {submittedCount}/3 段 · 剩余可报 {remainingSegments} 段</Tag>
              {maxBidVolume > 0 && <Tag color="green">可用容量 {remainingCapacity} MW</Tag>}
            </Space>
          }
          style={{ marginTop: 16 }}
        >
          {segmentStates.map((seg, idx) => (
            <Card
              key={idx}
              size="small"
              style={{
                background: seg.submitted ? '#F0FFF0' : '#FAFCFF',
                borderColor: seg.submitted ? '#B7EB8F' : '#D6E8FA',
                marginBottom: 8,
              }}
              title={<span style={{ fontWeight: 600 }}>第 {idx + 1} 段 {seg.submitted ? <Tag color="success">已提交</Tag> : <Tag>未提交</Tag>}</span>}
              extra={
                seg.submitted ? (
                  <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleCancelSegment(idx)}>
                    撤销
                  </Button>
                ) : null
              }
            >
              <Row gutter={16} align="middle">
                <Col span={10}>
                  <Text type="secondary" style={{ fontSize: 12 }}>电量 (MWh)</Text>
                  <InputNumber
                    min={0}
                    max={!seg.submitted ? remainingCapacity + seg.volume : undefined}
                    value={seg.volume}
                    onChange={(v) => {
                      const s = [...segmentStates];
                      s[idx].volume = v || 0;
                      setSegmentStates(s);
                    }}
                    style={{ width: '100%' }}
                    addonAfter="MWh"
                    disabled={seg.submitted}
                  />
                </Col>
                <Col span={10}>
                  <Text type="secondary" style={{ fontSize: 12 }}>价格 (元/MWh)</Text>
                  <InputNumber
                    min={0}
                    value={seg.price}
                    onChange={(v) => {
                      const s = [...segmentStates];
                      s[idx].price = v || 0;
                      setSegmentStates(s);
                    }}
                    style={{ width: '100%' }}
                    addonAfter="元/MWh"
                    disabled={seg.submitted}
                  />
                </Col>
                <Col span={4}>
                  <Button
                    type={seg.submitted ? 'default' : 'primary'}
                    icon={seg.submitted ? undefined : <CheckOutlined />}
                    loading={submittingIdx === idx}
                    onClick={() => handleSubmitSegment(idx)}
                    disabled={seg.submitted && seg.volume === 0}
                    block={!seg.submitted}
                    style={seg.submitted ? {} : { height: 44 }}
                  >
                    {seg.submitted ? '已提交' : '提交'}
                  </Button>
                </Col>
              </Row>
            </Card>
          ))}
        </Card>
      )}

      {/* My current bid summary */}
      {canBid && myBid && (
        <Card title="我的当前报价" style={{ marginTop: 16 }}>
          {(() => {
            try {
              const segs: { volume: number; price: number }[] = JSON.parse(myBid.segments);
              return (
                <Table
                  dataSource={segs.map((s, i) => ({ key: i, seg: i + 1, volume: s.volume, price: s.price }))}
                  columns={[
                    { title: '段', dataIndex: 'seg', render: (v: number) => `第${v}段` },
                    { title: '电量 (MWh)', dataIndex: 'volume' },
                    { title: '价格 (元/MWh)', dataIndex: 'price' },
                  ]}
                  pagination={false}
                  size="small"
                  summary={() => {
                    const total = segs.reduce((s, r) => s + r.volume, 0);
                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><Text strong>合计</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1}><Text strong>{total} MWh</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                      </Table.Summary.Row>
                    );
                  }}
                />
              );
            } catch { return <Empty description="无报价" />; }
          })()}
        </Card>
      )}

      {/* Exchange: all bids */}
      {isExchange && trade.status === 'OPEN' && (
        <Card title="所有报价汇总" style={{ marginTop: 16 }}>
          {trade.bids && trade.bids.length > 0 ? (
            <Table
              dataSource={trade.bids}
              columns={[
                { title: '公司', key: 'company',
                  render: (_: any, r: any) => r.user?.generatorProfile?.companyName || r.user?.sellerProfile?.companyName || r.user?.username },
                { title: '角色', key: 'role',
                  render: (_: any, r: any) => <Tag color={r.user?.role === 'GENERATOR' ? 'green' : 'gold'}>{r.user?.role === 'GENERATOR' ? '发电公司' : '售电公司'}</Tag> },
                { title: '报价详情', key: 'segments',
                  render: (_: any, r: any) => {
                    try {
                      return JSON.parse(r.segments).map((s: any, i: number) => (
                        <div key={i}>第{i + 1}段: {s.volume}MWh @ {s.price}元/MWh</div>
                      ));
                    } catch { return '-'; }
                  } },
              ]}
              rowKey="id" pagination={false} size="small"
            />
          ) : <Empty description="暂无报价" />}
        </Card>
      )}

      {/* Clearing Results */}
      {trade.status === 'CLEARED' && clearing && (
        <>
          <Card title="供给-需求阶梯曲线" style={{ marginTop: 16 }}>
            <SupplyDemandChart
              supplyCurve={clearing.supplyCurve}
              demandCurve={clearing.demandCurve}
              clearingPrice={clearing.clearingPrice}
              clearingVolume={clearing.clearingVolume}
            />
            <Divider />
            <Row gutter={24}>
              <Col span={12}>
                <Statistic title="统一出清价 (SMP)" value={clearing.clearingPrice} suffix="元/MWh" valueStyle={{ color: '#FAAD14' }} />
              </Col>
              <Col span={12}>
                <Statistic title="总成交电量" value={clearing.clearingVolume} suffix="MWh" valueStyle={{ color: '#4A90D9' }} />
              </Col>
            </Row>
          </Card>

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card title="发电侧中标结果" style={{ borderTop: '3px solid #52C41A' }}>
                <Table
                  dataSource={clearing.genResults || []}
                  columns={[
                    { title: '公司', dataIndex: 'companyName' },
                    { title: '中标电量 (MWh)', dataIndex: 'clearedVol' },
                    { title: '收入 (元)', dataIndex: 'revenue' },
                  ]}
                  rowKey="userId" pagination={false} size="small"
                  summary={() => {
                    const data = clearing.genResults || [];
                    const tV = data.reduce((s, r) => s + r.clearedVol, 0);
                    const tR = data.reduce((s, r) => s + r.revenue, 0);
                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><Text strong>合计</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1}><Text strong>{tV} MWh</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2}><Text strong>{tR} 元</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                  locale={{ emptyText: '无中标' }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="用户侧中标结果" style={{ borderTop: '3px solid #FAAD14' }}>
                <Table
                  dataSource={clearing.selResults || []}
                  columns={[
                    { title: '公司', dataIndex: 'companyName' },
                    { title: '中标电量 (MWh)', dataIndex: 'clearedVol' },
                    { title: '支付费用 (元)', dataIndex: 'payment' },
                  ]}
                  rowKey="userId" pagination={false} size="small"
                  summary={() => {
                    const data = clearing.selResults || [];
                    const tV = data.reduce((s, r) => s + r.clearedVol, 0);
                    const tP = data.reduce((s, r) => s + r.payment, 0);
                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><Text strong>合计</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1}><Text strong>{tV} MWh</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2}><Text strong>{tP} 元</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                  locale={{ emptyText: '无中标' }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
