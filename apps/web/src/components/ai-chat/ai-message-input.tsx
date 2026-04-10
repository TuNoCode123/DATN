'use client';

import { useState, useRef, useEffect } from 'react';
import { SendOutlined, LoadingOutlined } from '@ant-design/icons';

interface AiMessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function AiMessageInput({
  onSend,
  disabled,
  isStreaming,
}: AiMessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t-2 border-[#1E293B] p-3 bg-white">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about IELTS, TOEIC, HSK..."
          disabled={disabled || isStreaming}
          rows={1}
          className="flex-1 resize-none rounded-xl border-2 border-[#1E293B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50 bg-[#FFF8F0]"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled || isStreaming}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center border-2 border-[#1E293B] shadow-[2px_2px_0px_#1E293B] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
        >
          {isStreaming ? (
            <LoadingOutlined className="text-sm" />
          ) : (
            <SendOutlined className="text-sm" />
          )}
        </button>
      </div>
    </div>
  );
}
