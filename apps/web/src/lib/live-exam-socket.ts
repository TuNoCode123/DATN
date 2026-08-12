import { io, Socket } from 'socket.io-client';
import { socketAuthProvider } from './socket-auth';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function connectLiveExamSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = io(`${SOCKET_URL}/live-exam`, {
    withCredentials: true,
    auth: socketAuthProvider,
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

  socket.on('connect_error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[LiveExamWS] Connection error:', err.message);
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
