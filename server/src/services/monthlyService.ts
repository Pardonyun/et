import { PrismaClient } from '@prisma/client';
import { startMatchingPhase, advancePhase } from '../engine/phaseScheduler';
import { computeConstraints } from './constraintService';
import { matchOrder, takeListing } from '../engine/matchingEngine';
import { broadcastToMonthlyRoom } from '../socket';

const prisma = new PrismaClient();

export async function deleteMonthlyTrade(tradeId: string) {
  const trade = await prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error('交易不存在');
  if (trade.status === 'ACTIVE') throw new Error('进行中的交易不能删除');

  await prisma.$transaction(async (tx: any) => {
    await tx.transaction.deleteMany({ where: { tradeId } });
    await tx.monthlyMatch.deleteMany({ where: { tradeId } });
    await tx.monthlyListing.deleteMany({ where: { tradeId } });
    await tx.monthlyTrade.delete({ where: { id: tradeId } });
  });
  broadcastToMonthlyRoom(tradeId, 'monthly:deleted', { tradeId });
}

export async function createMonthlyTrade(data: {
  name: string;
  annualTradeId: string;
  exchangeId: string;
}) {
  // 验证年度交易已出清
  const annualTrade = await prisma.annualTrade.findUnique({
    where: { id: data.annualTradeId },
  });
  if (!annualTrade || annualTrade.status !== 'CLEARED') {
    throw new Error('只能基于已出清的年度交易创建月度交易');
  }

  return prisma.monthlyTrade.create({
    data: {
      name: data.name,
      exchangeId: data.exchangeId,
      annualTradeId: data.annualTradeId,
    },
  });
}

export async function startMonthlyTrade(tradeId: string) {
  await startMatchingPhase(prisma, tradeId);
  return prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
}

export async function advanceMonthlyPhase(tradeId: string) {
  await advancePhase(prisma, tradeId);
  return prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
}

