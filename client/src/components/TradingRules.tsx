import React from 'react';
import { Collapse, Typography, Tag } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export function AnnualTradingRules() {
  return (
    <Collapse
      style={{ background: '#FAFCFF', borderColor: '#D6E8FA' }}
      items={[
        {
          key: '1',
          label: <><InfoCircleOutlined style={{ color: '#4A90D9' }} /> 年度集中竞价交易规则</>,
          children: (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <Paragraph>
                <Tag color="blue">1. 报价阶段</Tag>
                发电公司提交供电数量和对应价格的发电报价，售电公司提交包含量价信息的投标。每个公司最多可提交<Text strong>3段报量报价</Text>，在交易时限内可随时修改，仅能查看自己的报价。
              </Paragraph>
              <Paragraph>
                <Tag color="blue">2. 形成供需曲线</Tag>
                发电报价按价格<Text strong>从低到高</Text>排列，形成供给曲线；售电投标按价格<Text strong>从高到低</Text>排列，形成需求曲线。
              </Paragraph>
              <Paragraph>
                <Tag color="blue">3. 市场均衡</Tag>
                市场均衡点为供给曲线和需求曲线的<Text strong>交点</Text>。所有价格低于或等于市场出清价的发电报价都会被接受，所有价格高于或等于市场出清价的售电投标也都会被接受。
              </Paragraph>
              <Paragraph>
                <Tag color="blue">4. 统一结算</Tag>
                市场出清价即为<Text strong>系统边际价</Text>，表示新增单位电能的价格。发电公司以系统边际价出售全部中标电能，售电公司以系统边际价购买所需电能。
              </Paragraph>
            </div>
          ),
        },
      ]}
    />
  );
}

export function MonthlyTradingRules() {
  return (
    <Collapse
      style={{ background: '#FAFCFF', borderColor: '#D6E8FA' }}
      items={[
        {
          key: '1',
          label: <><InfoCircleOutlined style={{ color: '#FAAD14' }} /> 月度滚动撮合交易规则</>,
          children: (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <Paragraph>
                <Tag color="gold">时段划分</Tag>
                一天24小时分为三个时段：
                <Text strong>峰时段</Text> 8:00-12:00, 17:00-21:00；
                <Text strong>平时段</Text> 12:00-17:00, 21:00-24:00；
                <Text strong>谷时段</Text> 0:00-8:00。
              </Paragraph>
              <Paragraph>
                <Tag color="gold">阶段一：自动撮合（5分钟）</Tag>
                系统依据<Text strong>时间优先、价格优先</Text>的原则实时滚动撮合成交，按<Text strong>先挂方价格</Text>成交。买卖双方均可主动挂牌（发布售/购要约），挂牌电量受年度集中交易出清结果的约束。新挂牌实时进入撮合队列（连续竞价模式）。
              </Paragraph>
              <Paragraph>
                <Tag color="gold">阶段二：手动摘牌挂牌</Tag>
                自动撮合阶段未成交的挂牌记录自动进入该阶段。允许双方根据需求多次、自主地进行挂牌和摘牌操作。交易信息实时公开，未摘挂牌可修改和撤销。
              </Paragraph>
              <Paragraph>
                <Tag color="gold">成交规则</Tag>
                撮合优先级：<Text strong>时间优先 &gt; 价格优先</Text>（先提交的订单优先匹配，同等时间下买盘价高者优先 / 卖盘价低者优先）。成交价 = <Text strong>先挂方价格</Text>。
              </Paragraph>
            </div>
          ),
        },
      ]}
    />
  );
}
