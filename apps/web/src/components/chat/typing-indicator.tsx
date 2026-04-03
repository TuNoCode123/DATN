'use client';

import { useChatStore } from '@/lib/chat-store';

interface Props {
  conversationId: string;
}

const EMPTY_ARRAY: never[] = [];

export function TypingIndicator({ conversationId }: Props) {
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId] ?? EMPTY_ARRAY);

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.displayName).join(', ');
  const text = typingUsers.length === 1 ? `${names} is typing` : `${names} are typing`;

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-gray-400">{text}</span>
    </div>
  );
}
