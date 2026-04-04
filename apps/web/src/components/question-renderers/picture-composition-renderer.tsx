'use client';

import { CharacterCounter } from '@/components/hsk/CharacterCounter';

interface PictureCompositionMeta {
  type: string;
  minChars: number;
  maxChars: number;
  hskLevel: number;
  imageAlt?: string;
}

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  group: { instructions: string | null };
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}

export function PictureCompositionRenderer({
  group,
  questions,
  answers,
  onAnswer,
}: Props) {
  return (
    <div>
      {group.instructions && (
        <div className="text-slate-600 italic text-sm px-6 pt-5 pb-2">
          {group.instructions}
        </div>
      )}

      {questions.map((question, idx) => {
        const meta = (question.metadata || {}) as unknown as PictureCompositionMeta;
        const answer = answers[question.id] || '';

        return (
          <div key={question.id}>
            {idx > 0 && <hr className="border-t border-slate-200" />}
            <div
              id={`question-${question.id}`}
              className="px-6 py-5"
            >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs shrink-0 border border-blue-200">
                {question.questionNumber}
              </span>
            </div>

            {/* Prompt */}
            {question.stem && (
              <div className="text-slate-700 mb-3 text-base leading-relaxed">
                {question.stem}
              </div>
            )}

            {/* Image */}
            {question.imageUrl && (
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={question.imageUrl}
                  alt={meta.imageAlt || '写作图片'}
                  className="max-h-60 rounded-lg border-2 border-slate-200 object-contain"
                />
              </div>
            )}

            {/* Writing area */}
            <textarea
              placeholder="在此写作..."
              value={answer}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              rows={6}
              className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-base outline-none focus:border-blue-500 resize-y"
            />

            {/* Character counter */}
            <CharacterCounter
              text={answer}
              minChars={meta.minChars || 60}
              maxChars={meta.maxChars || 100}
            />
            </div>
          </div>
        );
      })}
    </div>
  );
}
