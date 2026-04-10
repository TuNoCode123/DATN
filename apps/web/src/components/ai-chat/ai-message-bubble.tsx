'use client';

import { RobotOutlined, UserOutlined } from '@ant-design/icons';

interface AiMessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function AiMessageBubble({
  role,
  content,
  isStreaming,
}: AiMessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#1E293B] ${
          isUser ? 'bg-blue-100' : 'bg-purple-100'
        }`}
      >
        {isUser ? (
          <UserOutlined className="text-sm text-blue-600" />
        ) : (
          <RobotOutlined className="text-sm text-purple-600" />
        )}
      </div>

      {/* Message */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 border-2 border-[#1E293B] ${
          isUser
            ? 'bg-blue-50 shadow-[2px_2px_0px_#1E293B]'
            : 'bg-white shadow-[2px_2px_0px_#1E293B]'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-purple-500 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
