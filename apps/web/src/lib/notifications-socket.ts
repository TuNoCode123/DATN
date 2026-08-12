import { Socket } from 'socket.io-client';
import { getSocketManager } from './socket-manager';
import { socketAuthProvider } from './socket-auth';

let socket: Socket | null = null;

export function connectNotificationsSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = getSocketManager().socket('/notifications', { auth: socketAuthProvider });
  socket.connect();

  return socket;
}

export function disconnectNotificationsSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getNotificationsSocket(): Socket | null {
  return socket;
}
