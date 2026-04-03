'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatLayout } from '@/components/chat/chat-layout';
import { useChatStore } from '@/lib/chat-store';

function ChatPageInner() {
  const searchParams = useSearchParams();
  const dm = searchParams.get('dm');
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setChatBubbleOpen = useChatStore((s) => s.setChatBubbleOpen);

  // Hide the floating bubble while on the full chat page
  useEffect(() => {
    setChatBubbleOpen(false);
  }, [setChatBubbleOpen]);

  // Deep-link to a specific DM conversation (overrides persisted state)
  useEffect(() => {
    if (dm) {
      setActiveConversation(dm);
    }
  }, [dm, setActiveConversation]);

  return (
    <div className="h-[calc(100vh-10rem)] relative">
      <ChatLayout />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
