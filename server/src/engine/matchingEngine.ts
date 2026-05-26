import { PrismaClient } from '@prisma/client';
import { broadcastToMonthlyRoom } from '../socket';
import { recomputeConstraints } from '../services/constraintService';
import { getTradeCurves } from '../services/monthlyService';

interface Order {
  id: string;
  listingId: string;
  userId: string;
  volume: number;
  price: number;
  side: 'BUY' | 'SELL';
  createdAt: Date;
}

/**
 * 订单簿：按 时间优先 > 价格优先 排序
 * 买盘：时间升序，同时间价高者优先
 * 卖盘：时间升序，同时间价低者优先
 */
class OrderBook {
  bids: Order[] = [];
  asks: Order[] = [];

  addOrder(order: Order) {
    if (order.side === 'BUY') {
      this.bids.push(order);
      this.bids.sort((a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        b.price - a.price
      );
    } else {
      this.asks.push(order);
      this.asks.sort((a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.price - b.price
      );
    }
  }

  removeOrder(listingId: string) {
    this.bids = this.bids.filter((o) => o.listingId !== listingId);
    this.asks = this.asks.filter((o) => o.listingId !== listingId);
  }

  updateOrder(listingId: string, volume: number) {
    for (const o of [...this.bids, ...this.asks]) {
      if (o.listingId === listingId) {
        o.volume = volume;
        break;
      }
    }
    // 移除已清零的订单
    this.bids = this.bids.filter((o) => o.volume > 0);
    this.asks = this.asks.filter((o) => o.volume > 0);
  }

  getAggregatedView() {
    // 按价格档位聚合
    const bidMap = new Map<number, number>();
    for (const o of this.bids) {
      bidMap.set(o.price, (bidMap.get(o.price) || 0) + o.volume);
    }
    const askMap = new Map<number, number>();
    for (const o of this.asks) {
      askMap.set(o.price, (askMap.get(o.price) || 0) + o.volume);
    }

    return {
      bids: Array.from(bidMap.entries())
        .map(([price, volume]) => ({ price, volume }))
        .sort((a, b) => b.price - a.price),
      asks: Array.from(askMap.entries())
        .map(([price, volume]) => ({ price, volume }))
        .sort((a, b) => a.price - b.price),
    };
  }
}

// 全局订单簿: tradeId -> period -> OrderBook
const orderBooks = new Map<string, Map<string, OrderBook>>();

function getOrderBook(tradeId: string, period: string): OrderBook {
  if (!orderBooks.has(tradeId)) {
    orderBooks.set(tradeId, new Map());
  }
  const tradeBooks = orderBooks.get(tradeId)!;
  if (!tradeBooks.has(period)) {
    tradeBooks.set(period, new OrderBook());
  }
  return tradeBooks.get(period)!;
}

export function removeOrderBook(tradeId: string) {
  orderBooks.delete(tradeId);
}

/**
 * 核心撮合逻辑：时间优先 > 价格优先，先挂方价格成交
 */
export async function matchOrder(
  prisma: PrismaClient,
  tradeId: string,
  listingId: string,
  userId: string,
  side: 'BUY' | 'SELL',
  period: string,
  volume: number,
  price: number,
) {
  const ob = getOrderBook(tradeId, period);
  const matchingTime = new Date();

  // 获取对手盘
  const counterparties = side === 'BUY' ? ob.asks : ob.bids;
  const matches: {
    matchId: string;
    counterpartyId: string;
    counterpartyListingId: string;
    matchVolume: number;
    matchPrice: number;
    period: string;
  }[] = [];

  let remaining = volume;

  // 遍历对手盘（已按时间>价格排序）
  for (const cp of counterparties) {
    if (remaining <= 0) break;

    // 检查价格是否可成交
    const canMatch = side === 'BUY'
      ? cp.price <= price  // 买方出价要 >= 卖方要价
      : cp.price >= price; // 卖方要价要 <= 买方出价

    if (!canMatch) continue;

    if (cp.volume <= 0) continue;

    const matchVol = Math.min(remaining, cp.volume);
    if (matchVol <= 0) continue;

    // 先挂方价格 = 对手盘(maker)的价格
    const matchPrice = cp.price;

    // 数据库记录成交
    const match = await prisma.monthlyMatch.create({
      data: {
        tradeId,
        period,
        bidListingId: side === 'BUY' ? listingId : cp.listingId,
        askListingId: side === 'BUY' ? cp.listingId : listingId,
        buyerId: side === 'BUY' ? userId : cp.userId,
        sellerId: side === 'BUY' ? cp.userId : userId,
        volumeMW: matchVol,
        price: matchPrice,
        matchedAt: matchingTime,
      },
    });

    matches.push({
      matchId: match.id,
      counterpartyId: cp.userId,
      counterpartyListingId: cp.listingId,
      matchVolume: matchVol,
      matchPrice,
      period,
    });

    // 更新挂牌剩余量
    await prisma.monthlyListing.update({
      where: { id: cp.listingId },
      data: {
        remainingMW: { decrement: matchVol },
        status: cp.volume - matchVol <= 0 ? 'FILLED' : 'PARTIALLY_FILLED',
      },
    });

    // 更新对手盘内存
    cp.volume -= matchVol;
    remaining -= matchVol;
  }

  // 清理已清零的对手盘
  ob.bids = ob.bids.filter((o) => o.volume > 0);
  ob.asks = ob.asks.filter((o) => o.volume > 0);

  // 如果新订单还有剩余，加入订单簿
  if (remaining > 0) {
    ob.addOrder({
      id: `${listingId}_${Date.now()}`,
      listingId,
      userId,
      volume: remaining,
      price,
      side,
      createdAt: matchingTime,
    });

    // 更新挂牌剩余量
    await prisma.monthlyListing.update({
      where: { id: listingId },
      data: { remainingMW: remaining, status: 'PARTIALLY_FILLED' },
    });
  } else {
    await prisma.monthlyListing.update({
      where: { id: listingId },
      data: { remainingMW: 0, status: 'FILLED' },
    });
  }

  // 推送成交通知给相关方
  for (const m of matches) {
    broadcastToMonthlyRoom(tradeId, 'monthly:match:new', {
      matchId: m.matchId,
      buyerId: side === 'BUY' ? userId : m.counterpartyId,
      sellerId: side === 'BUY' ? m.counterpartyId : userId,
      volumeMW: m.matchVolume,
      price: m.matchPrice,
      period: m.period,
      matchedAt: matchingTime.toISOString(),
    });

    // 更新约束
    await recomputeConstraints(prisma, tradeId, side === 'BUY' ? userId : m.counterpartyId);
    await recomputeConstraints(prisma, tradeId, side === 'BUY' ? m.counterpartyId : userId);
  }

  // 广播更新后的订单簿聚合视图
  broadcastOrderBookUpdate(tradeId, period);

  // 广播成交曲线更新
  getTradeCurves(tradeId).then((curves) => {
    broadcastToMonthlyRoom(tradeId, 'monthly:curves:updated', curves);
  });

  return { matches, remainingInBook: remaining };
}

/**
 * 摘牌操作：taker 直接摘取 maker 的挂单
 */
export async function takeListing(
  prisma: PrismaClient,
  tradeId: string,
  listingId: string,
  takerId: string,
  volume: number,
) {
  const listing = await prisma.monthlyListing.findUnique({
    where: { id: listingId },
    include: { user: true },
  });

  if (!listing) throw new Error('挂牌不存在');
  if (listing.userId === takerId) throw new Error('不能摘自己的挂牌');
  if (listing.remainingMW < volume) throw new Error('摘牌量超过挂牌剩余量');

  const transaction = await prisma.transaction.create({
    data: {
      tradeId,
      listingId,
      takerId,
      volumeMW: volume,
      price: listing.price,
    },
  });

  const newRemaining = listing.remainingMW - volume;
  await prisma.monthlyListing.update({
    where: { id: listingId },
    data: {
      remainingMW: newRemaining,
      status: newRemaining <= 0 ? 'FILLED' : 'PARTIALLY_FILLED',
    },
  });

  // 从订单簿中移除/更新
  const ob = getOrderBook(tradeId, listing.period);
  if (newRemaining <= 0) {
    ob.removeOrder(listingId);
  } else {
    ob.updateOrder(listingId, newRemaining);
  }

  // 更新双方约束
  await recomputeConstraints(prisma, tradeId, takerId);
  await recomputeConstraints(prisma, tradeId, listing.userId);

  // 双方 + 交易所可见
  broadcastToMonthlyRoom(tradeId, 'monthly:transaction:new', {
    transactionId: transaction.id,
    listingId,
    takerId,
    makerId: listing.userId,
    volumeMW: volume,
    price: listing.price,
    createdAt: transaction.createdAt.toISOString(),
  });

  broadcastToMonthlyRoom(tradeId, 'monthly:listing:updated', {
    listingId,
    remainingMW: newRemaining,
    status: newRemaining <= 0 ? 'FILLED' : 'PARTIALLY_FILLED',
  });

  broadcastOrderBookUpdate(tradeId, listing.period);

  getTradeCurves(tradeId).then((curves) => {
    broadcastToMonthlyRoom(tradeId, 'monthly:curves:updated', curves);
  });

  return transaction;
}

function broadcastOrderBookUpdate(tradeId: string, period: string) {
  const ob = getOrderBook(tradeId, period);
  broadcastToMonthlyRoom(tradeId, 'monthly:orderbook:updated', {
    period,
    ...ob.getAggregatedView(),
  });
}

export { getOrderBook };
