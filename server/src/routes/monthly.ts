import { Router, Request, Response } from 'express';
import * as monthlyService from '../services/monthlyService';

const router = Router();

function getUserId(req: Request): string {
  const h = req.headers['x-user-id'];
  return Array.isArray(h) ? h[0] : (h || '');
}

async function requireNotExchange(req: Request, res: Response): Promise<boolean> {
  const prisma = require('../prisma/client').default;
  const userId = getUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role === 'EXCHANGE') {
    res.status(403).json({ error: '电力交易所不能进行挂摘牌操作' });
    return false;
  }
  return true;
}

// 创建月度交易
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, annualTradeId } = req.body;
    if (!name || !annualTradeId) {
      res.status(400).json({ error: '交易名称和关联年度交易不能为空' });
      return;
    }
    const trade = await monthlyService.createMonthlyTrade({
      name, annualTradeId, exchangeId: getUserId(req),
    });
    res.json(trade);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取月度交易列表
router.get('/', async (_req: Request, res: Response) => {
  try {
    const trades = await monthlyService.getMonthlyTrades();
    res.json(trades);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取月度交易详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const prisma = require('../prisma/client').default;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const trade = await monthlyService.getMonthlyTradeDetail(req.params.id, userId, user?.role || '');
    if (!trade) { res.status(404).json({ error: '交易不存在' }); return; }
    res.json(trade);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 开始交易
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const trade = await monthlyService.startMonthlyTrade(req.params.id);
    res.json(trade);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 推进下一阶段
router.post('/:id/next-phase', async (req: Request, res: Response) => {
  try {
    const trade = await monthlyService.advanceMonthlyPhase(req.params.id);
    res.json(trade);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取挂牌列表
router.get('/:id/listings', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const prisma = require('../prisma/client').default;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const listings = await monthlyService.getListingsForTrade(req.params.id, userId, user?.role || '');
    res.json(listings);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 创建挂牌
router.post('/:id/listings', async (req: Request, res: Response) => {
  try {
    if (!(await requireNotExchange(req, res))) return;
    const { side, period, volumeMW, price } = req.body;
    const listing = await monthlyService.createListing({
      tradeId: req.params.id,
      userId: getUserId(req),
      side, period, volumeMW, price,
    });
    res.json(listing);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 修改挂牌
router.put('/:id/listings/:lid', async (req: Request, res: Response) => {
  try {
    if (!(await requireNotExchange(req, res))) return;
    const { price, volumeMW } = req.body;
    const listing = await monthlyService.modifyListing(req.params.lid, getUserId(req), { price, volumeMW });
    res.json(listing);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 撤销挂牌
router.delete('/:id/listings/:lid', async (req: Request, res: Response) => {
  try {
    if (!(await requireNotExchange(req, res))) return;
    const listing = await monthlyService.cancelListing(req.params.lid, getUserId(req));
    res.json(listing);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 摘牌
router.post('/:id/listings/:lid/take', async (req: Request, res: Response) => {
  try {
    if (!(await requireNotExchange(req, res))) return;
    const { volume } = req.body;
    const result = await monthlyService.takeListingAction(req.params.lid, getUserId(req), volume);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取撮合成交
router.get('/:id/matches', async (req: Request, res: Response) => {
  try {
    const matches = await monthlyService.getMonthlyMatches(req.params.id);
    res.json(matches);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取摘牌成交
router.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await monthlyService.getMonthlyTransactions(req.params.id);
    res.json(transactions);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取当前约束
router.get('/:id/constraints', async (req: Request, res: Response) => {
  try {
    const { computeConstraints } = require('../services/constraintService');
    const prisma = require('../prisma/client').default;
    const constraints = await computeConstraints(prisma, req.params.id, getUserId(req));
    res.json(constraints);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 获取成交曲线数据
router.get('/:id/curves', async (req: Request, res: Response) => {
  try {
    const curves = await monthlyService.getTradeCurves(req.params.id);
    res.json(curves);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 删除月度交易（仅交易所）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await monthlyService.deleteMonthlyTrade(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
