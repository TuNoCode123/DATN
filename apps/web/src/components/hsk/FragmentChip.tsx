'use client';

import { PinyinText } from './PinyinText';

interface FragmentChipProps {
  text: string;
  pinyin?: string;
  hskLevel: number;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

export function FragmentChip({
  text,
  pinyin,
  hskLevel,
  onClick,
  selected,
  disabled,
}: FragmentChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center px-3 py-2 rounded-lg border-2 text-base
        transition-all select-none
        ${
          disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-default opacity-50'
            : selected
              ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm cursor-pointer'
              : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
        }
      `}
    >
      <PinyinText hanzi={text} pinyin={pinyin} hskLevel={hskLevel} />
    </button>
  );
}
