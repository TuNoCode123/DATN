'use client';

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useChatStore, type ChatMessage } from '@/lib/chat-store';

/**
 * Owns the full socket lifecycle: connect, register listeners, disconnect.
 * Must be called once at the top-level chat layout.
 */
export function useSocketEvents() {
  const queryClient = useQueryClient();
  const addTypingUser = useChatStore((s) => s.addTypingUser);
  const removeTypingUser = useChatStore((s) => s.removeTypingUser);
  const setUserOnline = useChatStore((s) => s.setUserOnline);
  const setUserOffline = useChatStore((s) => s.setUserOffline);
  const setOnlineUsers = useChatStore((s) => s.setOnlineUsers);

  useEffect(() => {
    let socket;
    try {
      socket = connectSocket();
    } catch {
      console.warn('[WS] Could not connect — no token');
      return;
    }

    const handleNewMessage = (message: ChatMessage) => {
      console.log('[WS] new_message received:', message.id, 'in conversation:', message.conversationId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['messages', message.conversationId], (old: any) => {
        if (!old) return old;
        const firstPage = old.pages[0];
        const exists = firstPage.data.some(
          (m: { id: string; clientId?: string }) => m.id === message.id || (message.clientId && m.clientId === message.clientId),
        );
        if (exists) return old;
        return {
          ...old,
          pages: [
            { ...firstPage, data: [message, ...firstPage.data] },
            ...old.pages.slice(1),
          ],
        };
      });
      // Refresh conversation list
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleMessageRead = (_data: { conversationId: string; userId: string; lastReadSeq: number }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleUserTyping = (data: { conversationId: string; userId: string; displayName: string }) => {
      addTypingUser(data.conversationId, { userId: data.userId, displayName: data.displayName });
    };

    const handleUserStopTyping = (data: { conversationId: string; userId: string }) => {
      removeTypingUser(data.conversationId, data.userId);
    };

    const handleUserOnline = (data: { userId: string }) => {
      setUserOnline(data.userId);
    };

    const handleUserOffline = (data: { userId: string }) => {
      setUserOffline(data.userId);
    };

    const handleConversationAdded = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleMemberRemoved = (data: { conversationId: string; userId: string }) => {
      // Refresh conversation list and conversation detail
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', data.conversationId] });
      // Refresh messages to show the system message
      queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
    };

    const handleMemberAdded = (data: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
    };

    const handleConversationRemoved = (data: { conversationId: string }) => {
      // If we're viewing this conversation, deselect it
      const store = useChatStore.getState();
      if (store.activeConversationId === data.conversationId) {
        store.setActiveConversation(null);
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleMessageEdited = (data: { conversationId: string; messageId: string; content: string; editedAt: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['messages', data.conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((m: { id: string }) =>
              m.id === data.messageId
                ? { ...m, content: data.content, isEdited: true, editedAt: data.editedAt }
                : m,
            ),
          })),
        };
      });
    };

    const handleMessageDeleted = (data: { conversationId: string; messageId: string; deletedForAll: boolean }) => {
      if (data.deletedForAll) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryClient.setQueryData(['messages', data.conversationId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pages: old.pages.map((page: any) => ({
              ...page,
              data: page.data.map((m: { id: string }) =>
                m.id === data.messageId
                  ? { ...m, deletedForAll: true, content: '', attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentType: null, reactions: [] }
                  : m,
              ),
            })),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };

    const handleReactionUpdated = (data: { conversationId: string; messageId: string; reactions: unknown[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['messages', data.conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.map((m: { id: string }) =>
              m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
            ),
          })),
        };
      });
    };

    // Fetch online users once connected
    const fetchOnlineUsers = () => {
      socket.emit('get_online_users', {}, (res: { success: boolean; userIds: string[] }) => {
        if (res.success) {
          console.log('[WS] Online users:', res.userIds.length);
          setOnlineUsers(res.userIds);
        }
      });
    };

    // Register event listeners
    socket.on('new_message', handleNewMessage);
    socket.on('message_read', handleMessageRead);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('conversation_added', handleConversationAdded);
    socket.on('member_removed', handleMemberRemoved);
    socket.on('member_added', handleMemberAdded);
    socket.on('conversation_removed', handleConversationRemoved);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('reaction_updated', handleReactionUpdated);

    // Fetch online users when connected (or immediately if already connected)
    if (socket.connected) {
      fetchOnlineUsers();
    }
    socket.on('connect', fetchOnlineUsers);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('conversation_added', handleConversationAdded);
      socket.off('member_removed', handleMemberRemoved);
      socket.off('member_added', handleMemberAdded);
      socket.off('conversation_removed', handleConversationRemoved);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('reaction_updated', handleReactionUpdated);
      socket.off('connect', fetchOnlineUsers);
      disconnectSocket();
    };
  }, [queryClient, addTypingUser, removeTypingUser, setUserOnline, setUserOffline, setOnlineUsers]);

  const joinConversation = useCallback((conversationId: string) => {
    const socket = getSocket();
    if (socket) {
      console.log('[WS] Joining conversation:', conversationId);
      socket.emit('join_conversation', { conversationId });
    }
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    const socket = getSocket();
    if (socket) {
      console.log('[WS] Leaving conversation:', conversationId);
      socket.emit('leave_conversation', { conversationId });
    }
  }, []);

  const sendMessage = useCallback(
    (
      conversationId: string,
      content: string,
      clientId: string,
      type?: string,
      attachment?: { url: string; name: string; size: number; type: string },
      callback?: (res: { success: boolean; message?: ChatMessage; error?: string }) => void,
    ) => {
      const socket = getSocket();
      if (socket) {
        socket.emit(
          'send_message',
          {
            conversationId,
            content,
            type: type || 'TEXT',
            clientId,
            ...(attachment && {
              attachmentUrl: attachment.url,
              attachmentName: attachment.name,
              attachmentSize: attachment.size,
              attachmentType: attachment.type,
            }),
          },
          callback,
        );
      } else {
        console.error('[WS] Cannot send message — socket not connected');
        callback?.({ success: false, error: 'NOT_CONNECTED' });
      }
    },
    [],
  );

  const markRead = useCallback((conversationId: string, seqNumber: number) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('mark_read', { conversationId, seqNumber });
    }
  }, []);

  const emitTypingStart = useCallback((conversationId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('typing_start', { conversationId });
    }
  }, []);

  const emitTypingStop = useCallback((conversationId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('typing_stop', { conversationId });
    }
  }, []);

  const editMessage = useCallback(
    (conversationId: string, messageId: string, content: string, callback?: (res: { success: boolean; error?: string }) => void) => {
      const socket = getSocket();
      if (socket) {
        socket.emit('edit_message', { conversationId, messageId, content }, callback);
      }
    },
    [],
  );

  const deleteMessage = useCallback(
    (conversationId: string, messageId: string, mode: 'self' | 'everyone', callback?: (res: { success: boolean; error?: string }) => void) => {
      const socket = getSocket();
      if (socket) {
        socket.emit('delete_message', { conversationId, messageId, mode }, callback);
      }
    },
    [],
  );

  const toggleReaction = useCallback(
    (conversationId: string, messageId: string, emoji: string, callback?: (res: { success: boolean; error?: string }) => void) => {
      const socket = getSocket();
      if (socket) {
        socket.emit('toggle_reaction', { conversationId, messageId, emoji }, callback);
      }
    },
    [],
  );

  return {
    joinConversation,
    leaveConversation,
    sendMessage,
    markRead,
    emitTypingStart,
    emitTypingStop,
    editMessage,
    deleteMessage,
    toggleReaction,
  };
}
