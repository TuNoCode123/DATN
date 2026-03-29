'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge } from 'antd';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';
import { usePathname } from 'next/navigation';
import { useChatStore } from '@/lib/chat-store';
import { useConversations } from '@/features/chat/hooks/use-chat';
import { useAuthStore } from '@/lib/auth-store';
import { ChatLayout } from './chat-layout';

export function ChatBubble() {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const chatBubbleOpen = useChatStore((s) => s.chatBubbleOpen);
  const toggleChatBubble = useChatStore((s) => s.toggleChatBubble);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Track if panel has ever been opened (to keep ChatLayout mounted)
  useEffect(() => {
    if (chatBubbleOpen && !hasBeenOpened) {
      setHasBeenOpened(true);
    }
  }, [chatBubbleOpen, hasBeenOpened]);

  // Get unread count
  const { data } = useConversations();
  const totalUnread = data?.data?.reduce((sum, c) => sum + c.unreadCount, 0) || 0;

  // Hide on /chat page (it has its own full ChatLayout) and when not logged in
  if (!user || pathname === '/chat') return null;

  return (
    <>
      {/* Chat Panel */}
      {hasBeenOpened && (
        <div
          ref={panelRef}
          className={`fixed z-50 shadow-2xl rounded-2xl border border-gray-200 bg-white overflow-hidden transition-all duration-300 ease-in-out origin-bottom-right
            ${chatBubbleOpen
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none'
            }
            bottom-24 right-6 w-[400px] h-[600px]
            max-md:bottom-0 max-md:right-0 max-md:w-screen max-md:h-screen max-md:rounded-none
          `}
        >
          <ChatLayout compact />
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={toggleChatBubble}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center cursor-pointer"
      >
        <Badge count={chatBubbleOpen ? 0 : totalUnread} offset={[-4, -4]} size="small">
          {chatBubbleOpen ? (
            <CloseOutlined className="text-xl text-white" />
          ) : (
            <MessageOutlined className="text-xl text-white" />
          )}
        </Badge>
      </button>
    </>
  );
}
