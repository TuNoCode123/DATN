"use client";

import { RichContent } from "@/components/rich-content";
import { AudioPlayer } from "@/components/ui/audio-player";
import { getImageSizeClasses, getImageContainerClass } from "@/lib/image-size";
import { normalizeMcqOptions } from "./mcq-renderer";

interface FillInBlankRendererProps {
  question: {
    id: string;
    questionNumber: number;
    stem: string | null;
    options: unknown;
    imageUrl?: string | null;
    audioUrl?: string | null;
    imageLayout?: string | null;
    imageSize?: string | null;
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
  const sizeClasses = getImageSizeClasses(question.imageSize);

  return (
    <div className="mb-5" id={`question-${question.id}`}>
      <div className="flex gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200">
          {question.questionNumber}
        </span>
        {question.stem && (
          <RichContent
            html={question.stem}
            className="text-foreground text-sm leading-relaxed"
          />
        )}
      </div>
      {/* Question-level media — audio always on top */}
      {question.audioUrl && (
        <div className="ml-9 mb-3">
          <AudioPlayer src={question.audioUrl} />
        </div>
      )}
      {question.imageUrl && question.imageLayout !== 'below-text' && (
        <div className={`ml-9 mb-3 max-w-full ${question.imageLayout === 'horizontal' || question.imageLayout === 'beside-left' ? 'float-left mr-3 w-2/5' : question.imageLayout === 'beside-right' ? 'float-right ml-3 w-2/5' : ''}`}>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className={`${sizeClasses} w-full h-auto object-contain`} />
          </div>
        </div>
      )}
      <div className="ml-9 flex flex-col gap-0.5">
        {options.map((opt) => (
          <label
            key={opt.label}
            className="flex items-start gap-2 cursor-pointer group rounded-lg px-2 py-1 transition-colors hover:bg-slate-50"
          >
            <input
              type="radio"
              name={`q${question.id}`}
              value={opt.label}
              checked={selectedAnswer === opt.label}
              onChange={() => onAnswer(question.id, opt.label)}
              className="accent-slate-700 mt-0.5"
            />
            <span className="text-sm text-slate-700 group-hover:text-foreground">
              <strong className="mr-1">({opt.label})</strong>
              <RichContent html={opt.text} className="inline" />
            </span>
          </label>
        ))}
      </div>
      {question.imageUrl && question.imageLayout === 'below-text' && (
        <div className="ml-9 mt-3 max-w-full">
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={question.imageUrl} alt={`Question ${question.questionNumber}`} className={`${sizeClasses} w-full h-auto object-contain`} />
          </div>
        </div>
      )}
    </div>
  );
}
