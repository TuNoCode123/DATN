'use client';

import { useState, useEffect, useRef } from 'react';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';
import { useAiChatStore } from '@/lib/ai-chat-store';
import { useAuthStore } from '@/lib/auth-store';
import { AiChatPanel } from './ai-chat-panel';

export function AiChatBubble() {
  const user = useAuthStore((s) => s.user);
  const panelOpen = useAiChatStore((s) => s.panelOpen);
  const togglePanel = useAiChatStore((s) => s.togglePanel);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelOpen && !hasBeenOpened) {
      setHasBeenOpened(true);
    }
  }, [panelOpen, hasBeenOpened]);

  if (!user) return null;

  return (
    <>
      {/* AI Chat Panel */}
      {hasBeenOpened && (
        <div
          ref={panelRef}
          className={`fixed z-50 rounded-2xl border-3 border-[#1E293B] bg-white overflow-hidden transition-all duration-300 ease-in-out origin-bottom-right shadow-[6px_6px_0px_#1E293B]
            ${
              panelOpen
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none'
            }
            bottom-24 right-24 w-[400px] h-[600px]
            max-md:bottom-0 max-md:right-0 max-md:w-screen max-md:h-screen max-md:rounded-none
          `}
        >
          <AiChatPanel />
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={togglePanel}
        className="fixed bottom-6 right-24 z-50 w-14 h-14 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-[3px_3px_0px_#1E293B] hover:shadow-[4px_4px_0px_#1E293B] border-2 border-[#1E293B] transition-all duration-200 flex items-center justify-center cursor-pointer hover:-translate-y-0.5"
      >
        {panelOpen ? (
          <CloseOutlined className="text-xl text-white" />
        ) : (
          <RobotOutlined className="text-xl text-white" />
        )}
      </button>
    </>
  );
}
