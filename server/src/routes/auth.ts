import { Router, Request, Response } from 'express';
import * as authService from '../services/authService';

const router = Router();

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, role, companyName, loadMW, units } = req.body;
    if (!username || !role) {
      res.status(400).json({ error: '账号和角色不能为空' });
      return;
    }
    if (!['GENERATOR', 'SELLER', 'EXCHANGE'].includes(role)) {
      res.status(400).json({ error: '角色无效' });
      return;
    }
    const user = await authService.registerUser({ username, role, companyName, loadMW, units });
    res.json({ userId: user.id, username: user.username, role: user.role });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: '请输入账号' });
      return;
    }
    const user = await authService.loginUser(username);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取当前用户信息
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const user = await authService.getUserProfile(userId);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 修改个人信息
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const profile = await authService.updateProfile(userId, req.body);
    res.json(profile);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 查看市场成员列表
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const role = req.query.role as string;
    const companies = await authService.listCompanies(role || 'GENERATOR');
    res.json(companies);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 注销市场成员（仅交易所）
router.delete('/user/:userId', async (req: Request, res: Response) => {
  try {
    await authService.deleteUser(req.params.userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
