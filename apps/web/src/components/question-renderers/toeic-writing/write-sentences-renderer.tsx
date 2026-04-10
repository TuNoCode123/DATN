'use client';

import { WordCounter } from '@/components/ui/word-counter';
import { ScratchNotes } from '@/components/ui/scratch-notes';
import { getImageSizeClasses, getImageContainerClass } from '@/lib/image-size';

interface WriteSentencesMeta {
  keywords?: string[];
  timeLimit?: number;
}

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  imageUrl?: string | null;
  imageSize?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  group: { instructions: string | null };
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}

export function WriteSentencesRenderer({
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
        const meta = (question.metadata || {}) as unknown as WriteSentencesMeta;
        const keywords = meta.keywords || [];
        const answer = answers[question.id] || '';

        return (
          <div key={question.id}>
            {idx > 0 && <hr className="border-t border-slate-200" />}
            <div id={`question-${question.id}`} className="px-6 py-5">
              {/* Two-column layout: image left, controls+textarea right */}
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left column ~55% : question number + image + keywords */}
                <div className="w-full md:w-[55%] min-w-0">
                  {/* Question number */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs shrink-0 border border-blue-200">
                      {question.questionNumber}
                    </span>
                  </div>

                  {/* Image */}
                  {question.imageUrl && (
                    <div
                      className={`rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full ${getImageContainerClass(question.imageSize)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={question.imageUrl}
                        alt={`Question ${question.questionNumber}`}
                        className={`${getImageSizeClasses(question.imageSize)} w-full h-auto object-contain`}
                      />
                      {/* Keywords caption below image */}
                      {keywords.length > 0 && (
                        <div className="px-3 py-2 bg-white border-t border-slate-200 text-center">
                          <span className="text-sm font-medium text-slate-700">
                            {keywords.join(' / ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Keywords as pills (when no image) */}
                  {!question.imageUrl && keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 text-sm font-bold border-2 border-black rounded-full bg-amber-100 shadow-[2px_2px_0_0_#1e293b]"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Prompt */}
                  {question.stem && (
                    <div className="text-slate-700 mt-3 text-sm">
                      {question.stem}
                    </div>
                  )}
                </div>

                {/* Right column ~45% : notes + textarea */}
                <div className="w-full md:w-[45%] shrink-0">
                  {/* Notes */}
                  <div className="mb-3">
                    <ScratchNotes label="Thêm ghi chú / dàn ý" />
                  </div>

                  {/* Text area */}
                  <textarea
                    placeholder="Viết essay tại đây ..."
                    value={answer}
                    onChange={(e) => onAnswer(question.id, e.target.value)}
                    rows={8}
                    className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-y"
                  />

                  <WordCounter text={answer} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
