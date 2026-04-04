'use client';

import { useCallback, useEffect, useRef } from 'react';
import { RichContent } from '@/components/rich-content';

interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
  imageLayout?: string | null;
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

interface TableCompletionRendererProps {
  group: QuestionGroupFromAPI;
  questions: QuestionFromAPI[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
}

/**
 * Build a map from questionNumber → questionId for quick lookup.
 */
function buildQuestionMap(questions: QuestionFromAPI[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const q of questions) {
    map.set(q.questionNumber, q.id);
  }
  return map;
}

/**
 * Replace blank placeholders (___N___, {N}) in the group instructions HTML
 * with <input> elements that map to question numbers.
 */
function processTableBlanks(
  html: string,
  questionMap: Map<number, string>,
  answers: Record<string, string>,
): string {
  let result = html;

  // Replace ___N___ patterns
  result = result.replace(
    /_{2,}\s*(\d+)\s*_{2,}/g,
    (_match, num) => {
      const qNum = parseInt(num, 10);
      const qId = questionMap.get(qNum);
      const value = qId ? (answers[qId] || '') : '';
      return buildInputHtml(qNum, qId || '', value);
    },
  );

  // Replace {N} patterns
  result = result.replace(
    /\{(\d+)\}/g,
    (_match, num) => {
      const qNum = parseInt(num, 10);
      const qId = questionMap.get(qNum);
      const value = qId ? (answers[qId] || '') : '';
      return buildInputHtml(qNum, qId || '', value);
    },
  );

  // Replace N______ patterns (number followed by underscores)
  result = result.replace(
    /(?<!\w)(\d+)\s*_{2,}/g,
    (_match, num) => {
      const qNum = parseInt(num, 10);
      if (!questionMap.has(qNum)) return _match; // not a known question number
      const qId = questionMap.get(qNum)!;
      const value = answers[qId] || '';
      return buildInputHtml(qNum, qId, value);
    },
  );

  // Replace ______N patterns (underscores followed by number, no trailing underscores)
  result = result.replace(
    /_{2,}\s*(\d+)(?!\s*_)/g,
    (_match, num) => {
      const qNum = parseInt(num, 10);
      if (!questionMap.has(qNum)) return _match;
      const qId = questionMap.get(qNum)!;
      const value = answers[qId] || '';
      return buildInputHtml(qNum, qId, value);
    },
  );

  return result;
}

function buildInputHtml(qNum: number, qId: string, value: string): string {
  const escapedValue = value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<span class="table-blank-wrapper" data-question-number="${qNum}" data-question-id="${qId}"><span class="table-blank-badge">${qNum}</span><input type="text" class="table-blank-input" data-qnum="${qNum}" data-qid="${qId}" value="${escapedValue}" placeholder="${qNum}" /></span>`;
}

export function TableCompletionRenderer({
  group,
  questions,
  answers,
  onAnswer,
}: TableCompletionRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const questionMap = buildQuestionMap(questions);

  const handleInput = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.classList.contains('table-blank-input')) return;
      const qId = target.dataset.qid;
      if (qId) {
        onAnswer(qId, target.value);
      }
    },
    [onAnswer],
  );

  // Attach event listeners to dynamically rendered inputs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('input', handleInput);
    return () => container.removeEventListener('input', handleInput);
  }, [handleInput]);

  // Sync input values when answers change externally
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const inputs = container.querySelectorAll<HTMLInputElement>('.table-blank-input');
    for (const input of inputs) {
      const qId = input.dataset.qid;
      if (qId) {
        const expected = answers[qId] || '';
        if (input.value !== expected) {
          input.value = expected;
        }
      }
    }
  }, [answers]);

  const instructionsHtml = group.instructions || '';
  const processedHtml = processTableBlanks(instructionsHtml, questionMap, answers);

  return (
    <div className="px-6 py-5" ref={containerRef}>
      {group.audioUrl && (
        <div className="mb-3">
          <audio controls src={group.audioUrl} preload="metadata" className="w-full max-w-md" />
        </div>
      )}
      {group.imageUrl && (
        <div className="mb-3 inline-block max-w-md rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={group.imageUrl} alt="Question group" className="max-w-[250px] max-h-[250px] h-auto object-contain" />
        </div>
      )}
      <div className="table-completion-container">
        <RichContent html={processedHtml} className="text-foreground text-sm leading-relaxed" />
      </div>
    </div>
  );
}
