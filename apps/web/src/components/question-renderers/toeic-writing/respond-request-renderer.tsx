'use client';

import { RichContent } from '@/components/rich-content';
import { WordCounter } from '@/components/ui/word-counter';

interface RespondRequestMeta {
  minWords?: number;
  maxWords?: number;
  timeLimit?: number;
}

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  group: { instructions: string | null };
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}

export function RespondRequestRenderer({
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
        const meta = (question.metadata ||
          {}) as unknown as RespondRequestMeta;
        const answer = answers[question.id] || '';

        return (
          <div key={question.id}>
            {idx > 0 && <hr className="border-t border-slate-200" />}
            <div id={`question-${question.id}`} className="px-6 py-5">
              {/* Question number */}
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs shrink-0 border border-blue-200">
                  {question.questionNumber}
                </span>
              </div>

              {/* Email/letter content */}
              {question.stem && (
                <div className="brutal-card p-4 mb-4 bg-white">
                  <RichContent
                    html={question.stem}
                    className="text-sm leading-relaxed"
                  />
                </div>
              )}

              {/* Response text area */}
              <textarea
                placeholder="Write your response here..."
                value={answer}
                onChange={(e) => onAnswer(question.id, e.target.value)}
                rows={8}
                className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-y"
              />

              <WordCounter
                text={answer}
                minWords={meta.minWords}
                maxWords={meta.maxWords}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
