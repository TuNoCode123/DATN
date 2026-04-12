'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Modal } from 'antd';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import { getInitials } from './types';

const BLACKLIST_WORDS = [
  'spam', 'scam', 'viagra', 'casino', 'lottery',
  'buy now', 'click here', 'free money', 'make money fast',
  'earn money', 'work from home', 'congratulations you won',
  'fuck', 'shit', 'asshole', 'bitch', 'bastard',
  'dick', 'pussy', 'cunt', 'nigger', 'nigga',
  'faggot', 'retard', 'whore', 'slut', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'jackass',
  'damn', 'stfu', 'wtf', 'lmao die', 'kys',
  'kill yourself', 'go die',
  'đụ', 'địt', 'đù', 'đéo', 'địt mẹ', 'đụ má',
  'đồ chó', 'con chó', 'thằng chó', 'con điếm',
  'đĩ', 'cave', 'lồn', 'buồi', 'cặc', 'cu',
  'mẹ mày', 'bố mày', 'ngu', 'óc chó', 'ngu vl',
  'vãi', 'vkl', 'vcl', 'vl', 'cc', 'clgt',
  'dmm', 'đmm', 'dkm', 'đkm', 'dcm', 'đcm',
  'chết đi', 'biến đi', 'cút đi',
  'thằng ngu', 'con ngu', 'đồ ngu',
  'khốn nạn', 'mất dạy', 'vô học',
  'thằng khốn', 'con khốn', 'đồ khốn',
];

function findBlacklistedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BLACKLIST_WORDS.filter((word) => lower.includes(word));
}

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

    const matched = findBlacklistedWords(trimmed);
    if (matched.length > 0) {
      Modal.warning({
        title: 'Inappropriate content detected',
        content: (
          <div>
            <p>Your comment contains words that violate our community guidelines:</p>
            <p className="font-semibold text-red-600 my-2">
              {matched.map((w) => `"${w}"`).join(', ')}
            </p>
            <p>Please revise your comment before posting.</p>
          </div>
        ),
        okText: 'Got it',
      });
      return;
    }

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
