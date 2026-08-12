import { Socket } from 'socket.io-client';
import { useChatStore } from './chat-store';
import { getSocketManager } from './socket-manager';
import { socketAuthProvider } from './socket-auth';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = getSocketManager().socket('/chat', { auth: socketAuthProvider });
  socket.connect();

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

  // The manager's `auth` option (socketAuthProvider) fetches a fresh ID
  // token on every connection attempt automatically, so a connect_error or
  // auth_error just needs a retry — no manual token-refresh call needed.
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
