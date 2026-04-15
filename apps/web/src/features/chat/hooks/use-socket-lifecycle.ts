'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

const HEARTBEAT_MS = 60_000;

/**
 * Owns the socket connection for the authenticated user across the whole app.
 * Mount once at the top of any authenticated layout. Keeps the user marked
 * "online" regardless of which page they're on — presence is tied to session,
 * not to the chat UI being mounted.
 *
 * The `@/lib/socket` module (which pulls in socket.io-client, ~55KB gz) is
 * dynamically imported so it's split into its own chunk and never lands in
 * the initial bundle for learner pages that don't use chat.
 */
export function useSocketLifecycle() {
  const user = useAuthStore((s) => s.user);
  const setUserOnline = useChatStore((s) => s.setUserOnline);
  const setUserOffline = useChatStore((s) => s.setUserOffline);
  const setOnlineUsers = useChatStore((s) => s.setOnlineUsers);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { connectSocket, disconnectSocket, getSocket } = await import(
        '@/lib/socket'
      );
      if (cancelled) return;

      let socket;
      try {
        socket = connectSocket();
      } catch {
        return;
      }

      const handleUserOnline = (data: { userId: string }) =>
        setUserOnline(data.userId);
      const handleUserOffline = (data: { userId: string }) =>
        setUserOffline(data.userId);

      const fetchOnlineUsers = () => {
        socket.emit(
          'get_online_users',
          {},
          (res: { success: boolean; userIds: string[] }) => {
            if (res?.success) setOnlineUsers(res.userIds);
          },
        );
      };

      const handleConnect = () => {
        fetchOnlineUsers();
      };

      socket.on('user_online', handleUserOnline);
      socket.on('user_offline', handleUserOffline);
      socket.on('connect', handleConnect);

      if (socket.connected) fetchOnlineUsers();

      const hb = setInterval(() => {
        const s = getSocket();
        if (s?.connected) s.emit('heartbeat');
      }, HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(hb);
        socket.off('user_online', handleUserOnline);
        socket.off('user_offline', handleUserOffline);
        socket.off('connect', handleConnect);
        disconnectSocket();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [user, setUserOnline, setUserOffline, setOnlineUsers]);
}
