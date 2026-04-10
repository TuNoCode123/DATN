import { io, Socket } from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
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

export function connectLiveExamSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = io(`${SOCKET_URL}/live-exam`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[LiveExamWS] Connected:', socket!.id);
  });

  socket.on('disconnect', (reason) => {
    // eslint-disable-next-line no-console
    console.log('[LiveExamWS] Disconnected:', reason);
  });

  socket.on('connect_error', async (err) => {
    if (
      err.message?.includes('Unauthorized') ||
      err.message?.includes('token')
    ) {
      const refreshed = await refreshTokens();
      if (refreshed) socket?.connect();
    }
  });

  // Expose for E2E testing in non-production builds
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_E2E === '1') {
    (window as unknown as { __exam_socket__?: Socket }).__exam_socket__ = socket;
  }

  return socket;
}

export function disconnectLiveExamSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getLiveExamSocket(): Socket | null {
  return socket;
}
