'use client';

import { useState } from 'react';
import { Popover, Button, Avatar as AntAvatar } from 'antd';
import { UserOutlined, MessageOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { useCreateConversation } from '@/features/chat/hooks/use-chat';

interface UserProfilePopoverProps {
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  children: React.ReactNode;
}

export function UserProfilePopover({ user, children }: UserProfilePopoverProps) {
  const currentUser = useAuthStore((s) => s.user);
  const isOnline = useChatStore((s) => !!s.onlineUsers[user.id]);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setChatBubbleOpen = useChatStore((s) => s.setChatBubbleOpen);
  const createConversation = useCreateConversation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Don't show popover for own avatar or if not logged in
  const isOwner = currentUser?.id === user.id;
  if (!currentUser || isOwner) {
    return <>{children}</>;
  }

  const handleMessage = async () => {
    setLoading(true);
    try {
      const conv = await createConversation.mutateAsync({
        type: 'DIRECT',
        memberId: user.id,
      });
      setOpen(false);
      setActiveConversation(conv.id);
      setChatBubbleOpen(true);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="flex flex-col items-center gap-2 py-1 px-1" style={{ minWidth: 160 }}>
      <div className="relative">
        <AntAvatar
          size={48}
          icon={<UserOutlined />}
          src={user.avatarUrl}
          className="bg-blue-500"
        />
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            isOnline ? 'bg-green-500' : 'bg-orange-500'
          }`}
        />
      </div>
      <div className="text-center">
        <div className="font-semibold text-sm">{user.displayName || 'Anonymous'}</div>
        <div className={`text-xs flex items-center justify-center gap-1 ${isOnline ? 'text-green-500' : 'text-orange-500'}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>
      <Button
        type="primary"
        size="small"
        icon={<MessageOutlined />}
        onClick={handleMessage}
        loading={loading}
        block
      >
        Message
      </Button>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="right"
    >
      <div className="cursor-pointer">{children}</div>
    </Popover>
  );
}
