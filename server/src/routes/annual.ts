import { Router, Request, Response } from 'express';
import * as annualService from '../services/annualService';

const router = Router();

// 创建年度交易（交易所）
router.post('/', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const { name, deadlineAt } = req.body;
    if (!name || !deadlineAt) {
      res.status(400).json({ error: '交易名称和截止时间不能为空' });
      return;
    }
    const trade = await annualService.createAnnualTrade({ name, deadlineAt, exchangeId: userId });
    res.json(trade);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取年度交易列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const trades = await annualService.getAnnualTrades(status ? { status } : undefined);
    res.json(trades);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取年度交易详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trade = await annualService.getAnnualTradeDetail(req.params.id);
    if (!trade) { res.status(404).json({ error: '交易不存在' }); return; }
    res.json(trade);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 开始交易（交易所）
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const trade = await annualService.startAnnualTrade(req.params.id, userId);
    res.json(trade);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 关闭交易+出清（交易所）
router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const result = await annualService.closeAnnualTrade(req.params.id, userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取自己的报价
router.get('/:id/my-bid', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const bid = await annualService.getMyBid(req.params.id, userId);
    res.json(bid || null);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 提交/修改整体报价（保留兼容）
router.post('/:id/bid', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const { segments } = req.body;
    const segmentsJson = typeof segments === 'string' ? segments : JSON.stringify(segments);
    const bid = await annualService.submitBid(req.params.id, userId, segmentsJson);
    res.json(bid);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 逐段提交/修改报价
router.post('/:id/bid/segment', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const { index, volume, price } = req.body;
    if (index === undefined || index < 0 || index > 2) {
      res.status(400).json({ error: '段序号必须为0/1/2' }); return;
    }
    const bid = await annualService.submitSegment(req.params.id, userId, index, volume, price);
    res.json(bid);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 撤销某段报价
router.delete('/:id/bid/segment/:index', async (req: Request, res: Response) => {
  try {
    const h = req.headers['x-user-id'];
    const userId = Array.isArray(h) ? h[0] : (h || '');
    const index = parseInt(req.params.index);
    const bid = await annualService.cancelSegment(req.params.id, userId, index);
    res.json(bid);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取出清结果
router.get('/:id/clearing', async (req: Request, res: Response) => {
  try {
    const result = await annualService.getClearingResult(req.params.id);
    if (!result) { res.status(404).json({ error: '该交易尚未出清或不存在' }); return; }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 删除交易（仅交易所）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await annualService.deleteAnnualTrade(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
