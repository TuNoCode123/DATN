import { Manager } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let manager: Manager | null = null;

export function getSocketManager(): Manager {
  if (manager) return manager;
  manager = new Manager(SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    autoConnect: false,
  });
  return manager;
}

export function resetSocketManager() {
  manager = null;
}
