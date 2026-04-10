'use client';

import { Spin } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  useAiConversations,
  useCreateAiConversation,
  useDeleteAiConversation,
} from '@/features/ai-chat/hooks/use-ai-chat';
import { useAiChatStore } from '@/lib/ai-chat-store';

export function AiConversationList() {
  const { data, isLoading } = useAiConversations();
  const createConversation = useCreateAiConversation();
  const deleteConversation = useDeleteAiConversation();
  const { activeConversationId, setActiveConversation } = useAiChatStore();

  const handleNew = async () => {
    const result = await createConversation.mutateAsync();
    setActiveConversation(result.id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeConversationId === id) {
      setActiveConversation(null);
    }
    deleteConversation.mutate(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b-3 border-[#1E293B] flex items-center justify-between bg-purple-50">
        <div className="flex items-center gap-2">
          <RobotOutlined className="text-purple-500" />
          <span className="font-bold text-sm">AI Assistant</span>
        </div>
        <button
          onClick={handleNew}
          disabled={createConversation.isPending}
          className="w-7 h-7 rounded-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center border-2 border-[#1E293B] shadow-[1px_1px_0px_#1E293B] cursor-pointer transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <PlusOutlined className="text-xs" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spin size="small" />
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-gray-400">
            <RobotOutlined className="text-3xl mb-2 text-purple-300" />
            <p className="text-sm text-center">
              No conversations yet.
              <br />
              Start a new chat!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.data.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConversation(conv.id)}
                className={`w-full text-left px-3 py-3 hover:bg-purple-50 transition-colors cursor-pointer flex items-center gap-2 group ${
                  activeConversationId === conv.id
                    ? 'bg-purple-50 border-l-3 border-purple-500'
                    : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.title || 'New Chat'}
                  </p>
                  {conv.lastMessage && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {conv.lastMessage.content}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all cursor-pointer"
                >
                  <DeleteOutlined className="text-xs" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
