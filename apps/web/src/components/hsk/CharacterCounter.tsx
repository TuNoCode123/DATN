'use client';

import { countHanzi } from '@/lib/chinese-utils';

interface CharacterCounterProps {
  text: string;
  minChars: number;
  maxChars: number;
}

export function CharacterCounter({
  text,
  minChars,
  maxChars,
}: CharacterCounterProps) {
  const charCount = countHanzi(text);
  const isUnder = charCount < minChars;
  const isOver = charCount > maxChars;
  const isOk = !isUnder && !isOver;

  return (
    <div
      className={`text-sm mt-1 font-medium ${
        isOk ? 'text-green-600' : 'text-red-500'
      }`}
    >
      {charCount} / {maxChars} 字
      {isUnder && ` (至少 ${minChars} 字)`}
      {isOver && ` (超出字数限制)`}
    </div>
  );
}
