"use client";

import { useState, useCallback, useEffect } from "react";
import { RichContent } from "@/components/rich-content";
import { QuestionGroupRenderer } from "@/components/question-renderers";
import type { LayoutProps, PassageFromAPI, QuestionGroupFromAPI } from "./types";

/**
 * Replace blank placeholders (___N___ or {N}) in passage HTML with interactive spans.
 */
function processPassageBlanks(html: string): string {
  // Replace ___N___ patterns
  let result = html.replace(
    /_{2,}\s*(\d+)\s*_{2,}/g,
    (_match, num) =>
      `<span class="passage-blank" data-blank="${num}" tabindex="0">${num}</span>`,
  );
  // Replace {N} patterns (not already processed)
  result = result.replace(
    /\{(\d+)\}/g,
    (_match, num) =>
      `<span class="passage-blank" data-blank="${num}" tabindex="0">${num}</span>`,
  );
  return result;
}

/** Renders passage media: audio always on top, then image with layout config */
function PassageMedia({
  passage,
  highlightEnabled,
  processBlanks,
  focusedBlank,
  onBlankClick,
}: {
  passage: PassageFromAPI;
  highlightEnabled?: boolean;
  processBlanks?: boolean;
  focusedBlank?: number | null;
  onBlankClick?: (blankNum: number) => void;
}) {
  const hasAudio = !!passage.audioUrl;
  const hasImage = !!passage.imageUrl;
  const layout = passage.imageLayout || 'vertical';
  const isBeside = layout === 'horizontal' || layout === 'beside-left' || layout === 'beside-right';
  const isBelowText = layout === 'below-text';

  const contentHtml = processBlanks
    ? processPassageBlanks(passage.contentHtml)
    : passage.contentHtml;

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('passage-blank') && onBlankClick) {
        const blankNum = parseInt(target.dataset.blank || '0', 10);
        if (blankNum > 0) onBlankClick(blankNum);
      }
    },
    [onBlankClick],
  );

  const contentClassName = `text-foreground text-sm leading-[1.75] ${
    processBlanks ? 'passage-blanks-container' : ''
  } ${focusedBlank ? `blank-focused-${focusedBlank}` : ''}`;

  if (!hasAudio && !hasImage) {
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div onClick={handleContentClick}>
          <RichContent html={contentHtml} className={contentClassName} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Audio always at the very top */}
      {hasAudio && (
        <div className="mb-3">
          <audio controls src={passage.audioUrl!} preload="metadata" className="w-full max-w-md" />
        </div>
      )}

      {/* Beside layout: image + text side by side */}
      {hasImage && isBeside ? (
        <div className={`flex gap-4 mb-3 ${layout === 'beside-right' ? 'flex-row-reverse' : ''}`}>
          <div className="w-2/5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={passage.imageUrl!}
              alt={passage.title || 'Passage illustration'}
              className="w-full h-auto rounded-lg object-contain"
            />
          </div>
          <div className="w-3/5 min-w-0">
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div onClick={handleContentClick}>
              <RichContent html={contentHtml} className={contentClassName} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Below text: text first, then image */}
          {hasImage && isBelowText ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div onClick={handleContentClick}>
                <RichContent html={contentHtml} className={contentClassName} />
              </div>
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={passage.imageUrl!}
                  alt={passage.title || 'Passage illustration'}
                  className="max-w-[250px] max-h-[250px] h-auto rounded-lg object-contain"
                />
              </div>
            </>
          ) : (
            <>
              {/* Vertical layout: image above text (default) */}
              {hasImage && (
                <div className="mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={passage.imageUrl!}
                    alt={passage.title || 'Passage illustration'}
                    className="max-w-[250px] max-h-[250px] h-auto rounded-lg object-contain"
                  />
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div onClick={handleContentClick}>
                <RichContent html={contentHtml} className={contentClassName} />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Check if a passage has meaningful content to display */
function hasPassageContent(passage: PassageFromAPI): boolean {
  const hasAudio = !!passage.audioUrl;
  const hasImage = !!passage.imageUrl;
  // Strip HTML tags and whitespace to check for actual text
  const textContent = passage.contentHtml
    .replace(/<[^>]*>/g, '')
    .trim();
  const hasText = textContent.length > 0 && !textContent.startsWith('Enter passage text here');
  return hasAudio || hasImage || hasText;
}

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
  const [focusedBlank, setFocusedBlank] = useState<number | null>(null);

  const sortedPassages = [...(section.passages || [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  const hasAnyLinks = sortedGroups.some((g) => g.passageId);

  // Check if any group is a completion type (needs blank processing)
  const hasCompletionGroups = sortedGroups.some((g) =>
    ['NOTE_COMPLETION', 'SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'SHORT_ANSWER', 'TABLE_COMPLETION', 'FORM_COMPLETION'].includes(g.questionType),
  );

  // Handle blank click in passage → focus corresponding input
  const handleBlankClick = useCallback((blankNum: number) => {
    setFocusedBlank(blankNum);
    // Find the input with matching question number and focus it
    const input = document.querySelector(`[data-question-number="${blankNum}"] input`) as HTMLInputElement;
    if (input) input.focus();
  }, []);

  // Handle input focus → highlight corresponding blank
  const handleQuestionFocus = useCallback((questionNumber: number) => {
    setFocusedBlank(questionNumber);
    // Highlight the blank in passage
    const blank = document.querySelector(`.passage-blank[data-blank="${questionNumber}"]`) as HTMLElement;
    if (blank) blank.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const handleQuestionBlur = useCallback(() => {
    setFocusedBlank(null);
  }, []);

  // Sync active class on passage blanks when focusedBlank changes
  useEffect(() => {
    // Remove previous active
    document.querySelectorAll('.passage-blank.active').forEach((el) => {
      el.classList.remove('active');
    });
    // Add active to focused
    if (focusedBlank) {
      const el = document.querySelector(`.passage-blank[data-blank="${focusedBlank}"]`);
      if (el) el.classList.add('active');
    }
  }, [focusedBlank]);

  // Legacy fallback: no groups linked to passages → old behavior
  if (!hasAnyLinks) {
    return (
      <LegacyLayout
        sectionInstructions={section.instructions}
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
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {section.instructions && (
        <div className="px-6 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}
      {sortedPassages.map((passage) => {
        const linkedGroups = groupsByPassage.get(passage.id) || [];
        const showPassage = hasPassageContent(passage);

        // No passage content → render questions full-width
        if (!showPassage) {
          return (
            <div key={passage.id} className="border-b border-slate-200">
              <div className="max-w-3xl">
                {linkedGroups.map((group, gi) => (
                  <div key={group.id}>
                    {gi > 0 && <hr className="border-slate-200" />}
                    <QuestionGroupRenderer
                      group={group}
                      answers={answers}
                      onAnswer={onAnswer}
                      onQuestionFocus={handleQuestionFocus}
                      onQuestionBlur={handleQuestionBlur}
                      focusedBlank={focusedBlank}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={passage.id}
            className="flex border-b border-slate-200"
          >
            {/* Left: passage — flows with outer scroll */}
            <div
              className="border-r border-slate-200"
              style={{ width: "70%" }}
            >
              <div
                className={`px-6 py-5 prose prose-sm max-w-none ${
                  highlightEnabled ? "selection:bg-yellow-200" : ""
                }`}
                style={passageStyle}
              >
                <PassageMedia
                  passage={passage}
                  highlightEnabled={highlightEnabled}
                  processBlanks={hasCompletionGroups}
                  focusedBlank={focusedBlank}
                  onBlankClick={handleBlankClick}
                />
              </div>
            </div>

            {/* Right: questions — sticky with independent scroll */}
            <div style={{ width: "30%" }}>
              <div className="sticky top-0 overflow-y-auto scrollbar-hide" style={{ maxHeight: "calc(100vh - 120px)" }}>
              {linkedGroups.length > 0 ? (
                linkedGroups.map((group, gi) => (
                  <div key={group.id} className="overflow-x-auto">
                    {gi > 0 && <hr className="border-slate-200" />}
                    <QuestionGroupRenderer
                      group={group}
                      answers={answers}
                      onAnswer={onAnswer}
                      onQuestionFocus={handleQuestionFocus}
                      onQuestionBlur={handleQuestionBlur}
                      focusedBlank={focusedBlank}
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
  sectionInstructions,
}: {
  passages: PassageFromAPI[];
  groups: QuestionGroupFromAPI[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  highlightEnabled?: boolean;
  sectionInstructions?: string | null;
}) {
  const anyPassageHasContent = passages.some(hasPassageContent);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {sectionInstructions && (
        <div className="px-6 py-3 bg-blue-50 border-b border-slate-200 shrink-0">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={sectionInstructions} />
          </div>
        </div>
      )}

      {anyPassageHasContent ? (
        /* Split layout: passage left, questions right */
        <div className="flex flex-1 overflow-hidden">
          <div
            className="overflow-y-auto border-r border-slate-200"
            style={{ width: "70%" }}
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
              {passages.map((passage) => (
                <div key={passage.id}>
                  <PassageMedia passage={passage} highlightEnabled={highlightEnabled} />
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-y-auto" style={{ width: "30%" }}>
            {groups.map((group, gi) => (
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
      ) : (
        /* No passage content: questions full-width */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl">
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
      )}
    </div>
  );
}
