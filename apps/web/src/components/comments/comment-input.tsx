'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import { getInitials } from './types';

interface CommentInputProps {
  onSubmit: (body: string) => void;
  isPending?: boolean;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
}

export function CommentInput({
  onSubmit,
  isPending,
  placeholder = 'Share your thoughts...',
  compact = false,
  autoFocus = false,
  onCancel,
}: CommentInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  return (
    <div className={`flex gap-3 ${compact ? '' : 'mb-5'}`}>
      <Avatar size={compact ? 'sm' : 'default'} className="shrink-0 mt-1">
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
          {getInitials(user?.displayName ?? null)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={compact ? 1 : 2}
          className={`flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
            compact ? 'min-h-[36px]' : 'min-h-[48px]'
          }`}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isPending}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer self-end"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {compact && onCancel && (
        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-600 self-end pb-2 cursor-pointer"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
