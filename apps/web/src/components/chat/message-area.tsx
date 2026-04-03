'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Spin, Button, message as antMessage } from 'antd';
import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useMessages, useConversationDetail } from '@/features/chat/hooks/use-chat';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore, type ChatMessage } from '@/lib/chat-store';
import { MessageBubble } from './message-bubble';
import { MessageInput } from './message-input';
import { TypingIndicator } from './typing-indicator';
import { DateSeparator } from './date-separator';
import { GroupInfoDrawer } from './group-info-drawer';
import { DeleteMessageDialog } from './delete-message-dialog';

interface Props {
  conversationId: string;
}

export function MessageArea({ conversationId }: Props) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const socketConnected = useChatStore((s) => s.socketConnected);
  const { data: convDetail } = useConversationDetail(conversationId);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(conversationId);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConvRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // ─── Flatten messages: chronological order (oldest → newest) ──────────
  const allMessages = useMemo(
    () => data?.pages?.slice().reverse().flatMap((p) => [...p.data].reverse()) || [],
    [data?.pages],
  );

  // ─── Track "at bottom" state ──────────────────────────────────────────
  const checkIsAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // ─── Join/leave WS room on conversation switch ────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    if (prevConvRef.current && prevConvRef.current !== conversationId) {
      socket.emit('leave_conversation', { conversationId: prevConvRef.current });
    }

    socket.emit('join_conversation', { conversationId });
    prevConvRef.current = conversationId;
    isInitialLoadRef.current = true;

    return () => {
      const s = getSocket();
      if (s?.connected) {
        s.emit('leave_conversation', { conversationId });
      }
    };
  }, [conversationId, socketConnected]);

  // ─── Mark read when conversation opens or new messages arrive ─────────
  useEffect(() => {
    const socket = getSocket();
    if (convDetail?.lastMessageSeq > 0 && socket?.connected) {
      socket.emit('mark_read', { conversationId, seqNumber: convDetail.lastMessageSeq }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      });
    }
  }, [conversationId, convDetail?.lastMessageSeq, socketConnected, queryClient]);

  // ─── Smart auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || allMessages.length === 0) return;

    if (isInitialLoadRef.current && !isLoading) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      isInitialLoadRef.current = false;
      prevScrollHeightRef.current = el.scrollHeight;
      return;
    }

    if (isFetchingNextPage || el.scrollHeight > prevScrollHeightRef.current + 200) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0 && !isAtBottomRef.current) {
        el.scrollTop += diff;
      }
    }

    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }

    prevScrollHeightRef.current = el.scrollHeight;
  }, [allMessages.length, isLoading, isFetchingNextPage]);

  // ─── Reset scroll on conversation switch ──────────────────────────────
  useEffect(() => {
    isInitialLoadRef.current = true;
    isAtBottomRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingMessage(null);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [conversationId]);

  // ─── Load older messages on scroll to top ─────────────────────────────
  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIsAtBottom();

    if (scrollRef.current && scrollRef.current.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, checkIsAtBottom]);

  // ─── Edit handler ─────────────────────────────────────────────────────
  const handleEdit = useCallback((message: ChatMessage) => {
    setEditingMessage(message);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  // ─── Delete handler ───────────────────────────────────────────────────
  const handleDelete = useCallback((message: ChatMessage) => {
    setDeleteTarget(message);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(
    (mode: 'self' | 'everyone') => {
      if (!deleteTarget) return;

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(
          'delete_message',
          { conversationId, messageId: deleteTarget.id, mode },
          (res: { success: boolean; error?: string }) => {
            if (res.success) {
              if (mode === 'self') {
                queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
                  if (!old) return old;
                  const data = old as { pages: Array<{ data: Array<{ id: string }> }> };
                  return {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      data: page.data.filter((m) => m.id !== deleteTarget.id),
                    })),
                  };
                });
              }
              // "everyone" mode is handled by the socket event listener
            } else {
              antMessage.error(res.error || 'Failed to delete message');
            }
          },
        );
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    [deleteTarget, conversationId, queryClient],
  );

  // ─── Reaction handler ─────────────────────────────────────────────────
  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(
          'toggle_reaction',
          { conversationId, messageId, emoji },
          (res: { success: boolean; reactions?: unknown[] }) => {
            if (res.success) {
              queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
                if (!old) return old;
                const data = old as { pages: Array<{ data: Array<{ id: string; reactions?: unknown[] }> }> };
                return {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    data: page.data.map((m) =>
                      m.id === messageId ? { ...m, reactions: res.reactions } : m,
                    ),
                  })),
                };
              });
            }
          },
        );
      }
    },
    [conversationId, queryClient],
  );

  // ─── Conversation display info ────────────────────────────────────────
  const isGroup = convDetail?.type === 'GROUP';
  const otherMember = !isGroup ? convDetail?.members?.find((m: { userId: string }) => m.userId !== user?.id) : null;
  const headerName = isGroup
    ? convDetail?.name
    : otherMember?.user?.displayName || 'Chat';
  const otherUserId = otherMember?.userId || null;
  const memberIds = isGroup ? convDetail?.members?.map((m: { userId: string }) => m.userId) || [] : [];
  const isOtherOnline = useChatStore((s) => otherUserId ? !!s.onlineUsers[otherUserId] : false);
  const onlineCount = useChatStore((s) =>
    isGroup ? memberIds.filter((id: string) => !!s.onlineUsers[id]).length : 0,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          className="md:hidden"
          onClick={() => setActiveConversation(null)}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{headerName}</h3>
          {isGroup ? (
            <span className="text-xs text-gray-400">
              {convDetail?.members?.length} members{onlineCount > 0 && `, ${onlineCount} online`}
            </span>
          ) : (
            <span className={`text-xs flex items-center gap-1 ${isOtherOnline ? 'text-green-500' : 'text-orange-500'}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${isOtherOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
              {isOtherOnline ? 'Online' : 'Offline'}
            </span>
          )}
        </div>
        {isGroup && (
          <Button
            type="text"
            icon={<InfoCircleOutlined />}
            onClick={() => setShowGroupInfo(true)}
          />
        )}
      </div>

      {/* Connection status banner */}
      {!socketConnected && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-700 text-center flex-shrink-0">
          Reconnecting...
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
        onScroll={handleScroll}
      >
        {isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spin size="small" />
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spin />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-gray-400 gap-2">
            <span className="text-4xl">👋</span>
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          allMessages.map((msg, idx) => {
            const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
            const showDate =
              !prevMsg ||
              new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

            return (
              <div key={msg.id || msg.clientId}>
                {showDate && <DateSeparator date={msg.createdAt} />}
                <MessageBubble
                  message={msg}
                  isOwn={msg.senderId === user?.id}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReaction={handleReaction}
                />
              </div>
            );
          })
        )}
        <TypingIndicator conversationId={conversationId} />
      </div>

      {/* Input */}
      <MessageInput
        conversationId={conversationId}
        editingMessage={editingMessage}
        onCancelEdit={handleCancelEdit}
      />

      {/* Delete confirmation dialog */}
      <DeleteMessageDialog
        open={deleteDialogOpen}
        message={deleteTarget}
        isOwn={deleteTarget?.senderId === user?.id}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTarget(null);
        }}
      />

      {/* Group info drawer */}
      {isGroup && convDetail && (
        <GroupInfoDrawer
          open={showGroupInfo}
          onClose={() => setShowGroupInfo(false)}
          conversation={convDetail}
        />
      )}
    </div>
  );
}
