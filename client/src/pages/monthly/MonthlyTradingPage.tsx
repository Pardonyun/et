import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Tabs, Space, Typography, Table, Tag, InputNumber, Spin,
  message, Empty, Row, Col, Modal,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { monthlyApi } from '../../services/monthlyApi';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import PhaseTimer from '../../components/PhaseTimer';
import ConstraintBar from '../../components/ConstraintBar';
import { MonthlyTradingRules } from '../../components/TradingRules';
import TradeCurveChart from '../../components/TradeCurveChart';
import type { MonthlyTrade, MonthlyListing, MonthlyMatch, Transaction, Constraints } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const periodNames: Record<string, string> = { PEAK: '峰时段', FLAT: '平时段', VALLEY: '谷时段' };

export default function MonthlyTradingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { socket } = useSocket();

  const [trade, setTrade] = useState<MonthlyTrade | null>(null);
  const [listings, setListings] = useState<MonthlyListing[]>([]);
  const [matches, setMatches] = useState<MonthlyMatch[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [constraints, setConstraints] = useState<Constraints | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [curves, setCurves] = useState<Record<string, { pricePoints: [string, number][]; volumePoints: [string, number][] }>>({});

  // Listing form
  const [formOpen, setFormOpen] = useState(false);
  const [formSide, setFormSide] = useState<'BUY' | 'SELL'>('BUY');
  const [formPeriod, setFormPeriod] = useState<string>('PEAK');
  const [formVolume, setFormVolume] = useState(0);
  const [formPrice, setFormPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Take form
  const [takeVolume, setTakeVolume] = useState<Record<string, number>>({});

  const isExchange = user?.role === 'EXCHANGE';
  const canTrade = user?.role === 'GENERATOR' || user?.role === 'SELLER';

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        monthlyApi.getDetail(id),
        monthlyApi.getListings(id),
        monthlyApi.getMatches(id),
        monthlyApi.getTransactions(id),
        monthlyApi.getCurves(id),
      ]);
      if (results[0].status === 'fulfilled') setTrade(results[0].value.data);
      if (results[1].status === 'fulfilled') setListings(results[1].value.data);
      if (results[2].status === 'fulfilled') setMatches(results[2].value.data);
      if (results[3].status === 'fulfilled') setTransactions(results[3].value.data);
      if (results[4].status === 'fulfilled') setCurves(results[4].value.data || {});
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  const fetchConstraints = useCallback(async () => {
    if (!id || !canTrade) return;
    try {
      const res = await monthlyApi.getConstraints(id);
      setConstraints(res.data);
    } catch { /* ignore */ }
  }, [id, canTrade]);

  useEffect(() => {
    fetchData();
    fetchConstraints();
  }, [fetchData, fetchConstraints]);

  // WebSocket
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join:monthly', id);

    socket.on('monthly:status', (data: any) => {
      if (data.tradeId === id) fetchData();
    });

    socket.on('monthly:phase:tick', (data: any) => {
      if (data.tradeId === id) setRemainingSec(data.remainingSeconds);
    });

    socket.on('monthly:listing:updated', () => { fetchData(); fetchConstraints(); });
    socket.on('monthly:listing:public', () => { fetchData(); });
    socket.on('monthly:match:new', () => { fetchData(); fetchConstraints(); });
    socket.on('monthly:transaction:new', () => { fetchData(); fetchConstraints(); });
    socket.on('monthly:constraints:updated', (data: any) => {
      if (data.userId === user?.id) setConstraints({
        maxBuyVolume: data.maxBuyVolume,
        maxSellVolume: data.maxSellVolume,
        usedBuyVolume: data.usedBuyVolume,
        usedSellVolume: data.usedSellVolume,
      });
    });
    socket.on('monthly:orderbook:updated', () => { /* order book update */ });
    socket.on('monthly:curves:updated', (data: any) => { setCurves(data); });

    return () => {
      socket.off('monthly:status');
      socket.off('monthly:phase:tick');
      socket.off('monthly:listing:updated');
      socket.off('monthly:listing:public');
      socket.off('monthly:match:new');
      socket.off('monthly:transaction:new');
      socket.off('monthly:constraints:updated');
      socket.off('monthly:orderbook:updated');
      socket.off('monthly:curves:updated');
      socket.emit('leave:monthly', id);
    };
  }, [socket, id, user?.id, fetchData, fetchConstraints]);

  const handleCreateListing = async () => {
    if (!id) return;
    if (formVolume <= 0) { message.warning('请输入挂牌电量'); return; }
    if (formPrice <= 0) { message.warning('请输入挂牌价格'); return; }
    setSubmitting(true);
    try {
      await monthlyApi.createListing(id, {
        side: formSide,
        period: formPeriod,
        volumeMW: formVolume,
        price: formPrice,
      });
      message.success('挂牌提交成功');
      setFormOpen(false);
      setFormVolume(0);
      setFormPrice(0);
    } catch (err: any) {
      message.error(err.message);
    } finally { setSubmitting(false); }
  };

  const handleTake = async (listingId: string) => {
    const vol = takeVolume[listingId] || 0;
    if (vol <= 0) { message.warning('请输入摘牌电量'); return; }
    if (!id) return;
    try {
      await monthlyApi.takeListing(id, listingId, vol);
      message.success('摘牌成功');
      setTakeVolume({});
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleCancel = async (listingId: string) => {
    if (!id) return;
    Modal.confirm({
      title: '确认撤销？', okText: '确认', cancelText: '取消',
      onOk: async () => {
        try {
          await monthlyApi.cancelListing(id, listingId);
          message.success('撤销成功');
        } catch (err: any) { message.error(err.message); }
      },
    });
  };

  const handleNextPhase = async () => {
    if (!id) return;
    try {
      await monthlyApi.nextPhase(id);
      message.success('已推进至下一阶段');
    } catch (err: any) { message.error(err.message); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!trade) return <Empty description="交易不存在" />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/monthly')}>返回列表</Button>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Title level={4} style={{ margin: 0, color: '#1A3359' }}>{trade.name}</Title>
        <Space>
          {isExchange && trade.status === 'ACTIVE' && trade.phase !== 'CLOSED' && (
            <Button onClick={handleNextPhase}>
              {trade.phase === 'NEGOTIATION' ? '结束交易' : '推进下一阶段'}
            </Button>
          )}
        </Space>
      </div>

      <PhaseTimer
        phase={trade.phase}
        remainingSeconds={remainingSec}
        totalSeconds={trade.phase === 'MATCHING' ? 300 : null}
      />

      {canTrade && <ConstraintBar constraints={constraints} loading={false} />}

      <MonthlyTradingRules />

      <Card style={{ marginTop: 16 }}>
        <Tabs
          defaultActiveKey="PEAK"
          tabBarExtraContent={
            canTrade && trade.phase !== 'CLOSED' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                新建挂牌
              </Button>
            )
          }
        >
          {Object.entries(periodNames).map(([period, name]) => {
            const periodListings = listings.filter((l) => l.period === period);
            const myListings = periodListings.filter((l) => l.userId === user?.id);
            const publicListings = periodListings.filter((l) => l.userId !== user?.id);

            return (
              <TabPane tab={name} key={period}>
                {/* My Listings */}
                {canTrade && (
                  <>
                    <Text strong style={{ color: '#4A90D9' }}>我的挂牌</Text>
                    <Table
                      dataSource={myListings}
                      rowKey="id"
                      size="small"
                      style={{ marginTop: 8, marginBottom: 16 }}
                      columns={[
                        { title: '方向', dataIndex: 'side', width: 70, render: (s: string) => <Tag color={s === 'BUY' ? 'green' : 'gold'}>{s === 'BUY' ? '买' : '卖'}</Tag> },
                        { title: '总量(MW)', dataIndex: 'volumeMW' },
                        { title: '剩余(MW)', dataIndex: 'remainingMW' },
                        { title: '价格(元/MWh)', dataIndex: 'price' },
                        {
                          title: '状态', dataIndex: 'status', width: 100,
                          render: (s: string) => {
                            const m: Record<string, { color: string; text: string }> = {
                              ACTIVE: { color: 'blue', text: '活跃' },
                              PARTIALLY_FILLED: { color: 'orange', text: '部分成交' },
                              FILLED: { color: 'green', text: '已成交' },
                              CANCELLED: { color: 'red', text: '已撤销' },
                            };
                            return <Tag color={m[s]?.color}>{m[s]?.text}</Tag>;
                          },
                        },
                        ...(trade.phase === 'NEGOTIATION' ? [{
                          title: '操作', key: 'action', width: 100,
                          render: (_: any, r: MonthlyListing) =>
                            (r.status === 'ACTIVE' || r.status === 'PARTIALLY_FILLED') ? (
                              <Button size="small" danger onClick={() => handleCancel(r.id)}>撤销</Button>
                            ) : null,
                        }] : []),
                      ]}
                      pagination={false}
                      locale={{ emptyText: '暂无挂牌' }}
                    />
                  </>
                )}

                {/* Public Board (NEGOTIATION phase) */}
                {trade.phase === 'NEGOTIATION' && (
                  <>
                    <Text strong style={{ color: '#FAAD14' }}>市场挂牌看板</Text>
                    <Table
                      dataSource={publicListings}
                      rowKey="id"
                      size="small"
                      style={{ marginTop: 8 }}
                      columns={[
                        {
                          title: '公司', key: 'user',
                          render: (_: any, r: any) => r.user?.username || '-',
                          width: 120,
                        },
                        { title: '方向', dataIndex: 'side', width: 70, render: (s: string) => <Tag color={s === 'BUY' ? 'green' : 'gold'}>{s === 'BUY' ? '买' : '卖'}</Tag> },
                        { title: '剩余(MW)', dataIndex: 'remainingMW' },
                        { title: '价格(元/MWh)', dataIndex: 'price' },
                        {
                          title: '摘牌', key: 'take', width: 150,
                          render: (_: any, r: MonthlyListing) =>
                            canTrade && r.userId !== user?.id && (r.status === 'ACTIVE' || r.status === 'PARTIALLY_FILLED') ? (
                              <Space>
                                <InputNumber
                                  min={0} max={r.remainingMW}
                                  value={takeVolume[r.id]}
                                  onChange={(v) => setTakeVolume({ ...takeVolume, [r.id]: v || 0 })}
                                  style={{ width: 80 }}
                                  placeholder="电量"
                                />
                                <Button size="small" type="primary" onClick={() => handleTake(r.id)}>摘牌</Button>
                              </Space>
                            ) : <Text type="secondary">-</Text>,
                        },
                      ]}
                      pagination={false}
                      locale={{ emptyText: '暂无其他公司的挂牌' }}
                    />
                  </>
                )}
              </TabPane>
            );
          })}
        </Tabs>
      </Card>

      {/* Match & Transaction History */}
      <Card title="成交记录" style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="matches">
          <TabPane tab={`撮合成交 (${matches.length})`} key="matches">
            <Table
              dataSource={matches}
              rowKey="id"
              size="small"
              columns={[
                { title: '时段', dataIndex: 'period', render: (p: string) => <Tag color={p === 'PEAK' ? 'red' : p === 'FLAT' ? 'blue' : 'green'}>{periodNames[p]}</Tag> },
                { title: '卖方', key: 'seller', render: (_: any, r: any) => r.askListing?.user?.username || '-' },
                { title: '买方', key: 'buyer', render: (_: any, r: any) => r.bidListing?.user?.username || '-' },
                { title: '成交量(MW)', dataIndex: 'volumeMW' },
                { title: '成交价(元/MWh)', dataIndex: 'price' },
                { title: '时间', dataIndex: 'matchedAt', render: (t: string) => dayjs(t).format('HH:mm:ss') },
              ]}
              pagination={false}
              locale={{ emptyText: '暂无撮合成交' }}
            />
          </TabPane>
          <TabPane tab={`摘牌成交 (${transactions.length})`} key="transactions">
            <Table
              dataSource={transactions}
              rowKey="id"
              size="small"
              columns={[
                { title: '时段', key: 'period', render: (_: any, r: any) => <Tag color={(r as any).listing?.period === 'PEAK' ? 'red' : (r as any).listing?.period === 'FLAT' ? 'blue' : 'green'}>{(periodNames as any)[(r as any).listing?.period] || '-'}</Tag> },
                { title: '挂牌方', key: 'maker', render: (_: any, r: any) => (r as any).listing?.user?.username || '-' },
                { title: '摘牌方', key: 'taker', render: (_: any, r: any) => (r as any).taker?.username || '-' },
                { title: '成交量(MW)', dataIndex: 'volumeMW' },
                { title: '价格(元/MWh)', dataIndex: 'price' },
                { title: '时间', dataIndex: 'createdAt', render: (t: string) => dayjs(t).format('HH:mm:ss') },
              ]}
              pagination={false}
              locale={{ emptyText: '暂无摘牌成交' }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Trade Curves per Period */}
      {Object.keys(curves).length > 0 && (
        <Card title="各时段成交曲线" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            {(['PEAK', 'FLAT', 'VALLEY'] as const).filter(p => curves[p] && curves[p].pricePoints.length > 0).map(p => (
              <Col xs={24} lg={Object.keys(curves).filter(k => curves[k]?.pricePoints?.length > 0).length > 1 ? 12 : 24} key={p}>
                <TradeCurveChart
                  pricePoints={curves[p].pricePoints}
                  volumePoints={curves[p].volumePoints}
                  periodName={periodNames[p]}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Create Listing Modal */}
      <Modal
        title="新建挂牌"
        open={formOpen}
        onOk={handleCreateListing}
        onCancel={() => setFormOpen(false)}
        confirmLoading={submitting}
        okText="提交挂牌"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>方向</Text>
            <Tabs
              activeKey={formSide}
              onChange={(k) => setFormSide(k as 'BUY' | 'SELL')}
              items={[
                { key: 'BUY', label: <Tag color="green">买电</Tag> },
                { key: 'SELL', label: <Tag color="gold">卖电</Tag> },
              ]}
            />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>时段</Text>
            <Tabs
              activeKey={formPeriod}
              onChange={setFormPeriod}
              items={[
                { key: 'PEAK', label: '峰' },
                { key: 'FLAT', label: '平' },
                { key: 'VALLEY', label: '谷' },
              ]}
            />
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Text style={{ display: 'block', marginBottom: 4 }}>电量 (MW)</Text>
              <InputNumber min={0} value={formVolume} onChange={(v) => setFormVolume(v || 0)}
                style={{ width: '100%' }} addonAfter="MW" />
            </Col>
            <Col span={12}>
              <Text style={{ display: 'block', marginBottom: 4 }}>价格 (元/MWh)</Text>
              <InputNumber min={0} value={formPrice} onChange={(v) => setFormPrice(v || 0)}
                style={{ width: '100%' }} addonAfter="元/MWh" />
            </Col>
          </Row>
        </Space>
      </Modal>
    </div>
  );
}
