'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

const HEARTBEAT_MS = 60_000;

/**
 * Owns the socket connection for the authenticated user across the whole app.
 * Mount once at the top of any authenticated layout. Keeps the user marked
 * "online" regardless of which page they're on — presence is tied to session,
 * not to the chat UI being mounted.
 */
export function useSocketLifecycle() {
  const user = useAuthStore((s) => s.user);
  const setUserOnline = useChatStore((s) => s.setUserOnline);
  const setUserOffline = useChatStore((s) => s.setUserOffline);
  const setOnlineUsers = useChatStore((s) => s.setOnlineUsers);

  useEffect(() => {
    if (!user) return;

    let socket;
    try {
      socket = connectSocket();
    } catch {
      return;
    }

    const handleUserOnline = (data: { userId: string }) => setUserOnline(data.userId);
    const handleUserOffline = (data: { userId: string }) => setUserOffline(data.userId);

    const fetchOnlineUsers = () => {
      socket.emit('get_online_users', {}, (res: { success: boolean; userIds: string[] }) => {
        if (res?.success) setOnlineUsers(res.userIds);
      });
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

    return () => {
      clearInterval(hb);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('connect', handleConnect);
      disconnectSocket();
    };
  }, [user, setUserOnline, setUserOffline, setOnlineUsers]);
}
