import prisma from '../prisma/client';
import { clearAnnualTrade } from '../engine/clearingEngine';
import { broadcastToAnnualRoom } from '../socket';

export async function deleteAnnualTrade(tradeId: string) {
  const trade = await prisma.annualTrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error('交易不存在');
  if (trade.status === 'OPEN') throw new Error('进行中的交易不能删除，请先结束');

  await prisma.$transaction(async (tx: any) => {
    await tx.annualClearingResult.deleteMany({ where: { annualTradeId: tradeId } });
    await tx.annualBid.deleteMany({ where: { tradeId } });
    await tx.annualTrade.delete({ where: { id: tradeId } });
  });
  broadcastToAnnualRoom(tradeId, 'annual:deleted', { tradeId });
}

export async function createAnnualTrade(data: { name: string; deadlineAt: string; exchangeId: string }) {
  return prisma.annualTrade.create({
    data: {
      name: data.name,
      exchangeId: data.exchangeId,
      deadlineAt: new Date(data.deadlineAt),
      status: 'PENDING',
    },
  });
}

export async function startAnnualTrade(tradeId: string, _userId: string) {
  const trade = await prisma.annualTrade.update({
    where: { id: tradeId },
    data: { status: 'OPEN', startedAt: new Date() },
  });
  broadcastToAnnualRoom(tradeId, 'annual:status', {
    tradeId,
    status: 'OPEN',
    deadlineAt: trade.deadlineAt?.toISOString(),
  });
  return trade;
}

export async function closeAnnualTrade(tradeId: string, _userId: string) {
  const trade = await prisma.annualTrade.update({
    where: { id: tradeId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  // 自动执行出清
  try {
    const result = await clearAnnualTrade(tradeId, prisma);
    return { trade, clearing: result };
  } catch (err: any) {
    // 出清失败，回滚状态
    await prisma.annualTrade.update({
      where: { id: tradeId },
      data: { status: 'OPEN', closedAt: null },
    });
    throw err;
  }
}

export async function getAnnualTrades(params?: { status?: string }) {
  const where: any = {};
  if (params?.status) where.status = params.status;

  return prisma.annualTrade.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { bids: true } },
    },
  });
}

export async function getAnnualTradeDetail(tradeId: string) {
  return prisma.annualTrade.findUnique({
    where: { id: tradeId },
    include: {
      bids: { include: { user: { include: { generatorProfile: true, sellerProfile: true } } } },
      clearingResults: { include: { user: { include: { generatorProfile: true, sellerProfile: true } } } },
    },
  });
}

export async function getMyBid(tradeId: string, userId: string) {
  return prisma.annualBid.findUnique({
    where: { tradeId_userId: { tradeId, userId } },
  });
}

export async function submitBid(tradeId: string, userId: string, segmentsJson: string) {
  // 验证 segments 格式
  let segments: any[];
  try {
    segments = JSON.parse(segmentsJson);
    if (!Array.isArray(segments) || segments.length === 0 || segments.length > 3) {
      throw new Error('报量报价需要1~3段');
    }
    for (const seg of segments) {
      if (typeof seg.volume !== 'number' || typeof seg.price !== 'number') {
        throw new Error('报价格式错误');
      }
      if (seg.volume <= 0 || seg.price < 0) {
        throw new Error('电量和价格必须为正数');
      }
    }
  } catch (err: any) {
    if (err.message.includes('报量报价') || err.message.includes('电量和价格')) throw err;
    throw new Error('报价JSON格式错误');
  }

  // 只允许 OPEN 状态的交易投稿
  const trade = await prisma.annualTrade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.status !== 'OPEN') {
    throw new Error('该交易当前不在报价阶段');
  }

  // UPSERT：每人每个交易只能有一条报价记录
  const bid = await prisma.annualBid.upsert({
    where: { tradeId_userId: { tradeId, userId } },
    update: { segments: segmentsJson, submittedAt: new Date() },
    create: { tradeId, userId, segments: segmentsJson },
  });

  broadcastToAnnualRoom(tradeId, 'annual:bid:updated', {
    tradeId,
    userId,
    segments: JSON.parse(segmentsJson),
    submittedAt: bid.submittedAt.toISOString(),
  });

  return bid;
}

export async function submitSegment(
  tradeId: string, userId: string, index: number, volume: number, price: number,
) {
  const trade = await prisma.annualTrade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.status !== 'OPEN') throw new Error('该交易当前不在报价阶段');

  // 检查总量约束
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { generatorProfile: { include: { units: true } }, sellerProfile: true },
  });
  if (!user) throw new Error('用户不存在');

  // 获取已有报价
  let existing = await prisma.annualBid.findUnique({ where: { tradeId_userId: { tradeId, userId } } });
  let segments: { volume: number; price: number }[] = [];
  if (existing) {
    try { segments = JSON.parse(existing.segments); } catch { segments = []; }
    // 确保数组有3个槽位
    while (segments.length < 3) segments.push({ volume: 0, price: 0 });
  } else {
    segments = [{ volume: 0, price: 0 }, { volume: 0, price: 0 }, { volume: 0, price: 0 }];
  }

  // 替换指定段
  segments[index] = { volume, price };

  // 过滤掉空段
  const activeSegments = segments.filter((s) => s.volume > 0);

  // 检查总容量约束
  const totalVolume = activeSegments.reduce((s, seg) => s + seg.volume, 0);
  if (user.role === 'GENERATOR') {
    const totalCapacity = user.generatorProfile!.units.reduce((s, u) => s + u.capacityMW, 0);
    if (totalVolume > totalCapacity) {
      throw new Error(`报量总数 ${totalVolume}MW 超过总装机容量 ${totalCapacity}MW`);
    }
  } else if (user.role === 'SELLER') {
    const totalLoad = user.sellerProfile!.loadMW;
    if (totalVolume > totalLoad) {
      throw new Error(`报量总数 ${totalVolume}MW 超过总负荷 ${totalLoad}MW`);
    }
  }

  if (activeSegments.length > 3) throw new Error('最多3段报量报价');

  const segmentsJson = JSON.stringify(activeSegments);

  const bid = await prisma.annualBid.upsert({
    where: { tradeId_userId: { tradeId, userId } },
    update: { segments: segmentsJson, submittedAt: new Date() },
    create: { tradeId, userId, segments: segmentsJson },
  });

  broadcastToAnnualRoom(tradeId, 'annual:bid:updated', {
    tradeId, userId,
    segments: activeSegments,
    submittedAt: bid.submittedAt.toISOString(),
  });

  return bid;
}

