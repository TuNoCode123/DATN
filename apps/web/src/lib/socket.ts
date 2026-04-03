import { io, Socket } from 'socket.io-client';
import { useChatStore } from './chat-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  // Return existing socket if already connected or connecting
  if (socket && !socket.disconnected) return socket;

  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No access token');

  socket = io(`${SOCKET_URL}/chat`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected:', socket!.id);
    useChatStore.getState().setSocketConnected(true);
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
    useChatStore.getState().setSocketConnected(false);
  });

  socket.on('reconnect', (attempt) => {
    console.log('[WS] Reconnected after', attempt, 'attempts');
    useChatStore.getState().setSocketConnected(true);
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] Connection error:', err.message);
  });

  socket.on('auth_error', () => {
    console.error('[WS] Auth error — disconnecting');
    socket?.disconnect();
    socket = null;
    useChatStore.getState().setSocketConnected(false);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    console.log('[WS] Disconnecting manually');
    socket.disconnect();
    socket = null;
    useChatStore.getState().setSocketConnected(false);
  }
}

export function getSocket(): Socket | null {
  return socket;
}
