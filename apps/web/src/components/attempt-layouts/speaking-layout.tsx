'use client';

import { useState } from 'react';
import { RichContent } from '@/components/rich-content';
import { ScratchNotes } from '@/components/ui/scratch-notes';
import { AudioRecorder } from '@/components/ui/audio-recorder';
import type { LayoutProps, QuestionGroupFromAPI } from './types';
import { Info } from 'lucide-react';

interface TabGroup {
  label: string;
  groups: QuestionGroupFromAPI[];
}

const TYPE_LABELS: Record<string, string> = {
  READ_ALOUD: 'Read aloud',
  DESCRIBE_PICTURE: 'Describe a picture',
  RESPOND_TO_QUESTIONS: 'Respond to questions',
  PROPOSE_SOLUTION: 'Propose a solution',
  EXPRESS_OPINION: 'Express an opinion',
};

const TYPE_COLORS: Record<string, string> = {
  READ_ALOUD: 'text-blue-600',
  DESCRIBE_PICTURE: 'text-red-600',
  RESPOND_TO_QUESTIONS: 'text-green-600',
  PROPOSE_SOLUTION: 'text-purple-600',
  EXPRESS_OPINION: 'text-blue-600',
};

function buildSpeakingTabs(groups: QuestionGroupFromAPI[]): TabGroup[] {
  const tabs: TabGroup[] = [];
  const sorted = [...groups].sort((a, b) => a.orderIndex - b.orderIndex);

  const typeGroups: Record<string, QuestionGroupFromAPI[]> = {};
  for (const g of sorted) {
    if (!typeGroups[g.questionType]) typeGroups[g.questionType] = [];
    typeGroups[g.questionType].push(g);
  }

  const typeOrder = [
    'READ_ALOUD',
    'DESCRIBE_PICTURE',
    'RESPOND_TO_QUESTIONS',
    'PROPOSE_SOLUTION',
    'EXPRESS_OPINION',
  ];

  const getQRange = (groups: QuestionGroupFromAPI[]) => {
    const allQs = groups.flatMap((g) => g.questions);
    if (allQs.length === 0) return '';
    const nums = allQs.map((q) => q.questionNumber).sort((a, b) => a - b);
    return nums.length === 1
      ? `Question ${nums[0]}`
      : `Questions ${nums[0]}-${nums[nums.length - 1]}`;
  };

  for (const type of typeOrder) {
    if (typeGroups[type]?.length) {
      tabs.push({
        label: getQRange(typeGroups[type]),
        groups: typeGroups[type],
      });
    }
  }

  if (tabs.length === 0 && sorted.length > 0) {
    tabs.push({ label: 'Questions', groups: sorted });
  }

  return tabs;
}

