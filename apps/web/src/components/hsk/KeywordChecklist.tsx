'use client';

interface KeywordChecklistProps {
  keywords: string[];
  text: string;
}

export function KeywordChecklist({ keywords, text }: KeywordChecklistProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {keywords.map((kw, i) => {
        const used = text.includes(kw);
        return (
          <span
            key={i}
            className={`
              inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium border
              ${
                used
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-slate-50 text-slate-600 border-slate-300'
              }
            `}
          >
            {kw}
            {used && <span className="text-green-500">✓</span>}
          </span>
        );
      })}
    </div>
  );
}
