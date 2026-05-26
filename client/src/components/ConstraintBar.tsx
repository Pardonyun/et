import React from 'react';
import { Progress, Typography, Space } from 'antd';
import type { Constraints } from '../types';

const { Text } = Typography;

interface Props {
  constraints: Constraints | null;
  loading: boolean;
}

export default function ConstraintBar({ constraints, loading }: Props) {
  if (loading || !constraints) return null;

  const buyPercent = (constraints.maxBuyVolume + constraints.usedBuyVolume) > 0
    ? Math.round((constraints.usedBuyVolume / (constraints.maxBuyVolume + constraints.usedBuyVolume)) * 100)
    : 0;

  const sellPercent = (constraints.maxSellVolume + constraints.usedSellVolume) > 0
    ? Math.round((constraints.usedSellVolume / (constraints.maxSellVolume + constraints.usedSellVolume)) * 100)
    : 0;

  return (
    <div style={{ padding: '12px 16px', background: '#FFFBE6', borderRadius: 8, border: '1px solid #FFE58F', marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text strong style={{ fontSize: 13 }}>
            <span style={{ color: '#52C41A' }}>可买电量</span>：剩余 {constraints.maxBuyVolume} MW / 总计 {(constraints.maxBuyVolume + constraints.usedBuyVolume).toFixed(2)} MW
          </Text>
          <Progress percent={buyPercent} size="small" strokeColor="#52C41A" showInfo={false} />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>
            <span style={{ color: '#FAAD14' }}>可卖电量</span>：剩余 {constraints.maxSellVolume} MW / 总计 {(constraints.maxSellVolume + constraints.usedSellVolume).toFixed(2)} MW
          </Text>
          <Progress percent={sellPercent} size="small" strokeColor="#FAAD14" showInfo={false} />
        </div>
      </Space>
    </div>
  );
}