export function SpeakingQuestionsLayout({
  section,
  answers,
  onAnswer,
  attemptId,
}: LayoutProps) {
  const tabs = buildSpeakingTabs(section.questionGroups);
  const [activeTab, setActiveTab] = useState(0);
  const [highlight, setHighlight] = useState(false);

  const currentGroups = tabs[activeTab]?.groups || [];
  const currentAttemptId = attemptId || '';

  const handleResult = (qId: string, assessment: unknown) => {
    const a = assessment as { spokenSentence?: string };
    onAnswer(
      qId,
      JSON.stringify({
        transcript: a.spokenSentence,
        assessment,
      }),
    );
  };

  return (
    <div className="md:flex-1 md:overflow-y-auto flex flex-col">
      {/* Top bar: highlight toggle */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${highlight ? 'bg-blue-500' : 'bg-slate-300'}`}
            onClick={() => setHighlight(!highlight)}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${highlight ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </div>
          <span className="text-sm text-slate-700 font-medium">
            Highlight nội dung
          </span>
          <Info className="w-3.5 h-3.5 text-slate-400" />
        </label>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b border-slate-200 bg-white px-4 overflow-x-auto">
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-[1px] transition-colors cursor-pointer whitespace-nowrap ${
                idx === activeTab
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {currentGroups.map((group) => {
          const sortedQuestions = [...group.questions].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );
          const isGroupType =
            group.questionType === 'RESPOND_TO_QUESTIONS' ||
            group.questionType === 'PROPOSE_SOLUTION';

          return (
            <div key={group.id}>
              {/* Group instructions for multi-question types */}
              {isGroupType && group.instructions && (
                <div className="px-6 pt-5">
                  <div className="border-l-4 border-slate-300 pl-4 mb-4">
                    <RichContent
                      html={group.instructions}
                      className="text-sm leading-relaxed text-slate-700"
                    />
                  </div>
                </div>
              )}

              {sortedQuestions.map((question, idx) => {
                const meta = (question.metadata || {}) as Record<
                  string,
                  unknown
                >;
                const prepTime =
                  (meta.prepTime as number) ||
                  getDefaultPrepTime(group.questionType);
                const responseTime =
                  (meta.responseTime as number) ||
                  getDefaultResponseTime(group.questionType);

                return (
                  <div
                    key={question.id}
                    id={`question-${question.id}`}
                    className={idx > 0 ? 'border-t border-slate-200' : ''}
                  >
                    {/* Type label - full width header */}
                    <div
                      className={`text-sm font-semibold px-6 pt-5 pb-2 ${TYPE_COLORS[group.questionType] || 'text-slate-700'}`}
                    >
                      {TYPE_LABELS[group.questionType] || group.questionType}
                    </div>

                    {/* Two-column layout */}
                    <div className="flex flex-col md:flex-row gap-0 px-6 pb-5">
                      {/* Left: content */}
                      <div className="flex-1 min-w-0 pr-0 md:pr-6">
                        {renderQuestionContent(
                          group.questionType,
                          question,
                          highlight,
                        )}
                      </div>

                      {/* Right: controls */}
                      <div className="w-full md:w-[45%] shrink-0 mt-4 md:mt-0">
                        {/* Question number + notes on same line */}
                        <div className="flex items-center gap-3 mb-3">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white font-bold text-sm shrink-0">
                            {question.questionNumber}
                          </span>
                          <ScratchNotes label="Thêm ghi chú / dàn ý" />
                        </div>

                        {/* Audio recorder */}
                        <AudioRecorder
                          questionId={question.id}
                          attemptId={currentAttemptId}
                          targetText={
                            group.questionType === 'READ_ALOUD'
                              ? question.stem || ''
                              : undefined
                          }
                          questionType={group.questionType}
                          questionStem={question.stem || ''}
                          prepTime={prepTime}
                          responseTime={responseTime}
                          onResult={(assessment) =>
                            handleResult(question.id, assessment)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDefaultPrepTime(type: string): number | undefined {
  switch (type) {
    case 'READ_ALOUD':
      return 45;
    case 'DESCRIBE_PICTURE':
      return 45;
    case 'PROPOSE_SOLUTION':
      return 45;
    case 'EXPRESS_OPINION':
      return 30;
    default:
      return undefined;
  }
}

function getDefaultResponseTime(type: string): number {
  switch (type) {
    case 'READ_ALOUD':
      return 45;
    case 'DESCRIBE_PICTURE':
      return 45;
    case 'RESPOND_TO_QUESTIONS':
      return 15;
    case 'PROPOSE_SOLUTION':
      return 60;
    case 'EXPRESS_OPINION':
      return 60;
    default:
      return 45;
  }
}

/**
 * Splits a READ_ALOUD stem into instruction line (e.g. "Read the text aloud")
 * and the actual passage text. The instruction is typically the first <p> tag
 * containing only a short directive.
 */
function splitReadAloudStem(html: string): {
  instruction: string | null;
  passage: string;
} {
  // Match the first <p> block
  const firstPMatch = html.match(/^(<p[^>]*>)([\s\S]*?)(<\/p>)/i);
  if (!firstPMatch) return { instruction: null, passage: html };

  // Strip HTML tags to get plain text of first paragraph
  const firstText = firstPMatch[2].replace(/<[^>]*>/g, '').trim();

  // Check if first paragraph is a short instruction (under 60 chars, no period mid-sentence)
  const isInstruction =
    firstText.length > 0 &&
    firstText.length < 60 &&
    /^(read|say|speak|pronounce)/i.test(firstText);

  if (!isInstruction) return { instruction: null, passage: html };

  // Remove the first <p>...</p> from the passage
  const passage = html.slice(firstPMatch[0].length).trim();
  return { instruction: firstText, passage: passage || html };
}

function renderQuestionContent(
  questionType: string,
  question: {
    stem: string | null;
    imageUrl?: string | null;
    questionNumber: number;
    metadata?: Record<string, unknown> | null;
  },
  highlight: boolean,
) {
  switch (questionType) {
    case 'READ_ALOUD': {
      if (!question.stem) return null;
      const meta = (question.metadata || {}) as Record<string, unknown>;
      // Use metadata.instruction if set in admin, otherwise try to split from stem
      const metaInstruction = meta.instruction as string | undefined;
      const { instruction, passage } = metaInstruction
        ? { instruction: metaInstruction, passage: question.stem }
        : splitReadAloudStem(question.stem);
      return (
        <div>
          {instruction && (
            <p className="text-sm font-medium text-slate-600 mb-2">
              {instruction}
            </p>
          )}
          <div
            className={`border border-slate-200 rounded-lg p-5 ${highlight ? 'bg-yellow-50' : 'bg-white'}`}
          >
            <RichContent
              html={passage}
              className="text-base leading-relaxed text-slate-800"
            />
          </div>
        </div>
      );
    }

    case 'DESCRIBE_PICTURE': {
      const meta = (question.metadata || {}) as Record<string, unknown>;
      const keywords = (meta.keywords as string[]) || [];
      return (
        <div>
          {question.imageUrl && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.imageUrl}
                alt={`Question ${question.questionNumber}`}
                className="max-w-full h-auto object-contain"
                style={{ maxHeight: '360px' }}
              />
              {/* Keywords / caption below image */}
              {keywords.length > 0 && (
                <div className="px-3 py-2 bg-white border-t border-slate-200 text-center">
                  <span className="text-sm font-medium text-slate-700">
                    {keywords.join(' / ')}
                  </span>
                </div>
              )}
            </div>
          )}
          {question.stem && (
            <div
              className={`mt-3 ${highlight ? 'bg-yellow-50 px-2 py-1 rounded' : ''}`}
            >
              <RichContent
                html={question.stem}
                className="text-sm text-slate-600"
              />
            </div>
          )}
        </div>
      );
    }

    case 'EXPRESS_OPINION':
      return (
        question.stem && (
          <div
            className={`border-l-4 border-blue-400 pl-4 py-2 ${highlight ? 'bg-yellow-50' : ''}`}
          >
            <RichContent
              html={question.stem}
              className="text-base leading-relaxed text-slate-800"
            />
          </div>
        )
      );

    case 'RESPOND_TO_QUESTIONS':
    case 'PROPOSE_SOLUTION':
      return (
        question.stem && (
          <div
            className={`${highlight ? 'bg-yellow-50 px-2 py-1 rounded' : ''}`}
          >
            <RichContent
              html={question.stem}
              className="text-sm leading-relaxed text-slate-700"
            />
          </div>
        )
      );

    default:
      return question.stem ? (
        <RichContent html={question.stem} className="text-sm" />
      ) : null;
  }
}
