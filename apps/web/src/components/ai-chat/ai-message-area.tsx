'use client';

import { useEffect, useRef } from 'react';
import { Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAiMessages, type AiMessage } from '@/features/ai-chat/hooks/use-ai-chat';
import { useAiChatStore } from '@/lib/ai-chat-store';
import { AiMessageBubble } from './ai-message-bubble';
import { AiMessageInput } from './ai-message-input';
import { useAiStream } from '@/features/ai-chat/hooks/use-ai-stream';

interface AiMessageAreaProps {
  conversationId: string;
}

export function AiMessageArea({ conversationId }: AiMessageAreaProps) {
  const { data, isLoading } = useAiMessages(conversationId);
  const { isStreaming, streamingMessage } = useAiChatStore();
  const { send } = useAiStream();
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: AiMessage[] = data?.messages || [];

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, streamingMessage]);

  const handleSend = async (message: string) => {
    try {
      await send(conversationId, message);
    } catch {
      // Error handled in stream hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-full bg-purple-50 border-2 border-[#1E293B] flex items-center justify-center">
              <RobotOutlined className="text-2xl text-purple-400" />
            </div>
            <p className="text-sm font-medium">Ask me anything about</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['IELTS', 'TOEIC', 'HSK', 'Grammar', 'Vocabulary'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs rounded-full border-2 border-[#1E293B] bg-purple-50 text-purple-600 font-medium"
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <AiMessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingMessage && (
          <AiMessageBubble
            role="assistant"
            content={streamingMessage}
            isStreaming
          />
        )}
      </div>

      {/* Input */}
      <AiMessageInput
        onSend={handleSend}
        isStreaming={isStreaming}
      />
    </div>
  );
}
