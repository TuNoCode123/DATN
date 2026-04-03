import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useChatStore } from './chat-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

let socket: Socket | null = null;
let isRefreshing = false;

async function refreshTokens(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
      withCredentials: true,
    });
    console.log('[WS] Cognito token refreshed successfully');
    return true;
  } catch {
    console.error('[WS] Token refresh failed');
    return false;
  } finally {
    isRefreshing = false;
  }
}

export function connectSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = io(`${SOCKET_URL}/chat`, {
    withCredentials: true,
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

  socket.on('connect_error', async (err) => {
    console.error('[WS] Connection error:', err.message);
    if (err.message?.includes('Unauthorized') || err.message?.includes('jwt') || err.message?.includes('token')) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        console.log('[WS] Token refreshed, reconnecting...');
        socket?.connect();
      }
    }
  });

  socket.on('auth_error', async () => {
    console.error('[WS] Auth error — attempting token refresh');
    const refreshed = await refreshTokens();
    if (refreshed) {
      console.log('[WS] Token refreshed, reconnecting...');
      socket?.connect();
    } else {
      console.error('[WS] Token refresh failed — disconnecting');
      socket?.disconnect();
      socket = null;
      useChatStore.getState().setSocketConnected(false);
    }
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
