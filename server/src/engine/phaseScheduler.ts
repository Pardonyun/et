import { PrismaClient } from '@prisma/client';
import { broadcastToMonthlyRoom } from '../socket';

const phaseTimers = new Map<string, NodeJS.Timeout>();
const tickIntervals = new Map<string, NodeJS.Timeout>();

export async function startMatchingPhase(prisma: PrismaClient, tradeId: string) {
  clearPhaseTimer(tradeId);
  const phaseEndsAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.monthlyTrade.update({
    where: { id: tradeId },
    data: {
      status: 'ACTIVE',
      phase: 'MATCHING',
      phaseStartedAt: new Date(),
      phaseEndsAt,
    },
  });

  // 加载已有的挂牌到订单簿
  const listings = await prisma.monthlyListing.findMany({
    where: { tradeId, status: { in: ['ACTIVE', 'PARTIALLY_FILLED'] } },
  });
  const { getOrderBook } = require('./matchingEngine');
  for (const l of listings) {
    const ob = getOrderBook(tradeId, l.period);
    ob.addOrder({
      id: `init_${l.id}`, listingId: l.id, userId: l.userId,
      volume: l.remainingMW, price: l.price,
      side: l.side as 'BUY' | 'SELL', createdAt: l.createdAt,
    });
  }

  broadcastToMonthlyRoom(tradeId, 'monthly:status', { tradeId, status: 'ACTIVE', phase: 'MATCHING', phaseEndsAt: phaseEndsAt.toISOString() });
  startTicking(tradeId, phaseEndsAt);

  const timer = setTimeout(() => { startNegotiationPhase(prisma, tradeId); }, 5 * 60 * 1000);
  phaseTimers.set(tradeId, timer);
}

export async function startNegotiationPhase(prisma: PrismaClient, tradeId: string) {
  clearPhaseTimer(tradeId);
  await prisma.monthlyTrade.update({ where: { id: tradeId }, data: { phase: 'NEGOTIATION', phaseStartedAt: new Date(), phaseEndsAt: null } });

  const listings = await prisma.monthlyListing.findMany({
    where: { tradeId, status: { in: ['ACTIVE', 'PARTIALLY_FILLED'] } },
    include: { user: { select: { username: true, id: true } } },
  });
  for (const l of listings) {
    broadcastToMonthlyRoom(tradeId, 'monthly:listing:public', {
      id: l.id, userId: l.userId, username: l.user.username,
      side: l.side, period: l.period, volumeMW: l.volumeMW,
      remainingMW: l.remainingMW, price: l.price, status: l.status,
    });
  }

  broadcastToMonthlyRoom(tradeId, 'monthly:status', { tradeId, status: 'ACTIVE', phase: 'NEGOTIATION', phaseEndsAt: null });
  clearTicking(tradeId);
}

export async function advancePhase(prisma: PrismaClient, tradeId: string) {
  const trade = await prisma.monthlyTrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error('交易不存在');

  switch (trade.phase) {
    case 'MATCHING':
      await startNegotiationPhase(prisma, tradeId);
      break;
    case 'NEGOTIATION':
      await closeMonthlyTrade(prisma, tradeId);
      break;
    default:
      throw new Error('当前阶段无法推进');
  }
}

export async function closeMonthlyTrade(prisma: PrismaClient, tradeId: string) {
  clearPhaseTimer(tradeId);
  clearTicking(tradeId);
  await prisma.monthlyTrade.update({ where: { id: tradeId }, data: { status: 'CLOSED', phase: 'CLOSED', closedAt: new Date() } });
  const { removeOrderBook } = require('./matchingEngine');
  removeOrderBook(tradeId);
  broadcastToMonthlyRoom(tradeId, 'monthly:status', { tradeId, status: 'CLOSED', phase: 'CLOSED' });
}

function startTicking(tradeId: string, phaseEndsAt: Date) {
  clearTicking(tradeId);
  const interval = setInterval(() => {
    const remaining = Math.max(0, Math.floor((phaseEndsAt.getTime() - Date.now()) / 1000));
    broadcastToMonthlyRoom(tradeId, 'monthly:phase:tick', { tradeId, remainingSeconds: remaining });
    if (remaining <= 0) clearTicking(tradeId);
  }, 1000);
  tickIntervals.set(tradeId, interval);
}

function clearTicking(tradeId: string) {
  const interval = tickIntervals.get(tradeId);
  if (interval) { clearInterval(interval); tickIntervals.delete(tradeId); }
}

function clearPhaseTimer(tradeId: string) {
  const timer = phaseTimers.get(tradeId);
  if (timer) { clearTimeout(timer); phaseTimers.delete(tradeId); }
}
