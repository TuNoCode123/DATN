'use client';

import { Tooltip } from 'antd';
import type { ReactionGroup } from '@/lib/chat-store';

interface Props {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
}

export function MessageReactions({ reactions, onToggle }: Props) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {reactions.map((r) => (
        <Tooltip key={r.emoji} title={`${r.count} reaction${r.count > 1 ? 's' : ''}`}>
          <button
            onClick={() => onToggle(r.emoji)}
            className={`inline-flex items-center gap-0.5 px-1 py-0 rounded-full text-[11px] leading-5 cursor-pointer transition-colors shadow-sm ${
              r.reacted
                ? 'bg-blue-50 border border-blue-300 text-blue-700'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="text-xs">{r.emoji}</span>
            {r.count > 1 && <span className="text-[10px]">{r.count}</span>}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
