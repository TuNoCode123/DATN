"use client";

import Image from "next/image";
import { RichContent } from "@/components/rich-content";
import { AudioPlayer } from "@/components/ui/audio-player";
import { TranscriptSection } from "@/components/ui/transcript-section";
import { getImageSizeClasses, getImageContainerClass } from "@/lib/image-size";

interface McqOption {
  label: string;
  text: string;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function stripLabelPrefix(label: string, text: string): string {
  // Remove duplicate prefix like "A. " or "A." from text when label is "A"
  const re = new RegExp(`^${label}\\.\\s*`);
  return text.replace(re, "");
}

export function normalizeMcqOptions(raw: unknown): McqOption[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string") {
    return (raw as string[]).map((text, i) => ({
      label: LETTERS[i] ?? String(i + 1),
      text,
    }));
  }
  return (raw as McqOption[]).map((opt) => ({
    label: opt.label,
    text: stripLabelPrefix(opt.label, opt.text),
  }));
}

interface McqRendererProps {
  question: {
    id: string;
    questionNumber: number;
    stem: string | null;
    options: unknown;
    imageUrl?: string | null;
    audioUrl?: string | null;
    transcript?: string | null;
    imageLayout?: string | null;
    imageSize?: string | null;
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
  const sizeClasses = getImageSizeClasses(question.imageSize);

  const hasStem = !!question.stem;
  const hasAudio = !!question.audioUrl;

  // No stem and no audio: render number badge + options side-by-side
  if (!hasStem && !hasAudio) {
    return (
      <div className="mb-5" id={`question-${question.id}`}>
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200 mt-0.5">
            {question.questionNumber}
          </span>
          <div className="flex flex-col gap-0.5">
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
                  <strong className="mr-1">{opt.label}.</strong>
                  {opt.text && opt.text !== opt.label && (
                    <RichContent html={opt.text} className="inline" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5" id={`question-${question.id}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200">
          {question.questionNumber}
        </span>
        {hasStem ? (
          <RichContent
            html={question.stem!}
            className="font-semibold text-foreground text-sm leading-relaxed"
          />
        ) : hasAudio ? (
          <div className="flex-1 min-w-0">
            <AudioPlayer src={question.audioUrl!} />
          </div>
        ) : null}
      </div>
      {/* Question-level media (audio below stem when both exist) */}
      {hasAudio && hasStem && (
        <div className="ml-9 mb-3">
          <AudioPlayer src={question.audioUrl!} />
          {question.transcript && (
            <TranscriptSection html={question.transcript} className="mt-1" />
          )}
        </div>
      )}
      {/* Transcript when audio is shown inline with question number (no stem) */}
      {hasAudio && !hasStem && question.transcript && (
        <div className="ml-9 mb-3">
          <TranscriptSection html={question.transcript} />
        </div>
      )}
      {question.imageUrl && (question.imageLayout === 'horizontal' || question.imageLayout === 'beside-left' || question.imageLayout === 'beside-right') ? (
        <div className={`ml-9 mb-3 flex flex-col sm:flex-row gap-3 ${question.imageLayout === 'beside-right' ? 'sm:flex-row-reverse' : ''}`}>
          <div className="w-full sm:w-2/5 sm:shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
            <Image
              src={question.imageUrl}
              alt={`Question ${question.questionNumber}`}
              width={0}
              height={0}
              sizes="(max-width: 640px) 100vw, 40vw"
              className="max-w-full w-full h-auto object-contain"
              style={{ width: "100%", height: "auto" }}
            />
          </div>
          <div className="w-full sm:w-3/5 flex flex-col gap-0.5">
            {normalizeMcqOptions(question.options).map((opt) => (
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
                  <strong className="mr-1">{opt.label}.</strong>
                  {opt.text && opt.text !== opt.label && (
                    <RichContent html={opt.text} className="inline" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <>
          {question.imageUrl && question.imageLayout !== 'below-text' && (
            <div className="ml-9 mb-3 max-w-full">
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full">
                <Image
                  src={question.imageUrl}
                  alt={`Question ${question.questionNumber}`}
                  width={0}
                  height={0}
                  sizes="(max-width: 768px) 100vw, 60vw"
                  className={`${sizeClasses} w-full h-auto object-contain`}
                  style={{ width: "100%", height: "auto" }}
                />
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
              <strong className="mr-1">{opt.label}.</strong>
              {opt.text && opt.text !== opt.label && (
                <RichContent html={opt.text} className="inline" />
              )}
            </span>
          </label>
        ))}
      </div>
          {question.imageUrl && question.imageLayout === 'below-text' && (
            <div className="ml-9 mt-3 max-w-full">
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full">
                <Image
                  src={question.imageUrl}
                  alt={`Question ${question.questionNumber}`}
                  width={0}
                  height={0}
                  sizes="(max-width: 768px) 100vw, 60vw"
                  className={`${sizeClasses} w-full h-auto object-contain`}
                  style={{ width: "100%", height: "auto" }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
