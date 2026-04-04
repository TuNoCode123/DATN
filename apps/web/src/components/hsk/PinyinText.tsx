'use client';

interface PinyinTextProps {
  hanzi: string;
  pinyin?: string;
  hskLevel: number;
  mode?: 'always' | 'hover' | 'hidden';
}

export function PinyinText({ hanzi, pinyin, hskLevel, mode }: PinyinTextProps) {
  const effectiveMode =
    mode ?? (hskLevel <= 2 ? 'always' : hskLevel === 3 ? 'hover' : 'hidden');

  if (effectiveMode === 'hidden' || !pinyin) {
    return <span>{hanzi}</span>;
  }

  return (
    <ruby className={effectiveMode === 'hover' ? 'group' : ''}>
      {hanzi}
      <rp>(</rp>
      <rt
        className={
          effectiveMode === 'hover'
            ? 'opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-500'
            : 'text-xs text-slate-500'
        }
      >
        {pinyin}
      </rt>
      <rp>)</rp>
    </ruby>
  );
}
