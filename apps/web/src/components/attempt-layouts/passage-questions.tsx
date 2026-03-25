"use client";

import { RichContent } from "@/components/rich-content";
import { QuestionGroupRenderer } from "@/components/question-renderers";
import type { LayoutProps, PassageFromAPI, QuestionGroupFromAPI } from "./types";

/**
 * Groups passages with their linked question groups (via passageId).
 * Falls back to legacy layout (all passages left, all questions right)
 * when no groups have passageId set.
 */
export function PassageQuestionsLayout({
  section,
  answers,
  onAnswer,
  highlightEnabled,
}: LayoutProps) {
  const sortedPassages = [...(section.passages || [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  const hasAnyLinks = sortedGroups.some((g) => g.passageId);

  // Legacy fallback: no groups linked to passages → old behavior
  if (!hasAnyLinks) {
    return (
      <LegacyLayout
        passages={sortedPassages}
        groups={sortedGroups}
        answers={answers}
        onAnswer={onAnswer}
        highlightEnabled={highlightEnabled}
      />
    );
  }

  // Build passage → groups mapping
  const groupsByPassage = new Map<string, QuestionGroupFromAPI[]>();
  const unlinkedGroups: QuestionGroupFromAPI[] = [];

  for (const group of sortedGroups) {
    if (group.passageId) {
      const existing = groupsByPassage.get(group.passageId) || [];
      existing.push(group);
      groupsByPassage.set(group.passageId, existing);
    } else {
      unlinkedGroups.push(group);
    }
  }

  const passageStyle = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    lineHeight: 1.75,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {sortedPassages.map((passage) => {
        const linkedGroups = groupsByPassage.get(passage.id) || [];
        return (
          <div
            key={passage.id}
            className="flex border-b border-slate-200"
            style={{ minHeight: "50vh" }}
          >
            {/* Left: passage */}
            <div
              className="w-1/2 overflow-y-auto border-r border-slate-200"
            >
              <div
                className={`px-6 py-5 prose prose-sm max-w-none ${
                  highlightEnabled ? "selection:bg-yellow-200" : ""
                }`}
                style={passageStyle}
              >
                {passage.title && (
                  <h3 className="font-bold text-base mb-2">{passage.title}</h3>
                )}
                <RichContent
                  html={passage.contentHtml}
                  className="text-foreground text-sm leading-[1.75]"
                />
              </div>
            </div>

            {/* Right: linked question groups */}
            <div className="w-1/2 overflow-y-auto">
              {linkedGroups.length > 0 ? (
                linkedGroups.map((group, gi) => (
                  <div key={group.id}>
                    {gi > 0 && <hr className="border-slate-200" />}
                    <QuestionGroupRenderer
                      group={group}
                      answers={answers}
                      onAnswer={onAnswer}
                    />
                  </div>
                ))
              ) : (
                <div className="p-6 text-slate-400 italic text-sm">
                  No questions linked to this passage.
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Unlinked groups at bottom (full width) */}
      {unlinkedGroups.length > 0 && (
        <div className="border-t border-slate-300">
          {unlinkedGroups.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 && <hr className="border-slate-200" />}
              <QuestionGroupRenderer
                group={group}
                answers={answers}
                onAnswer={onAnswer}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Original layout: all passages left, all questions right */
function LegacyLayout({
  passages,
  groups,
  answers,
  onAnswer,
  highlightEnabled,
}: {
  passages: PassageFromAPI[];
  groups: QuestionGroupFromAPI[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  highlightEnabled?: boolean;
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left column — passage */}
      <div
        className="overflow-y-auto border-r border-slate-200"
        style={{ width: "50%" }}
      >
        <div
          className={`px-6 py-5 prose prose-sm max-w-none ${
            highlightEnabled ? "selection:bg-yellow-200" : ""
          }`}
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1.75,
          }}
        >
          {passages.length > 0 ? (
            passages.map((passage) => (
              <div key={passage.id}>
                {passage.title && (
                  <h3 className="font-bold text-base mb-2">{passage.title}</h3>
                )}
                <RichContent
                  html={passage.contentHtml}
                  className="text-foreground text-sm leading-[1.75]"
                />
              </div>
            ))
          ) : (
            <p className="text-slate-400 italic">No passage content.</p>
          )}
        </div>
      </div>

      {/* Right column — questions */}
      <div className="overflow-y-auto" style={{ width: "50%" }}>
        {groups.map((group, gi) => (
          <div key={group.id}>
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
