import { Tag, Typography, Progress } from 'antd';

const { Text } = Typography;

const phaseNames: Record<string, string> = {
  MATCHING: '自动撮合阶段',
  NEGOTIATION: '手动摘牌挂牌阶段',
  CLOSED: '已结束',
};

const phaseColors: Record<string, string> = {
  MATCHING: 'gold',
  NEGOTIATION: 'green',
  CLOSED: 'default',
};

interface Props {
  phase: string;
  remainingSeconds: number | null;
  totalSeconds: number | null;
}

export default function PhaseTimer({ phase, remainingSeconds, totalSeconds }: Props) {
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const percent = totalSeconds && remainingSeconds !== null
    ? Math.round(((totalSeconds - remainingSeconds) / totalSeconds) * 100)
    : 0;

  return (
    <div style={{ marginBottom: 16, padding: '12px 16px', background: '#FAFCFF', borderRadius: 8, border: '1px solid #D6E8FA' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Tag color={phaseColors[phase] || 'default'}>{phaseNames[phase] || phase}</Tag>
          {remainingSeconds !== null && phase !== 'NEGOTIATION' && phase !== 'CLOSED' && (
            <Text strong style={{ fontSize: 20, color: '#4A90D9', marginLeft: 12 }}>
              {formatTime(remainingSeconds)}
            </Text>
          )}
          {phase === 'NEGOTIATION' && (
            <Text type="secondary" style={{ marginLeft: 12 }}>不限时，等待交易所手动结束</Text>
          )}
        </div>
        {totalSeconds && remainingSeconds !== null && phase !== 'NEGOTIATION' && (
          <Progress percent={percent} size="small" style={{ width: 200, marginBottom: 0 }} strokeColor="#FAAD14" />
        )}
      </div>
    </div>
  );
}
