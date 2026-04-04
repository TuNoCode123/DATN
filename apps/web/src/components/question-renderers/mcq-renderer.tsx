"use client";

import { RichContent } from "@/components/rich-content";

interface McqOption {
  label: string;
  text: string;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function normalizeMcqOptions(raw: unknown): McqOption[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string") {
    return (raw as string[]).map((text, i) => ({
      label: LETTERS[i] ?? String(i + 1),
      text,
    }));
  }
  return raw as McqOption[];
}

interface McqRendererProps {
  question: {
    id: string;
    questionNumber: number;
    stem: string | null;
    options: unknown;
    imageUrl?: string | null;
    audioUrl?: string | null;
    imageLayout?: string | null;
  };
  selectedAnswer: string | null;
  onAnswer: (questionId: string, answer: string) => void;
}

export function McqRenderer({
  question,
  selectedAnswer,
  onAnswer,
}: McqRendererProps) {
  const options = normalizeMcqOptions(question.options);

  return (
    <div className="mb-5" id={`question-${question.id}`}>
      <div className="flex gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200">
          {question.questionNumber}
        </span>
        {question.stem && (
          <RichContent
            html={question.stem}
            className="font-semibold text-foreground text-sm leading-relaxed"
          />
        )}
      </div>
      {/* Question-level media */}
      {question.audioUrl && (
        <div className="ml-9 mb-3">
          <audio controls src={question.audioUrl} preload="metadata" className="w-full max-w-sm" />
        </div>
      )}
      {question.imageUrl && (question.imageLayout === 'horizontal' || question.imageLayout === 'beside-left' || question.imageLayout === 'beside-right') ? (
        <div className={`ml-9 mb-3 flex gap-3 ${question.imageLayout === 'beside-right' ? 'flex-row-reverse' : ''}`}>
          <div className="w-2/5 shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className="w-full max-w-[250px] max-h-[250px] h-auto object-contain" />
          </div>
          <div className="w-3/5 flex flex-col gap-1.5">
            {normalizeMcqOptions(question.options).map((opt) => (
              <label
                key={opt.label}
                className={`flex items-start gap-2 cursor-pointer group rounded-lg px-2 py-1.5 transition-colors ${
                  selectedAnswer === opt.label ? "bg-primary/10" : "hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`q${question.id}`}
                  value={opt.label}
                  checked={selectedAnswer === opt.label}
                  onChange={() => onAnswer(question.id, opt.label)}
                  className="accent-primary mt-0.5"
                />
                <span className="text-sm text-slate-700 group-hover:text-foreground">
                  <strong className="mr-1">{opt.label}.</strong>
                  <RichContent html={opt.text} className="inline" />
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <>
          {question.imageUrl && question.imageLayout !== 'below-text' && (
            <div className="ml-9 mb-3">
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className="max-w-[250px] max-h-[250px] h-auto object-contain" />
              </div>
            </div>
          )}
      <div className="ml-9 flex flex-col gap-1.5">
        {options.map((opt) => (
          <label
            key={opt.label}
            className={`flex items-start gap-2 cursor-pointer group rounded-lg px-2 py-1.5 transition-colors ${
              selectedAnswer === opt.label
                ? "bg-primary/10"
                : "hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={`q${question.id}`}
              value={opt.label}
              checked={selectedAnswer === opt.label}
              onChange={() => onAnswer(question.id, opt.label)}
              className="accent-primary mt-0.5"
            />
            <span className="text-sm text-slate-700 group-hover:text-foreground">
              <strong className="mr-1">{opt.label}.</strong>
              <RichContent html={opt.text} className="inline" />
            </span>
          </label>
        ))}
      </div>
          {question.imageUrl && question.imageLayout === 'below-text' && (
            <div className="ml-9 mt-3">
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className="max-w-[250px] max-h-[250px] h-auto object-contain" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
