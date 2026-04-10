'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAiChatStore } from '@/lib/ai-chat-store';
import { AiConversationList } from './ai-conversation-list';
import { AiMessageArea } from './ai-message-area';
import { useCreateAiConversation } from '@/features/ai-chat/hooks/use-ai-chat';

export function AiChatPanel() {
  const { activeConversationId, setActiveConversation } = useAiChatStore();
  const createConversation = useCreateAiConversation();

  // Auto-create conversation if none selected and user opens panel
  const handleStartChat = async () => {
    const result = await createConversation.mutateAsync();
    setActiveConversation(result.id);
  };

  if (!activeConversationId) {
    return (
      <div className="flex flex-col h-full">
        <AiConversationList />
        {/* Quick start button at bottom */}
        <div className="p-3 border-t-2 border-[#1E293B]">
          <button
            onClick={handleStartChat}
            disabled={createConversation.isPending}
            className="w-full py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm border-2 border-[#1E293B] shadow-[3px_3px_0px_#1E293B] transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none cursor-pointer"
          >
            Start New Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Back button header */}
      <div className="p-3 border-b-3 border-[#1E293B] flex items-center gap-2 bg-purple-50">
        <button
          onClick={() => setActiveConversation(null)}
          className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowLeftOutlined className="text-xs" />
        </button>
        <span className="font-bold text-sm">AI Assistant</span>
      </div>

      {/* Message area */}
      <div className="flex-1 min-h-0">
        <AiMessageArea conversationId={activeConversationId} />
      </div>
    </div>
  );
}
