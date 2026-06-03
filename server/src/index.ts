import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import prisma from './prisma/client';
import { config } from './config';
import { initSocket } from './socket';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import annualRoutes from './routes/annual';
import monthlyRoutes from './routes/monthly';

const app = express();
const server = http.createServer(app);

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

// 静态文件服务（生产环境）
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 错误处理
app.use(errorHandler);

// 初始化 Socket.IO
initSocket(server, prisma);

// 启动
server.listen(config.port, () => {
  console.log(`电力中长期交易系统启动，端口: ${config.port}`);
  console.log(`环境: ${config.nodeEnv}`);
});

// 优雅退出
process.on('SIGTERM', async () => {
  console.log('正在关闭服务...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

export { prisma };
