'use client';

import { useState, useCallback, useEffect } from 'react';
import { FragmentChip } from '@/components/hsk/FragmentChip';

interface SentenceReorderMeta {
  type: string;
  fragments: string[];
  pinyin?: Record<string, string>;
  hskLevel: number;
}

interface Question {
  id: string;
  questionNumber: number;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  group: { instructions: string | null };
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}

/**
 * Parse an existing answer back into ordered fragment indices.
 * Tries exact concatenation match against fragments.
 */
function parseAnswerToIndices(answer: string, fragments: string[]): number[] {
  if (!answer) return [];
  const indices: number[] = [];
  let remaining = answer;
  const used = new Set<number>();

  while (remaining.length > 0) {
    let matched = false;
    for (let i = 0; i < fragments.length; i++) {
      if (!used.has(i) && remaining.startsWith(fragments[i])) {
        indices.push(i);
        used.add(i);
        remaining = remaining.slice(fragments[i].length);
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }

  // Only return indices if they fully reconstruct the answer
  if (remaining.length === 0) return indices;
  return [];
}

function ReorderQuestion({
  question,
  answer,
  onAnswer,
}: {
  question: Question;
  answer: string;
  onAnswer: (questionId: string, value: string) => void;
}) {
  const meta = (question.metadata || {}) as unknown as SentenceReorderMeta;
  const fragments = meta.fragments || [];
  const hskLevel = meta.hskLevel || 5;

  const [selectedIndices, setSelectedIndices] = useState<number[]>(() =>
    parseAnswerToIndices(answer, fragments),
  );
  const [isManualMode, setIsManualMode] = useState(false);

  // Sync answer when selectedIndices change (chip-click mode)
  useEffect(() => {
    if (isManualMode) return;
    const built = selectedIndices.map((i) => fragments[i]).join('');
    if (built !== answer) {
      onAnswer(question.id, built);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndices, isManualMode]);

  const handleChipClick = useCallback(
    (idx: number) => {
      setIsManualMode(false);
      setSelectedIndices((prev) => {
        if (prev.includes(idx)) {
          // Remove this and all after it
          return prev.slice(0, prev.indexOf(idx));
        }
        return [...prev, idx];
      });
    },
    [],
  );

  const handleSelectedChipClick = useCallback(
    (positionInSelected: number) => {
      setIsManualMode(false);
      // Remove from this position onward
      setSelectedIndices((prev) => prev.slice(0, positionInSelected));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setIsManualMode(false);
    setSelectedIndices([]);
    onAnswer(question.id, '');
  }, [onAnswer, question.id]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setIsManualMode(true);
      onAnswer(question.id, e.target.value);
    },
    [onAnswer, question.id],
  );

  const selectedSet = new Set(selectedIndices);
  const allSelected = selectedIndices.length === fragments.length;

  return (
    <div
      key={question.id}
      id={`question-${question.id}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200">
            {question.questionNumber}
          </span>
        </div>
        {selectedIndices.length > 0 && !isManualMode && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            重置 Reset
          </button>
        )}
      </div>

      {/* Available fragment chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {fragments.map((fragment, i) => {
          const isUsed = selectedSet.has(i);
          return (
            <FragmentChip
              key={i}
              text={fragment}
              pinyin={meta.pinyin?.[fragment]}
              hskLevel={hskLevel}
              onClick={() => handleChipClick(i)}
              selected={isUsed}
              disabled={isUsed}
            />
          );
        })}
      </div>

      {/* Built sentence preview (from chip clicks) */}
      {selectedIndices.length > 0 && !isManualMode && (
        <div className="mb-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
          <div className="text-xs text-blue-500 mb-2 font-medium">
            你的排序 (点击词语可撤销):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedIndices.map((fragIdx, pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => handleSelectedChipClick(pos)}
                className="inline-flex items-center px-2.5 py-1.5 rounded-md border-2 border-blue-400 bg-white text-blue-800 text-sm font-medium hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors cursor-pointer"
              >
                <span className="text-blue-400 text-xs mr-1.5 font-normal">
                  {pos + 1}
                </span>
                {fragments[fragIdx]}
              </button>
            ))}
          </div>
          {allSelected && (
            <div className="mt-2 text-sm text-green-600 font-medium">
              ✓ {selectedIndices.map((i) => fragments[i]).join('')}
            </div>
          )}
        </div>
      )}

      {/* Manual text input (fallback) */}
      <textarea
        placeholder="或在此手动输入完整句子..."
        value={answer}
        onChange={handleTextChange}
        rows={2}
        className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-base outline-none focus:border-blue-500 resize-none"
      />
    </div>
  );
}

export function SentenceReorderRenderer({
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

      {questions.map((question, idx) => (
        <div key={question.id}>
          {idx > 0 && <hr className="border-t border-slate-200" />}
          <div className="px-6 py-5">
            <ReorderQuestion
              question={question}
              answer={answers[question.id] || ''}
              onAnswer={onAnswer}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
