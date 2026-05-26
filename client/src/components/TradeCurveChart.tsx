import ReactECharts from 'echarts-for-react';

interface Props {
  pricePoints: [string, number][];
  volumePoints: [string, number][];
  periodName: string;
  height?: number;
}

export default function TradeCurveChart({ pricePoints, volumePoints, periodName, height = 280 }: Props) {
  const times = [...new Set([...pricePoints.map(p => p[0]), ...volumePoints.map(p => p[0])])].sort();

  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['成交价格', '成交量'], top: 5 },
    grid: { left: 55, right: 55, top: 40, bottom: 35 },
    xAxis: {
      type: 'category',
      data: times.map(t => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      axisLabel: { rotate: 30, fontSize: 10 },
      name: '时间',
    },
    yAxis: [
      {
        type: 'value',
        name: '价格 (元/MWh)',
        axisLabel: { formatter: '{value}' },
      },
      {
        type: 'value',
        name: '成交量 (MWh)',
        axisLabel: { formatter: '{value}' },
      },
    ],
    series: [
      {
        name: '成交价格',
        type: 'line',
        data: pricePoints.map(p => p[1]),
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#FF4D4F', width: 2 },
        itemStyle: { color: '#FF4D4F' },
        yAxisIndex: 0,
      },
      {
        name: '成交量',
        type: 'bar',
        data: volumePoints.map(p => p[1]),
        barWidth: '40%',
        itemStyle: { color: '#4A90D9' },
        yAxisIndex: 1,
      },
    ],
  };

  return (
    <div>
      <div style={{ textAlign: 'center', fontWeight: 600, marginBottom: 4, color: '#1A3359', fontSize: 13 }}>
        {periodName}
      </div>
      <ReactECharts option={option} style={{ height, width: '100%' }} />
    </div>
  );
}
