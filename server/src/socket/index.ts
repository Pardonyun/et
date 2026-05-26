import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

let io: Server;

export function initSocket(server: HttpServer, _prisma: PrismaClient) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 加入交易房间
    socket.on('join:annual', (tradeId: string) => {
      socket.join(`annual:${tradeId}`);
      console.log(`${socket.id} joined annual:${tradeId}`);
    });

    socket.on('join:monthly', (tradeId: string) => {
      socket.join(`monthly:${tradeId}`);
      console.log(`${socket.id} joined monthly:${tradeId}`);
    });

    socket.on('leave:annual', (tradeId: string) => {
      socket.leave(`annual:${tradeId}`);
    });

    socket.on('leave:monthly', (tradeId: string) => {
      socket.leave(`monthly:${tradeId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// 广播给交易房间内所有人
export function broadcastToAnnualRoom(tradeId: string, event: string, data: any) {
  io?.to(`annual:${tradeId}`).emit(event, data);
}

// 广播给月度交易房间内所有人
export function broadcastToMonthlyRoom(tradeId: string, event: string, data: any) {
  io?.to(`monthly:${tradeId}`).emit(event, data);
}

// 发给特定 socket（通过 userId 映射）
export function sendToUser(userId: string, event: string, data: any) {
  // 向所有 socket 广播，前端根据 userId 过滤
  io?.emit(event, { userId, ...data });
}

// 发给交易所角色
export function sendToExchange(event: string, data: any) {
  io?.emit(event, { ...data, _targetRole: 'EXCHANGE' });
}
