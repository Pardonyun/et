import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { initSocket } from './socket';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import annualRoutes from './routes/annual';
import monthlyRoutes from './routes/monthly';

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// 中间件
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/annual', annualRoutes);
app.use('/api/monthly', monthlyRoutes);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静态文件服务
const clientDist = path.join(__dirname, '../../client/dist');
console.log('静态文件目录:', clientDist);
try {
  const fs = require('fs');
  const files = fs.readdirSync(clientDist);
  console.log('client/dist 文件列表:', files.join(', '));
} catch (e: any) {
  console.error('client/dist 不可访问:', e.message);
}
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  // 只拦截非 API 请求
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(); // 文件不存在则跳过
  });
});

// 错误处理
app.use(errorHandler);

// 初始化 Socket.IO
initSocket(server, prisma);

// 启动
server.listen(config.port, () => {
  console.log(`电力中长期交易系统启动，端口: ${config.port}`);
  console.log(`环境: ${config.nodeEnv}`);
  console.log(`数据库: ${config.databaseUrl ? '已配置' : '未配置'}`);
});

// 优雅退出
process.on('SIGTERM', async () => {
  console.log('正在关闭服务...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

export { prisma };
