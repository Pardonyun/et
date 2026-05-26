import { PrismaClient } from '@prisma/client';
import { broadcastToAnnualRoom } from '../socket';

interface Segment {
  volume: number;
  price: number;
}

interface SegmentDetail {
  userId: string;
  companyName: string;
  role: string;
  volume: number;
  price: number;
}

interface Match {
  seller: SegmentDetail;
  buyer: SegmentDetail;
  volume: number;
}

export async function clearAnnualTrade(tradeId: string, prisma: PrismaClient) {
  const bids = await prisma.annualBid.findMany({
    where: { tradeId },
    include: { user: { include: { generatorProfile: true, sellerProfile: true } } },
  });
  if (bids.length === 0) throw new Error('没有报价，无法出清');

  // 1. 展开分段报价
  const sellers: SegmentDetail[] = [];
  const buyers: SegmentDetail[] = [];

  for (const bid of bids) {
    let segments: Segment[];
    try { segments = JSON.parse(bid.segments); } catch { continue; }
    const companyName = bid.user.generatorProfile?.companyName || bid.user.sellerProfile?.companyName || bid.user.username;
    for (const seg of segments) {
      if (seg.volume <= 0) continue;
      const sd: SegmentDetail = { userId: bid.userId, companyName, role: bid.user.role, volume: seg.volume, price: seg.price };
      if (bid.user.role === 'GENERATOR') sellers.push(sd);
      else buyers.push(sd);
    }
  }
  if (sellers.length === 0 || buyers.length === 0) throw new Error('供需双方均需报价才能出清');

  // 2. 卖方价格升序
  sellers.sort((a, b) => a.price - b.price);
  // 3. 买方价格降序
  buyers.sort((a, b) => b.price - a.price);

  // 4. 双指针扫描撮合
  let i = 0, j = 0;
  const matches: Match[] = [];
  let sellerRemaining = sellers.map(s => s.volume);
  let buyerRemaining = buyers.map(b => b.volume);
  let lastSellerIdx = -1;
  let lastBuyerIdx = -1;

  while (i < sellers.length && j < buyers.length) {
    if (buyers[j].price >= sellers[i].price) {
      const vol = Math.min(sellerRemaining[i], buyerRemaining[j]);
      matches.push({ seller: sellers[i], buyer: buyers[j], volume: vol });
      lastSellerIdx = i;
      lastBuyerIdx = j;

      sellerRemaining[i] -= vol;
      buyerRemaining[j] -= vol;

      if (sellerRemaining[i] <= 0) i++;
      if (buyerRemaining[j] <= 0) j++;
    } else {
      break;
    }
  }

  if (matches.length === 0) throw new Error('供需曲线无交点，无法出清');

  // 5. SMP = 边际买卖均价
  const marginalSellerPrice = sellers[lastSellerIdx].price;
  const marginalBuyerPrice = buyers[lastBuyerIdx].price;
  const smp = Math.round(((marginalSellerPrice + marginalBuyerPrice) / 2) * 100) / 100;

  // 6. 汇总每人中标量
  const genMap = new Map<string, { companyName: string; declaredVol: number; clearedVol: number; revenue: number }>();
  const selMap = new Map<string, { companyName: string; declaredVol: number; clearedVol: number; payment: number }>();

  // 先累计申报量
  for (const s of sellers) {
    const m = genMap.get(s.userId);
    if (m) m.declaredVol += s.volume;
    else genMap.set(s.userId, { companyName: s.companyName, declaredVol: s.volume, clearedVol: 0, revenue: 0 });
  }
  for (const b of buyers) {
    const m = selMap.get(b.userId);
    if (m) m.declaredVol += b.volume;
    else selMap.set(b.userId, { companyName: b.companyName, declaredVol: b.volume, clearedVol: 0, payment: 0 });
  }

  // 累计中标量
  for (const match of matches) {
    const gm = genMap.get(match.seller.userId)!;
    gm.clearedVol += match.volume;
    gm.revenue += match.volume * smp;

    const sm = selMap.get(match.buyer.userId)!;
    sm.clearedVol += match.volume;
    sm.payment += match.volume * smp;
  }

  const totalVolume = matches.reduce((s, m) => s + m.volume, 0);

  // 7. 构建曲线数据
  let scum = 0;
  const supplyCurve = sellers.map(s => { scum += s.volume; return { cumVolume: scum, price: s.price, companyName: s.companyName, volume: s.volume }; });
  let dcum = 0;
  const demandCurve = buyers.map(b => { dcum += b.volume; return { cumVolume: dcum, price: b.price, companyName: b.companyName, volume: b.volume }; });

  const genResults = Array.from(genMap.values()).map(r => ({
    ...r,
    clearedVol: Math.round(r.clearedVol * 100) / 100,
    revenue: Math.round(r.revenue * 100) / 100,
  }));
  const selResults = Array.from(selMap.values()).map(r => ({
    ...r,
    clearedVol: Math.round(r.clearedVol * 100) / 100,
    payment: Math.round(r.payment * 100) / 100,
  }));

  // 8. 写入数据库
  await prisma.$transaction(async (tx: any) => {
    await tx.annualTrade.update({ where: { id: tradeId }, data: { status: 'CLEARED', closedAt: new Date() } });
    await tx.annualClearingResult.deleteMany({ where: { annualTradeId: tradeId } });
    for (const [userId, r] of genMap) {
      await tx.annualClearingResult.create({ data: { annualTradeId: tradeId, userId, clearedVolume: Math.round(r.clearedVol * 100) / 100, clearingPrice: smp } });
    }
    for (const [userId, r] of selMap) {
      await tx.annualClearingResult.create({ data: { annualTradeId: tradeId, userId, clearedVolume: Math.round(r.clearedVol * 100) / 100, clearingPrice: smp } });
    }
  });

  const clearingData = {
    clearingPrice: smp,
    clearingVolume: Math.round(totalVolume * 100) / 100,
    supplyCurve: supplyCurve.map(s => ({ cumVolume: Math.round(s.cumVolume * 100) / 100, price: s.price, companyName: s.companyName, volume: s.volume })),
    demandCurve: demandCurve.map(d => ({ cumVolume: Math.round(d.cumVolume * 100) / 100, price: d.price, companyName: d.companyName, volume: d.volume })),
    genResults,
    selResults,
  };

  broadcastToAnnualRoom(tradeId, 'annual:cleared', clearingData);
  return clearingData;
}
