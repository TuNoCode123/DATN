'use client';

import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

interface Props {
  date: string;
}

export function DateSeparator({ date }: Props) {
  const d = dayjs(date);
  let label: string;
  if (d.isToday()) {
    label = 'Today';
  } else if (d.isYesterday()) {
    label = 'Yesterday';
  } else {
    label = d.format('MMMM D, YYYY');
  }

  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
