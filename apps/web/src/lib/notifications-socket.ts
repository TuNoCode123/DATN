import { Socket } from 'socket.io-client';
import axios from 'axios';
import { getSocketManager } from './socket-manager';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

let socket: Socket | null = null;
let isRefreshing = false;

async function refreshTokens(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    await axios.post(
      `${API_BASE_URL}/auth/cognito/refresh`,
      {},
      { withCredentials: true },
    );
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

export function connectNotificationsSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = getSocketManager().socket('/notifications');
  socket.connect();

  socket.on('connect_error', async (err) => {
    if (
      err.message?.includes('Unauthorized') ||
      err.message?.includes('token')
    ) {
      const refreshed = await refreshTokens();
      if (refreshed) socket?.connect();
    }
  });

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
