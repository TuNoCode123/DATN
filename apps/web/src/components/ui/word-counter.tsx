'use client';

interface WordCounterProps {
  text: string;
  minWords?: number;
  maxWords?: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function WordCounter({ text, minWords, maxWords }: WordCounterProps) {
  const count = countWords(text);

  const isBelow = minWords !== undefined && count < minWords;
  const isAbove = maxWords !== undefined && count > maxWords;
  const isOk = !isBelow && !isAbove;

  return (
    <div className="flex items-center gap-2 mt-1.5 text-xs">
      <span
        className={`font-semibold ${
          isOk
            ? 'text-green-600'
            : isAbove
              ? 'text-red-600'
              : 'text-amber-600'
        }`}
      >
        Word count: {count}
      </span>
      {minWords !== undefined && (
        <span className="text-slate-400">min: {minWords}</span>
      )}
      {maxWords !== undefined && (
        <span className="text-slate-400">max: {maxWords}</span>
      )}
    </div>
  );
}

export { countWords };