export async function getMonthlyTrades() {
  return prisma.monthlyTrade.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMonthlyTradeDetail(tradeId: string, userId: string, role: string) {
  const trade = await prisma.monthlyTrade.findUnique({
    where: { id: tradeId },
    include: {
      listings: role === 'EXCHANGE' ? {
        include: { user: { select: { username: true, id: true } } },
      } : {
        where: { userId },
        include: { user: { select: { username: true, id: true } } },
      },
      matches: {
        include: {
          bidListing: { include: { user: { select: { username: true } } } },
          askListing: { include: { user: { select: { username: true } } } },
        },
        orderBy: { matchedAt: 'desc' },
        take: 100,
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });

  return trade;
}

export async function createListing(data: {
  tradeId: string;
  userId: string;
  side: 'BUY' | 'SELL';
  period: string;
  volumeMW: number;
  price: number;
}) {
  const trade = await prisma.monthlyTrade.findUnique({ where: { id: data.tradeId } });
  if (!trade || trade.status !== 'ACTIVE') {
    throw new Error('该交易当前不在活动中');
  }

  // 检查约束
  const constraints = await computeConstraints(prisma, data.tradeId, data.userId);
  if (data.side === 'BUY' && data.volumeMW > constraints.maxBuyVolume) {
    throw new Error(`可挂牌买电量不足，当前最多可买 ${constraints.maxBuyVolume} MW`);
  }
  if (data.side === 'SELL' && data.volumeMW > constraints.maxSellVolume) {
    throw new Error(`可挂牌卖电量不足，当前最多可卖 ${constraints.maxSellVolume} MW`);
  }

  const listing = await prisma.monthlyListing.create({
    data: {
      tradeId: data.tradeId,
      userId: data.userId,
      side: data.side,
      period: data.period,
      volumeMW: data.volumeMW,
      remainingMW: data.volumeMW,
      price: data.price,
    },
  });

  // 如果在撮合阶段，立即进入撮合引擎
  if (trade.phase === 'MATCHING') {
    await matchOrder(
      prisma,
      data.tradeId,
      listing.id,
      data.userId,
      data.side,
      data.period,
      data.volumeMW,
      data.price,
    );
  }

  // 广播挂牌更新
  broadcastToMonthlyRoom(data.tradeId, 'monthly:listing:updated', {
    listing,
  });

  // 推送约束更新
  const updatedConstraints = await computeConstraints(prisma, data.tradeId, data.userId);
  broadcastToMonthlyRoom(data.tradeId, 'monthly:constraints:updated', {
    userId: data.userId,
    ...updatedConstraints,
  });

  return listing;
}

export async function modifyListing(listingId: string, userId: string, data: {
  price?: number;
  volumeMW?: number;
}) {
  const listing = await prisma.monthlyListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error('挂牌不存在');
  if (listing.userId !== userId) throw new Error('无权修改他人挂牌');
  if (listing.status === 'FILLED' || listing.status === 'CANCELLED') {
    throw new Error('该挂牌已成交或已撤销，无法修改');
  }

  const trade = await prisma.monthlyTrade.findUnique({
    where: { id: listing.tradeId },
  });
  if (trade?.phase !== 'NEGOTIATION') {
    throw new Error('仅手动摘牌阶段可修改挂牌');
  }

  const updated = await prisma.monthlyListing.update({
    where: { id: listingId },
    data: {
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.volumeMW !== undefined ? {
        volumeMW: data.volumeMW,
        remainingMW: data.volumeMW - (listing.volumeMW - listing.remainingMW),
      } : {}),
    },
  });

  broadcastToMonthlyRoom(listing.tradeId, 'monthly:listing:updated', { listing: updated });

  return updated;
}

export async function cancelListing(listingId: string, userId: string) {
  const listing = await prisma.monthlyListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error('挂牌不存在');
  if (listing.userId !== userId) throw new Error('无权撤销他人挂牌');

  const trade = await prisma.monthlyTrade.findUnique({ where: { id: listing.tradeId } });
  if (trade?.phase !== 'NEGOTIATION') {
    throw new Error('仅手动摘牌阶段可撤销挂牌');
  }

  const updated = await prisma.monthlyListing.update({
    where: { id: listingId },
    data: { status: 'CANCELLED', remainingMW: 0 },
  });

  broadcastToMonthlyRoom(listing.tradeId, 'monthly:listing:updated', { listing: updated });

  // 更新约束
  const { recomputeConstraints } = require('./constraintService');
  await recomputeConstraints(prisma, listing.tradeId, userId);

  return updated;
}

export async function takeListingAction(listingId: string, takerId: string, volume: number) {
  const listing = await prisma.monthlyListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error('挂牌不存在');

  const trade = await prisma.monthlyTrade.findUnique({ where: { id: listing.tradeId } });
  if (!trade || trade.phase !== 'NEGOTIATION') {
    throw new Error('仅手动摘牌阶段可摘牌');
  }

  return takeListing(prisma, listing.tradeId, listingId, takerId, volume);
}

export async function getListingsForTrade(tradeId: string, userId: string, role: string) {
  const where: any = { tradeId };
  if (role !== 'EXCHANGE') {
    // 在手动摘牌阶段，发电/售电可看到所有未成交挂牌
    const trade = await prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
    if (trade?.phase === 'NEGOTIATION') {
      where.status = { in: ['ACTIVE', 'PARTIALLY_FILLED'] };
    } else {
      where.userId = userId;
    }
  }

  return prisma.monthlyListing.findMany({
    where,
    include: { user: { select: { username: true, id: true } } },
    orderBy: [{ side: 'asc' }, { price: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getMonthlyMatches(tradeId: string) {
  return prisma.monthlyMatch.findMany({
    where: { tradeId },
    include: {
      bidListing: { include: { user: { select: { username: true } } } },
      askListing: { include: { user: { select: { username: true } } } },
    },
    orderBy: { matchedAt: 'desc' },
  });
}

export async function getMonthlyTransactions(tradeId: string) {
  return prisma.transaction.findMany({
    where: { tradeId },
    include: {
      listing: { include: { user: { select: { username: true } } } },
      taker: { select: { username: true, id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTradeCurves(tradeId: string) {
  const [matches, transactions] = await Promise.all([
    prisma.monthlyMatch.findMany({
      where: { tradeId },
      include: {
        bidListing: { include: { user: { select: { username: true } } } },
        askListing: { include: { user: { select: { username: true } } } },
      },
      orderBy: { matchedAt: 'asc' },
    }),
    prisma.transaction.findMany({
      where: { tradeId },
      include: {
        listing: { include: { user: { select: { username: true } } } },
        taker: { select: { username: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // 合并并按时段分组
  interface CurvePoint { time: string; price: number; volume: number; type: string; buyer: string; seller: string; }
  const curves: Record<string, { pricePoints: [string, number][]; volumePoints: [string, number][] }> = {};

  for (const m of matches) {
    const period = m.period;
    if (!curves[period]) curves[period] = { pricePoints: [], volumePoints: [] };
    const t = m.matchedAt.toISOString();
    curves[period].pricePoints.push([t, m.price]);
    curves[period].volumePoints.push([t, m.volumeMW]);
  }

  for (const t of transactions) {
    const period = t.listing.period;
    if (!curves[period]) curves[period] = { pricePoints: [], volumePoints: [] };
    const ct = t.createdAt.toISOString();
    curves[period].pricePoints.push([ct, t.price]);
    curves[period].volumePoints.push([ct, t.volumeMW]);
  }

  return curves;
}
