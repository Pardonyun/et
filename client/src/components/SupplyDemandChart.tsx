import React from 'react';
import ReactECharts from 'echarts-for-react';

interface CurvePoint {
  cumVolume: number;
  price: number;
  companyName: string;
  volume: number;
}

interface Props {
  supplyCurve: CurvePoint[];
  demandCurve: CurvePoint[];
  clearingPrice: number;
  clearingVolume: number;
  height?: number;
}

export default function SupplyDemandChart({
  supplyCurve,
  demandCurve,
  clearingPrice,
  clearingVolume,
  height = 420,
}: Props) {
  // 供给阶梯：在每段前后添加拐点
  const supplyData: [number, number][] = [];
  let prevQ = 0;
  for (const s of supplyCurve) {
    supplyData.push([prevQ, s.price]);
    supplyData.push([s.cumVolume, s.price]);
    prevQ = s.cumVolume;
  }
  // 延伸末端
  if (supplyData.length > 0) {
    supplyData.push([supplyData[supplyData.length - 1][0], supplyData[supplyData.length - 1][1]]);
  }

  // 需求阶梯
  const demandData: [number, number][] = [];
  prevQ = 0;
  for (const d of demandCurve) {
    demandData.push([prevQ, d.price]);
    demandData.push([d.cumVolume, d.price]);
    prevQ = d.cumVolume;
  }
  if (demandData.length > 0) {
    demandData.push([demandData[demandData.length - 1][0], demandData[demandData.length - 1][1]]);
  }

  // 公司标签（标注在每段中点）
  const supplyLabels = supplyCurve.map((s, i) => {
    const prev = i === 0 ? 0 : supplyCurve[i - 1].cumVolume;
    const midX = (prev + s.cumVolume) / 2;
    return { name: s.companyName, x: midX, y: s.price, vol: s.volume };
  });

  const demandLabels = demandCurve.map((d, i) => {
    const prev = i === 0 ? 0 : demandCurve[i - 1].cumVolume;
    const midX = (prev + d.cumVolume) / 2;
    return { name: d.companyName, x: midX, y: d.price, vol: d.volume };
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
      formatter: function (params: any) {
        let result = `<div>累计量: <b>${params[0]?.axisValue ?? '-'} MWh</b></div>`;
        for (const p of params) {
          if (p.seriesName === '出清点' || p.seriesName === '出清线' || p.seriesName === 'SMP线') continue;
          result += `<div>${p.marker} ${p.seriesName}: <b>${p.value ?? '-'} 元/MWh</b></div>`;
        }
        return result;
      },
    },
    legend: {
      data: ['供给曲线', '需求曲线', '出清点'],
      top: 8,
    },
    grid: {
      left: 65,
      right: 80,
      top: 55,
      bottom: 50,
      show: true,
      borderColor: '#E0E0E0',
      backgroundColor: '#FAFCFF',
    },
    xAxis: {
      name: '电量 (MWh)',
      nameLocation: 'center',
      nameGap: 30,
      type: 'value',
      min: 0,
      axisLine: { lineStyle: { color: '#999' } },
      splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
    },
    yAxis: {
      name: '电价 (元/MWh)',
      nameLocation: 'center',
      nameGap: 42,
      type: 'value',
      min: 0,
      axisLine: { lineStyle: { color: '#999' } },
      splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
    },
    series: [
      {
        name: '供给曲线',
        type: 'line',
        step: 'end',
        data: supplyData,
        lineStyle: { color: '#4A90D9', width: 2.5 },
        itemStyle: { color: '#4A90D9' },
        symbol: 'none',
        z: 2,
      },
      {
        name: '需求曲线',
        type: 'line',
        step: 'end',
        data: demandData,
        lineStyle: { color: '#FF4D4F', width: 2.5 },
        itemStyle: { color: '#FF4D4F' },
        symbol: 'none',
        z: 2,
      },
      {
        name: '出清点',
        type: 'scatter',
        data: [[clearingVolume, clearingPrice]],
        symbolSize: 8,
        itemStyle: { color: '#FAAD14', borderColor: '#D48806', borderWidth: 2 },
        label: {
          show: true,
          formatter: `SMP\n${clearingPrice} 元/MWh`,
          position: 'right',
          distance: 12,
          color: '#D48806',
          fontSize: 12,
          fontWeight: 'bold',
        },
        z: 10,
      },
      {
        name: 'SMP线',
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#FAAD14', type: 'dashed', width: 2 },
          label: {
            formatter: `SMP = ${clearingPrice} 元/MWh`,
            position: 'insideEndTop',
            fontSize: 12,
            color: '#D48806',
          },
          data: [{ yAxis: clearingPrice }],
        },
        data: [],
        z: 5,
      },
      {
        name: '出清线',
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#52C41A', type: 'dashed', width: 1.5 },
          label: {
            formatter: `Q = ${clearingVolume} MWh`,
            position: 'end',
            fontSize: 11,
            color: '#52C41A',
          },
          data: [{ xAxis: clearingVolume }],
        },
        data: [],
        z: 5,
      },
    ],
  };

  // Add company name labels (text only, no pin icons)
  (option.series[0] as any).markPoint = {
    silent: true,
    symbol: 'none',
    label: {
      show: true,
      position: 'insideTop',
      fontSize: 11,
      color: '#1A3359',
      fontWeight: 'bold',
      formatter: (p: any) => p.name + '\n' + p.value,
    },
    data: supplyLabels.map((l) => ({
      name: l.name,
      coord: [l.x, l.y],
      value: l.vol + 'MWh',
    })),
  };

  (option.series[1] as any).markPoint = {
    silent: true,
    symbol: 'none',
    label: {
      show: true,
      position: 'insideBottom',
      fontSize: 11,
      color: '#8C1A1A',
      fontWeight: 'bold',
      formatter: (p: any) => p.name + '\n' + p.value,
    },
    data: demandLabels.map((l) => ({
      name: l.name,
      coord: [l.x, l.y],
      value: l.vol + 'MWh',
    })),
  };

  return <ReactECharts option={option} style={{ height, width: '100%' }} />;
}
