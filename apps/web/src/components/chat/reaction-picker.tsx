'use client';

import { Popover } from 'antd';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface Props {
  open: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function ReactionPicker({ open, onSelect, onClose, children }: Props) {
  const content = (
    <div className="flex gap-1 p-1">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-md cursor-pointer transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => !v && onClose()}
      content={content}
      trigger="click"
      placement="top"
    >
      {children}
    </Popover>
  );
}
