import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let globalSocket: Socket | null = null;

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(globalSocket);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io('/', {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      globalSocket.on('connect', () => {
        console.log('Socket connected:', globalSocket?.id);
      });

      globalSocket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
    }

    setSocket(globalSocket);

    return () => {
      // Don't disconnect on unmount — keep the connection alive
    };
  }, []);

  return { socket };
}

export function getSocket(): Socket | null {
  return globalSocket;
}
