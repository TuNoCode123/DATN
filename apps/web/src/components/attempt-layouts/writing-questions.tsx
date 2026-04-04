'use client';

import { RichContent } from '@/components/rich-content';
import { QuestionGroupRenderer } from '@/components/question-renderers';
import type { LayoutProps } from './types';

/**
 * Full-width layout for writing questions (HSK sentence reorder, composition).
 * No passage panel or 50/50 split — questions stacked vertically with generous spacing.
 */
export function WritingQuestionsLayout({
  section,
  answers,
  onAnswer,
}: LayoutProps) {
  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {section.instructions && (
        <div className="px-5 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}
      {sortedGroups.map((group, idx) => (
        <div key={group.id}>
          {idx > 0 && (
            <hr className="border-t border-slate-200" />
          )}
          <QuestionGroupRenderer
            group={group}
            answers={answers}
            onAnswer={onAnswer}
          />
        </div>
      ))}
    </div>
  );
}
