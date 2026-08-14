"use client";

import { RichContent } from "@/components/rich-content";
import { QuestionGroupRenderer } from "@/components/question-renderers";
import type { LayoutProps } from "./types";

export function QuestionsOnlyLayout({
  section,
  answers,
  onAnswer,
}: LayoutProps) {
  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const anySplit = sortedGroups.some((g) => g.layoutMode === 'horizontal');

  return (
    <div className="md:flex-1 md:overflow-y-auto">
      {section.instructions && (
        <div className="px-5 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}
      <div className={anySplit ? '' : 'max-w-3xl'}>
        {sortedGroups.map((group, gi) => (
          <div key={group.id} className="overflow-x-auto">
            {gi > 0 && <hr className="border-slate-200" />}
            <QuestionGroupRenderer
              group={group}
              answers={answers}
              onAnswer={onAnswer}
              splitLayout={group.layoutMode === 'horizontal'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
