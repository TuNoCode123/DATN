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

  return (
    <div className="flex-1 overflow-y-auto">
      {section.instructions && (
        <div className="px-5 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}
      <div className="max-w-3xl">
        {sortedGroups.map((group, gi) => (
          <div key={group.id} className="overflow-x-auto">
            {gi > 0 && <hr className="border-slate-200" />}
            <QuestionGroupRenderer
              group={group}
              answers={answers}
              onAnswer={onAnswer}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
