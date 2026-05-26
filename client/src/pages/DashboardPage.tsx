import React from 'react';
import { Card, Row, Col, Typography, Statistic, Tag } from 'antd';
import {
  ThunderboltOutlined, CalendarOutlined, TeamOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';

const { Title, Paragraph } = Typography;

const roleDescriptions: Record<string, string> = {
  GENERATOR: '作为发电公司，您可以参与年度集中竞价交易和月度滚动撮合交易，通过报量报价出售电力。',
  SELLER: '作为售电公司，您可以参与年度集中竞价交易和月度滚动撮合交易，购买所需电力。',
  EXCHANGE: '作为电力交易所，您可以创建和管理年度/月度交易，查看全部出清结果和成交记录。',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const isExchange = user.role === 'EXCHANGE';
  const isGenerator = user.role === 'GENERATOR';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ color: '#1A3359', marginBottom: 4 }}>
          欢迎，{user.generatorProfile?.companyName || user.sellerProfile?.companyName || user.username}
        </Title>
        <Tag color={user.role === 'GENERATOR' ? 'green' : user.role === 'SELLER' ? 'gold' : 'blue'}>
          {user.role === 'GENERATOR' ? '发电公司' : user.role === 'SELLER' ? '售电公司' : '电力交易所'}
        </Tag>
        <Paragraph style={{ marginTop: 12, color: '#666', maxWidth: 600 }}>
          {roleDescriptions[user.role]}
        </Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => window.location.href = '/annual'} style={{ borderTop: '3px solid #4A90D9' }}>
            <Statistic
              title="年度集中竞价"
              value="进入交易"
              prefix={<CalendarOutlined />}
              valueStyle={{ fontSize: 20, color: '#4A90D9' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => window.location.href = '/monthly'} style={{ borderTop: '3px solid #FAAD14' }}>
            <Statistic
              title="月度滚动撮合"
              value="进入交易"
              prefix={<BarChartOutlined />}
              valueStyle={{ fontSize: 20, color: '#FAAD14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => window.location.href = '/companies'} style={{ borderTop: '3px solid #52C41A' }}>
            <Statistic
              title="市场成员"
              value="查看列表"
              prefix={<TeamOutlined />}
              valueStyle={{ fontSize: 20, color: '#52C41A' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => window.location.href = '/profile'} style={{ borderTop: '3px solid #722ED1' }}>
            <Statistic
              title="公司信息"
              value={isExchange ? '查看信息' : '修改信息'}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ fontSize: 20, color: '#722ED1' }}
            />
          </Card>
        </Col>
      </Row>

      {isGenerator && Array.isArray(user.generatorProfile?.units) && user.generatorProfile!.units.length > 0 && (
        <Card title="我的机组信息" style={{ marginTop: 24 }}>
          <Row gutter={16}>
            {user.generatorProfile.units.map((unit: any, idx: number) => (
              <Col key={idx} xs={24} sm={12} md={8}>
                <Card size="small" style={{ background: '#FAFCFF', marginBottom: 8 }}>
                  <Tag color="blue">{unit.type}</Tag>
                  <div style={{ marginTop: 8 }}>
                    <span>容量：{unit.capacityMW} MW</span>
                    <br />
                    <span>边际成本：{unit.marginalCost} 元/MWh</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          <div style={{ marginTop: 12 }}>
            <Tag color="green">总容量：{user.generatorProfile.units.reduce((s: number, u: any) => s + u.capacityMW, 0)} MW</Tag>
          </div>
        </Card>
      )}

      {user.role === 'SELLER' && user.sellerProfile && (
        <Card title="公司信息" style={{ marginTop: 24 }}>
          <Statistic title="总负荷" value={user.sellerProfile.loadMW} suffix="MW" />
        </Card>
      )}
    </div>
  );
}
