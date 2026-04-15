'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Bot, MessageCircle, MessageSquareText, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useAiChatStore } from '@/lib/ai-chat-store';
import { useChatStore } from '@/lib/chat-store';
import { useConversations } from '@/features/chat/hooks/use-chat';

const AiChatPanel = dynamic(
  () => import('./ai-chat/ai-chat-panel').then((m) => m.AiChatPanel),
  { ssr: false },
);
const ChatLayout = dynamic(
  () => import('./chat/chat-layout').then((m) => m.ChatLayout),
  { ssr: false },
);

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center border-2 border-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function FloatingBubbles() {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  const aiPanelOpen = useAiChatStore((s) => s.panelOpen);
  const toggleAiPanel = useAiChatStore((s) => s.togglePanel);

  const chatBubbleOpen = useChatStore((s) => s.chatBubbleOpen);
  const toggleChatBubble = useChatStore((s) => s.toggleChatBubble);

  const [expanded, setExpanded] = useState(false);
  const [aiHasBeenOpened, setAiHasBeenOpened] = useState(false);
  const [chatHasBeenOpened, setChatHasBeenOpened] = useState(false);

  const aiPanelRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiPanelOpen && !aiHasBeenOpened) setAiHasBeenOpened(true);
  }, [aiPanelOpen, aiHasBeenOpened]);

  useEffect(() => {
    if (chatBubbleOpen && !chatHasBeenOpened) setChatHasBeenOpened(true);
  }, [chatBubbleOpen, chatHasBeenOpened]);

  const { data } = useConversations();
  const totalUnread = data?.data?.reduce((sum, c) => sum + c.unreadCount, 0) || 0;

  if (!user || pathname === '/chat') return null;

  const anyPanelOpen = aiPanelOpen || chatBubbleOpen;

  return (
    <>
      {/* AI Chat Panel */}
      {aiHasBeenOpened && (
        <div
          ref={aiPanelRef}
          className={`fixed z-50 rounded-2xl border-3 border-[#1E293B] bg-white overflow-hidden transition-all duration-300 ease-in-out origin-bottom-right shadow-[6px_6px_0px_#1E293B]
            ${
              aiPanelOpen
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none'
            }
            bottom-[calc(1.5rem+5rem)] right-6 w-[400px] h-[600px]
            max-md:bottom-0 max-md:right-0 max-md:w-screen max-md:h-screen max-md:rounded-none
          `}
        >
          <AiChatPanel />
        </div>
      )}

      {/* Chat Panel */}
      {chatHasBeenOpened && (
        <div
          ref={chatPanelRef}
          className={`fixed z-50 shadow-2xl rounded-2xl border border-gray-200 bg-white overflow-hidden transition-all duration-300 ease-in-out origin-bottom-right
            ${
              chatBubbleOpen
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none'
            }
            bottom-[calc(1.5rem+5rem)] right-6 w-[400px] h-[600px]
            max-md:bottom-0 max-md:right-0 max-md:w-screen max-md:h-screen max-md:rounded-none
          `}
        >
          <ChatLayout compact />
        </div>
      )}

      {/* AI Bot button — slides up when expanded (top of stack) */}
      <button
        onClick={() => {
          toggleAiPanel();
          if (chatBubbleOpen) toggleChatBubble();
        }}
        aria-label="AI Assistant"
        tabIndex={expanded ? 0 : -1}
        className={`fixed right-6 z-50 w-14 h-14 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-[3px_3px_0px_#1E293B] hover:shadow-[4px_4px_0px_#1E293B] border-2 border-[#1E293B] transition-all duration-300 ease-out flex items-center justify-center cursor-pointer hover:-translate-y-0.5
          ${
            expanded && !anyPanelOpen
              ? 'bottom-[calc(1.5rem+10.5rem)] opacity-100 pointer-events-auto scale-100'
              : 'bottom-6 opacity-0 pointer-events-none scale-75'
          }
        `}
      >
        <Bot className="w-5 h-5 text-white" />
      </button>

      {/* Chat button — slides up when expanded (middle of stack) */}
      <button
        onClick={() => {
          toggleChatBubble();
          if (aiPanelOpen) toggleAiPanel();
        }}
        aria-label="Messages"
        tabIndex={expanded ? 0 : -1}
        className={`fixed right-6 z-50 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 ease-out flex items-center justify-center cursor-pointer
          ${
            expanded && !anyPanelOpen
              ? 'bottom-[calc(1.5rem+6rem)] opacity-100 pointer-events-auto scale-100'
              : 'bottom-6 opacity-0 pointer-events-none scale-75'
          }
        `}
      >
        <span className="relative inline-flex">
          <MessageSquareText className="w-5 h-5 text-white" />
          <UnreadBadge count={expanded ? 0 : totalUnread} />
        </span>
      </button>

      {/* Trigger FAB — single share/expand button */}
      <button
        onClick={() => {
          if (anyPanelOpen) {
            if (aiPanelOpen) toggleAiPanel();
            if (chatBubbleOpen) toggleChatBubble();
            setExpanded(false);
          } else if (!expanded) {
            setExpanded(true);
          } else {
            setExpanded(false);
          }
        }}
        aria-label={expanded || anyPanelOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={expanded}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary hover:bg-emerald-600 text-white shadow-[3px_3px_0px_#1E293B] hover:shadow-[4px_4px_0px_#1E293B] border-2 border-[#1E293B] transition-all duration-200 flex items-center justify-center cursor-pointer hover:-translate-y-0.5"
      >
        <span className="relative inline-flex">
          {expanded || anyPanelOpen ? (
            <X className="w-5 h-5 text-white" />
          ) : (
            <MessageCircle className="w-5 h-5 text-white" />
          )}
          <UnreadBadge count={expanded || anyPanelOpen ? 0 : totalUnread} />
        </span>
      </button>
    </>
  );
}
