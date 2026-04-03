'use client';

import { ConversationList } from './conversation-list';
import { MessageArea } from './message-area';
import { useChatStore } from '@/lib/chat-store';
import { useSocketEvents } from '@/features/chat/hooks/use-socket-events';

interface ChatLayoutProps {
  /** Single-panel mode for bubble/compact views — shows list OR chat, not both */
  compact?: boolean;
}

export function ChatLayout({ compact = false }: ChatLayoutProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Single owner of socket lifecycle — connects on mount, disconnects on unmount
  useSocketEvents();

  if (compact) {
    return (
      <div className="flex flex-col h-full bg-white overflow-hidden">
        {activeConversationId ? (
          <MessageArea conversationId={activeConversationId} />
        ) : (
          <ConversationList />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white rounded-lg shadow overflow-hidden">
      {/* Sidebar — always visible on desktop, slides out on mobile */}
      <div
        className={`w-80 flex-shrink-0 border-r border-gray-200 flex flex-col
          transition-all duration-200 ease-in-out
          ${activeConversationId
            ? 'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-10 max-md:-translate-x-full'
            : 'max-md:w-full'
          } md:translate-x-0 md:relative`}
      >
        <ConversationList />
      </div>

      {/* Chat panel */}
      <div className={`flex-1 min-w-0 flex flex-col
        ${!activeConversationId ? 'max-md:hidden' : ''}`}
      >
        {activeConversationId ? (
          <MessageArea conversationId={activeConversationId} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-lg">Select a conversation to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
