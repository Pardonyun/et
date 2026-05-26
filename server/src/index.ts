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

// 请求日志
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/annual', annualRoutes);
app.use('/api/monthly', monthlyRoutes);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静态文件服务
const publicDir = path.join(__dirname, 'public');
const fs = require('fs');
console.log('__dirname:', __dirname);
console.log('publicDir:', publicDir);
console.log('publicDir exists:', fs.existsSync(publicDir));
if (fs.existsSync(publicDir)) {
  console.log('files:', fs.readdirSync(publicDir).join(', '));
}
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next();
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
