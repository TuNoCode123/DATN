'use client';

import Image from 'next/image';
import { RichContent } from '@/components/rich-content';
import { AudioPlayer } from '@/components/ui/audio-player';
import { TranscriptSection } from '@/components/ui/transcript-section';
import { getImageSizeClasses, getImageContainerClass } from '@/lib/image-size';
import { McqRenderer } from './mcq-renderer';
import { SentenceReorderRenderer } from './sentence-reorder-renderer';
import { KeywordCompositionRenderer } from './keyword-composition-renderer';
import { PictureCompositionRenderer } from './picture-composition-renderer';
import { WriteSentencesRenderer } from './toeic-writing/write-sentences-renderer';
import { RespondRequestRenderer } from './toeic-writing/respond-request-renderer';
import { OpinionEssayRenderer } from './toeic-writing/opinion-essay-renderer';


interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
  transcript?: string | null;
  imageLayout?: string | null;
  imageSize?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  instructions: string | null;
  matchingOptions: unknown;
  audioUrl?: string | null;
  imageUrl?: string | null;
  imageSize?: string | null;
  questions: QuestionFromAPI[];
}

interface QuestionGroupRendererProps {
  group: QuestionGroupFromAPI;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  onQuestionFocus?: (questionNumber: number) => void;
  onQuestionBlur?: () => void;
  focusedBlank?: number | null;
}

function GroupMedia({ group }: { group: QuestionGroupFromAPI }) {
  const hasAudio = !!group.audioUrl;
  const hasImage = !!group.imageUrl;
  if (!hasAudio && !hasImage) return null;

  const sizeClasses = getImageSizeClasses(group.imageSize);

  return (
    <div className="mb-4 ml-4 md:ml-9 flex flex-col gap-3">
      {hasAudio && (
        <AudioPlayer src={group.audioUrl!} />
      )}
      {hasImage && (
        <div className={`rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50 inline-block max-w-full ${getImageContainerClass(group.imageSize)}`}>
          <Image
            src={group.imageUrl!}
            alt="Question group image"
            width={0}
            height={0}
            sizes="(max-width: 768px) 100vw, 60vw"
            className={`${sizeClasses} w-full h-auto object-contain`}
            style={{ width: "100%", height: "auto" }}
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
  onQuestionFocus,
  onQuestionBlur,
  focusedBlank,
}: QuestionGroupRendererProps) {
  const sortedQuestions = [...group.questions].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  const isMcq = group.questionType === 'MULTIPLE_CHOICE';
  const isTfng = group.questionType === 'TRUE_FALSE_NOT_GIVEN' || group.questionType === 'YES_NO_NOT_GIVEN';
  const isCompletion = ['NOTE_COMPLETION', 'SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'SHORT_ANSWER', 'TABLE_COMPLETION', 'FORM_COMPLETION'].includes(group.questionType);
  const isMatching = group.questionType.startsWith('MATCHING_');
  const isSentenceReorder = group.questionType === 'SENTENCE_REORDER';
  const isKeywordComposition = group.questionType === 'KEYWORD_COMPOSITION';
  const isPictureComposition = group.questionType === 'PICTURE_COMPOSITION';
  const isWriteSentences = group.questionType === 'WRITE_SENTENCES';
  const isRespondRequest = group.questionType === 'RESPOND_WRITTEN_REQUEST';
  const isOpinionEssay = group.questionType === 'WRITE_OPINION_ESSAY';

  // TOEIC Writing: Write Sentences
  if (isWriteSentences) {
    return (
      <WriteSentencesRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

  // TOEIC Writing: Respond to Written Request
  if (isRespondRequest) {
    return (
      <RespondRequestRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

  // TOEIC Writing: Opinion Essay
  if (isOpinionEssay) {
    return (
      <OpinionEssayRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

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

  // Table/Form completion: show table as read-only context + separate inputs below.
  // Falls through to the default completion renderer which renders group.instructions
  // (the table HTML) as rich content and individual input fields underneath.

  // HSK Writing: Sentence Reorder
  if (isSentenceReorder) {
    return (
      <SentenceReorderRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

  // HSK Writing: Keyword Composition
  if (isKeywordComposition) {
    return (
      <KeywordCompositionRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

  // HSK Writing: Picture Composition
  if (isPictureComposition) {
    return (
      <PictureCompositionRenderer
        group={group}
        questions={sortedQuestions}
        answers={answers}
        onAnswer={onAnswer}
      />
    );
  }

  // Completion types + matching: content + text inputs
  return (
    <div className="px-5 py-4">
      <GroupMedia group={group} />
      {group.instructions && (
        <div className="mb-4 text-slate-600 italic text-sm leading-relaxed">
          <RichContent
            html={group.instructions}
            className="text-foreground text-sm leading-relaxed [&_table]:not-italic [&_table]:text-slate-900"
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {sortedQuestions.map((q) => {
          const hasStem = !!q.stem;
          return hasStem ? (
            <div
              key={q.id}
              className="flex gap-3 py-2"
              id={`question-${q.id}`}
              data-question-number={q.questionNumber}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-semibold text-xs shrink-0 border transition-colors mt-0.5 ${
                focusedBlank === q.questionNumber
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                {q.questionNumber}
              </span>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <p className="text-sm text-slate-800 leading-relaxed">{q.stem}</p>
                <input
                  type="text"
                  value={answers[q.id] || ''}
                  onChange={(e) => onAnswer(q.id, e.target.value)}
                  onFocus={() => onQuestionFocus?.(q.questionNumber)}
                  onBlur={() => onQuestionBlur?.()}
                  className={`border-2 rounded-lg bg-white outline-none max-w-xs h-8 px-2 text-sm transition-colors ${
                    focusedBlank === q.questionNumber
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-slate-200 focus:border-primary'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div
              key={q.id}
              className="flex items-center gap-2"
              id={`question-${q.id}`}
              data-question-number={q.questionNumber}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-semibold text-xs shrink-0 border transition-colors ${
                focusedBlank === q.questionNumber
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                {q.questionNumber}
              </span>
              <input
                type="text"
                value={answers[q.id] || ''}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                onFocus={() => onQuestionFocus?.(q.questionNumber)}
                onBlur={() => onQuestionBlur?.()}
                className={`border-2 rounded-lg bg-white outline-none min-w-0 flex-1 h-8 px-2 text-sm transition-colors ${
                  focusedBlank === q.questionNumber
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-slate-200 focus:border-primary'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { McqRenderer, normalizeMcqOptions } from './mcq-renderer';
export { FillInBlankRenderer } from './fill-in-blank-renderer';
