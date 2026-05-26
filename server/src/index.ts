import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { execSync } from 'child_process';
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

// 自动初始化数据库
async function initDatabase() {
  if (config.databaseUrl) {
    try {
      console.log('正在同步数据库...');
      execSync(
        'npx prisma db push --schema=server/src/prisma/schema.prisma --accept-data-loss --skip-generate',
        { stdio: 'pipe', timeout: 30000 },
      );
      console.log('数据库同步完成');
      await prisma.$connect();
      console.log('数据库连接成功');
    } catch (err: any) {
      console.error('数据库初始化失败:', err.message);
      console.log('将以无数据库模式运行（仅提供静态页面）');
    }
  }
}

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
async function start() {
  await initDatabase();
  server.listen(config.port, () => {
    console.log(`电力中长期交易系统启动，端口: ${config.port}`);
    console.log(`环境: ${config.nodeEnv}`);
  });
}
start();

// 优雅退出
process.on('SIGTERM', async () => {
  console.log('正在关闭服务...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

export { prisma };