export async function cancelSegment(tradeId: string, userId: string, index: number) {
  const trade = await prisma.annualTrade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.status !== 'OPEN') throw new Error('该交易当前不在报价阶段');

  const existing = await prisma.annualBid.findUnique({ where: { tradeId_userId: { tradeId, userId } } });
  if (!existing) throw new Error('没有已提交的报价');

  let segments: { volume: number; price: number }[];
  try { segments = JSON.parse(existing.segments); } catch { segments = []; }

  if (index >= segments.length) throw new Error('该段没有报价');

  segments.splice(index, 1);

  if (segments.length === 0) {
    // 全部撤销，删除报价记录
    await prisma.annualBid.delete({ where: { tradeId_userId: { tradeId, userId } } });
    broadcastToAnnualRoom(tradeId, 'annual:bid:cancelled', { tradeId, userId });
    return null;
  }

  const segmentsJson = JSON.stringify(segments);
  const bid = await prisma.annualBid.update({
    where: { tradeId_userId: { tradeId, userId } },
    data: { segments: segmentsJson, submittedAt: new Date() },
  });

  broadcastToAnnualRoom(tradeId, 'annual:bid:updated', {
    tradeId, userId,
    segments,
    submittedAt: bid.submittedAt.toISOString(),
  });

  return bid;
}

export async function getClearingResult(tradeId: string) {
  const trade = await prisma.annualTrade.findUnique({
    where: { id: tradeId },
    include: {
      clearingResults: {
        include: {
          user: {
            include: { generatorProfile: true, sellerProfile: true },
          },
        },
      },
      bids: {
        include: {
          user: {
            include: { generatorProfile: true, sellerProfile: true },
          },
        },
      },
    },
  });

  if (!trade || trade.status !== 'CLEARED') {
    return null;
  }

  // 重建曲线数据（含公司名和段信息）
  const genSegments: { userId: string; companyName: string; volume: number; price: number }[] = [];
  const selSegments: { userId: string; companyName: string; volume: number; price: number }[] = [];

  for (const bid of trade.bids) {
    let segments: any[];
    try { segments = JSON.parse(bid.segments); } catch { continue; }
    const name = bid.user.generatorProfile?.companyName || bid.user.sellerProfile?.companyName || bid.user.username;
    for (const seg of segments) {
      if (seg.volume <= 0) continue;
      const sd = { userId: bid.userId, companyName: name, volume: seg.volume, price: seg.price };
      if (bid.user.role === 'GENERATOR') genSegments.push(sd);
      else selSegments.push(sd);
    }
  }

  genSegments.sort((a, b) => a.price - b.price);
  selSegments.sort((a, b) => b.price - a.price);

  const supplyCurve: { cumVolume: number; price: number; companyName: string; volume: number }[] = [];
  let scum = 0;
  for (const g of genSegments) { scum += g.volume; supplyCurve.push({ cumVolume: scum, price: g.price, companyName: g.companyName, volume: g.volume }); }

  const demandCurve: { cumVolume: number; price: number; companyName: string; volume: number }[] = [];
  let dcum = 0;
  for (const s of selSegments) { dcum += s.volume; demandCurve.push({ cumVolume: dcum, price: s.price, companyName: s.companyName, volume: s.volume }); }

  // 分离发电/售电结果
  const genResults = trade.clearingResults
    .filter((r) => r.user.role === 'GENERATOR')
    .map((r) => {
      // 找到该用户的总申报量
      const declared = genSegments.filter((g) => g.userId === r.userId).reduce((s, g) => s + g.volume, 0);
      return {
        userId: r.userId,
        companyName: r.user.generatorProfile?.companyName || r.user.username,
        price: genSegments.find((g) => g.userId === r.userId)?.price || 0,
        declaredVol: declared,
        clearedVol: r.clearedVolume,
        revenue: Math.round(r.clearedVolume * r.clearingPrice * 100) / 100,
      };
    });

  const selResults = trade.clearingResults
    .filter((r) => r.user.role === 'SELLER')
    .map((r) => {
      const declared = selSegments.filter((s) => s.userId === r.userId).reduce((s, sel) => s + sel.volume, 0);
      return {
        userId: r.userId,
        companyName: r.user.sellerProfile?.companyName || r.user.username,
        price: selSegments.find((s) => s.userId === r.userId)?.price || 0,
        declaredVol: declared,
        clearedVol: r.clearedVolume,
        payment: Math.round(r.clearedVolume * r.clearingPrice * 100) / 100,
      };
    });

  const clearingPrice = trade.clearingResults[0]?.clearingPrice || 0;
  const clearingVolume = genResults.reduce((s, r) => s + r.clearedVol, 0);

  return {
    clearingPrice,
    clearingVolume,
    supplyCurve,
    demandCurve,
    genResults,
    selResults,
  };
}
