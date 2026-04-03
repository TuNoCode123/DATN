'use client';

import { RichContent } from '@/components/rich-content';
import { McqRenderer } from './mcq-renderer';


interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
}

interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  instructions: string | null;
  matchingOptions: unknown;
  audioUrl?: string | null;
  imageUrl?: string | null;
  questions: QuestionFromAPI[];
}

interface QuestionGroupRendererProps {
  group: QuestionGroupFromAPI;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
}

function GroupMedia({ group }: { group: QuestionGroupFromAPI }) {
  const hasAudio = !!group.audioUrl;
  const hasImage = !!group.imageUrl;
  if (!hasAudio && !hasImage) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {hasAudio && (
        <audio
          controls
          src={group.audioUrl!}
          preload="metadata"
          className="w-full max-w-md"
        />
      )}
      {hasImage && (
        <div className="rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={group.imageUrl!}
            alt="Question group image"
            className="max-w-full h-auto object-contain"
          />
        </div>
      )}
    </div>
  );
}

export function QuestionGroupRenderer({
  group,
  answers,
  onAnswer,
}: QuestionGroupRendererProps) {
  const sortedQuestions = [...group.questions].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  const isMcq = group.questionType === 'MULTIPLE_CHOICE';
  const isTfng = group.questionType === 'TRUE_FALSE_NOT_GIVEN' || group.questionType === 'YES_NO_NOT_GIVEN';
  const isCompletion = ['NOTE_COMPLETION', 'SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'SHORT_ANSWER'].includes(group.questionType);
  const isMatching = group.questionType.startsWith('MATCHING_');

  // MCQ-style (including TFNG which has options)
  if (isMcq || isTfng) {
    return (
      <div className="px-6 py-5">
        <GroupMedia group={group} />
        {group.instructions && (
          <div className="mb-4 text-slate-600 italic text-sm leading-relaxed">
            <RichContent html={group.instructions} />
          </div>
        )}
        {!group.instructions && isMcq && (
          <div className="mb-4 text-slate-600 italic text-sm leading-relaxed">
            Choose the correct letter, <strong>A, B or C</strong>.
          </div>
        )}
        {sortedQuestions.map((q) => (
          <McqRenderer
            key={q.id}
            question={q}
            selectedAnswer={answers[q.id] ?? null}
            onAnswer={onAnswer}
          />
        ))}
      </div>
    );
  }

  // Completion types + matching: content + text inputs
  return (
    <div>
      <div className="px-6 pt-5">
        <GroupMedia group={group} />
      </div>
      <div className="flex" style={{ width: '100%' }}>
        <div
          className="px-6 py-5 overflow-x-hidden"
          style={{ width: '60%', minWidth: 0 }}
        >
          <div className="mb-3 text-slate-600 italic text-sm leading-relaxed">
            {isCompletion && (
              <>
                Complete the text below. Write{' '}
                <strong>NO MORE THAN TWO WORDS AND/OR A NUMBER</strong> for each
                answer.
              </>
            )}
            {isMatching && (
              <>Match each statement with the correct option.</>
            )}
          </div>
          {group.instructions && (
            <RichContent
              html={group.instructions}
              className="text-foreground text-sm leading-relaxed"
            />
          )}
        </div>
        <div
          className="border-l border-slate-200 bg-white px-4 py-5 flex flex-col gap-4"
          style={{ width: '40%' }}
        >
          {sortedQuestions.map((q) => (
            <div key={q.id} className="flex items-center gap-2 max-w-[200px]" id={`question-${q.id}`}>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs shrink-0 border border-blue-200">
                {q.questionNumber}
              </span>
              <input
                type="text"
                value={answers[q.id] || ''}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                className="border-2 border-slate-200 rounded-lg bg-white outline-none focus:border-primary min-w-0 flex-1 h-8 px-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { McqRenderer, normalizeMcqOptions } from './mcq-renderer';
export { FillInBlankRenderer } from './fill-in-blank-renderer';
