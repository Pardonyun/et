import { PrismaClient } from '@prisma/client';
import { broadcastToMonthlyRoom } from '../socket';

/**
 * 计算实时电量约束
 */
export async function computeConstraints(
  prisma: PrismaClient,
  tradeId: string,
  userId: string,
) {
  const trade = await prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error('交易不存在');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { generatorProfile: { include: { units: true } }, sellerProfile: true },
  });
  if (!user) throw new Error('用户不存在');

  // 获取关联的年度出清结果
  const clearing = await prisma.annualClearingResult.findFirst({
    where: {
      annualTradeId: trade.annualTradeId,
      userId,
    },
  });

  // 获取该月度交易中已成交的买卖量
  const [buyMatches, sellMatches] = await Promise.all([
    prisma.monthlyMatch.findMany({
      where: { tradeId, buyerId: userId },
    }),
    prisma.monthlyMatch.findMany({
      where: { tradeId, sellerId: userId },
    }),
  ]);

  const [buyTransactions, sellTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { tradeId, takerId: userId },
      include: { listing: true },
    }),
    prisma.transaction.findMany({
      where: { tradeId, listing: { userId } },
      include: { listing: true },
    }),
  ]);

  const boughtVolume =
    buyMatches.reduce((s, m) => s + m.volumeMW, 0) +
    buyTransactions.filter(t => t.listing.side === 'SELL').reduce((s, t) => s + t.volumeMW, 0);

  const soldVolume =
    sellMatches.reduce((s, m) => s + m.volumeMW, 0) +
    sellTransactions.filter(t => t.listing.side === 'BUY').reduce((s, t) => s + t.volumeMW, 0);

  let maxBuyVolume = 0;
  let maxSellVolume = 0;

  if (user.role === 'GENERATOR') {
    const totalCapacity = user.generatorProfile!.units.reduce((s, u) => s + u.capacityMW, 0);
    const clearedVolume = clearing?.clearedVolume || 0;
    maxBuyVolume = Math.max(0, clearedVolume - boughtVolume);
    maxSellVolume = Math.max(0, totalCapacity - clearedVolume - soldVolume);
  } else if (user.role === 'SELLER') {
    const totalLoad = user.sellerProfile!.loadMW;
    const clearedVolume = clearing?.clearedVolume || 0;
    maxSellVolume = Math.max(0, clearedVolume - soldVolume);
    maxBuyVolume = Math.max(0, totalLoad - clearedVolume - boughtVolume);
  }

  return {
    maxBuyVolume: Math.round(maxBuyVolume * 100) / 100,
    maxSellVolume: Math.round(maxSellVolume * 100) / 100,
    usedBuyVolume: Math.round(boughtVolume * 100) / 100,
    usedSellVolume: Math.round(soldVolume * 100) / 100,
  };
}

/**
 * 重新计算并推送约束
 */
export async function recomputeConstraints(
  prisma: PrismaClient,
  tradeId: string,
  userId: string,
) {
  const constraints = await computeConstraints(prisma, tradeId, userId);
  broadcastToMonthlyRoom(tradeId, 'monthly:constraints:updated', {
    userId,
    ...constraints,
  });
}
