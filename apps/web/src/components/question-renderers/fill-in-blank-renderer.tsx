"use client";

import { RichContent } from "@/components/rich-content";
import { normalizeMcqOptions } from "./mcq-renderer";

interface FillInBlankRendererProps {
  question: {
    id: string;
    questionNumber: number;
    stem: string | null;
    options: unknown;
    imageUrl?: string | null;
    audioUrl?: string | null;
  };
  selectedAnswer: string | null;
  onAnswer: (questionId: string, answer: string) => void;
}

export function FillInBlankRenderer({
  question,
  selectedAnswer,
  onAnswer,
}: FillInBlankRendererProps) {
  const options = normalizeMcqOptions(question.options);

  return (
    <div className="mb-5" id={`question-${question.id}`}>
      <div className="flex gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600 font-bold text-xs shrink-0 border border-blue-200">
          {question.questionNumber}
        </span>
        {question.stem && (
          <RichContent
            html={question.stem}
            className="text-foreground text-sm leading-relaxed"
          />
        )}
      </div>
      {/* Question-level media */}
      {(question.imageUrl || question.audioUrl) && (
        <div className="ml-9 mb-3 flex flex-col gap-2">
          {question.audioUrl && (
            <audio controls src={question.audioUrl} preload="metadata" className="w-full max-w-sm" />
          )}
          {question.imageUrl && (
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className="max-w-full h-auto object-contain" />
            </div>
          )}
        </div>
      )}
      <div className="ml-9 flex flex-col gap-1.5">
        {options.map((opt) => (
          <label
            key={opt.label}
            className={`flex items-start gap-2 cursor-pointer group rounded-lg px-2 py-1.5 transition-colors ${
              selectedAnswer === opt.label
                ? "bg-blue-50"
                : "hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={`q${question.id}`}
              value={opt.label}
              checked={selectedAnswer === opt.label}
              onChange={() => onAnswer(question.id, opt.label)}
              className="accent-blue-600 mt-0.5"
            />
            <span className="text-sm text-slate-700 group-hover:text-foreground">
              <strong className="mr-1">({opt.label})</strong>
              <RichContent html={opt.text} className="inline" />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
