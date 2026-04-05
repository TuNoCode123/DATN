"use client";

import { useState, useCallback, useEffect } from "react";
import { RichContent } from "@/components/rich-content";
import { AudioPlayer } from "@/components/ui/audio-player";
import { TranscriptSection } from "@/components/ui/transcript-section";
import { getImageSizeClasses } from "@/lib/image-size";
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

/** Renders passage media: audio always on top, then image(s) with layout config */
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
  const hasMultipleImages = Array.isArray(passage.images) && passage.images.length > 0;
  const hasImage = !!passage.imageUrl;
  const layout = passage.imageLayout || 'vertical';
  const isBeside = layout === 'horizontal' || layout === 'beside-left' || layout === 'beside-right';
  const isBelowText = layout === 'below-text';
  const sizeClasses = getImageSizeClasses(passage.imageSize);

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

  // Check if there's actual text content (not just empty/placeholder)
  const rawText = passage.contentHtml.replace(/<[^>]*>/g, '').trim();
  const hasTextContent = rawText.length > 0 && !rawText.startsWith('Enter passage text here');

  // Multi-image mode: render all images stacked vertically
  if (hasMultipleImages) {
    return (
      <>
        {hasAudio && (
          <div className="mb-3">
            <AudioPlayer src={passage.audioUrl!} />
            {passage.transcript && (
              <TranscriptSection html={passage.transcript} className="mt-2" />
            )}
          </div>
        )}
        <div className="space-y-3">
          {passage.images!.map((img, idx) => (
            <div key={idx}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={`${passage.title || 'Passage'} - image ${idx + 1}`}
                className={`${getImageSizeClasses(img.size)} w-full h-auto rounded-lg object-contain`}
              />
            </div>
          ))}
        </div>
        {hasTextContent && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div className="mt-3" onClick={handleContentClick}>
            <RichContent html={contentHtml} className={contentClassName} />
          </div>
        )}
      </>
    );
  }

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
          <AudioPlayer src={passage.audioUrl!} />
          {passage.transcript && (
            <TranscriptSection html={passage.transcript} className="mt-2" />
          )}
        </div>
      )}

      {/* Beside layout: image + text side by side (stacks on mobile) */}
      {hasImage && isBeside ? (
        <div className={`flex flex-col md:flex-row gap-4 mb-3 ${layout === 'beside-right' ? 'md:flex-row-reverse' : ''}`}>
          <div className="w-full md:w-2/5 md:shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={passage.imageUrl!}
              alt={passage.title || 'Passage illustration'}
              className="max-w-full w-full h-auto rounded-lg object-contain"
            />
          </div>
          <div className="w-full md:w-3/5 min-w-0">
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
                  className={`${sizeClasses} w-full h-auto rounded-lg object-contain`}
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
                    className={`${sizeClasses} w-full h-auto rounded-lg object-contain`}
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

/** Check if a passage has meaningful visual content (text or image) to display in a side panel */
function hasPassageVisualContent(passage: PassageFromAPI): boolean {
  const hasMultipleImages = Array.isArray(passage.images) && passage.images.length > 0;
  const hasImage = !!passage.imageUrl || hasMultipleImages;
  // Check for inline images in HTML (e.g. <img src="...">)
  const hasInlineImage = /<img\s/i.test(passage.contentHtml);
  // Check for HTML tables
  const hasTable = /<table[\s>]/i.test(passage.contentHtml);
  // Strip HTML tags and whitespace to check for actual text
  const textContent = passage.contentHtml
    .replace(/<[^>]*>/g, '')
    .trim();
  const hasText = textContent.length > 0 && !textContent.startsWith('Enter passage text here');
  return hasImage || hasInlineImage || hasTable || hasText;
}

/** Check if a passage has any content at all (including audio) */
function hasPassageContent(passage: PassageFromAPI): boolean {
  return !!passage.audioUrl || hasPassageVisualContent(passage);
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
    <div className="md:flex-1 md:overflow-y-auto scrollbar-hide">
      {section.instructions && (
        <div className="px-6 py-3 bg-blue-50 border-b border-slate-200">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}
      {sortedPassages.map((passage) => {
        const linkedGroups = groupsByPassage.get(passage.id) || [];
        const hasVisual = hasPassageVisualContent(passage);
        const hasAudio = !!passage.audioUrl;

        // No visual content → render audio (if any) on top, passage content (if any), questions full-width below
        if (!hasVisual) {
          const rawText = passage.contentHtml.replace(/<[^>]*>/g, '').trim();
          const showContent = rawText.length > 0 && !rawText.startsWith('Enter passage text here');
          return (
            <div key={passage.id} className="border-b border-slate-200">
              {hasAudio && (
                <div className="px-6 pt-5 pb-2 min-w-0">
                  <AudioPlayer src={passage.audioUrl!} />
                  {passage.transcript && (
                    <TranscriptSection html={passage.transcript} className="mt-2" />
                  )}
                </div>
              )}
              {showContent && (
                <div className="px-6 py-3 prose prose-sm max-w-none">
                  <RichContent html={passage.contentHtml} className="text-foreground text-sm leading-[1.75]" />
                </div>
              )}
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
            className="flex flex-col md:flex-row border-b border-slate-200 md:h-[calc(100vh-120px)]"
          >
            {/* Left: passage — independent scroll */}
            <div
              className="border-b md:border-b-0 md:border-r border-slate-200 md:overflow-y-auto scrollbar-hide w-full md:w-[70%]"
            >
              <div
                className={`px-4 md:px-6 py-5 prose prose-sm max-w-none ${
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

            {/* Right: questions — independent scroll */}
            <div className="md:overflow-y-auto scrollbar-hide w-full md:w-[30%]">
              {linkedGroups.length > 0 ? (
                linkedGroups.map((group, gi) => (
                  <div key={group.id} className="min-w-0">
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
  const anyPassageHasVisualContent = passages.some(hasPassageVisualContent);
  const audioOnlyPassages = passages.filter(p => !!p.audioUrl && !hasPassageVisualContent(p));

  return (
    <div className="flex flex-col md:flex-1 md:overflow-hidden">
      {sectionInstructions && (
        <div className="px-6 py-3 bg-blue-50 border-b border-slate-200 shrink-0">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={sectionInstructions} />
          </div>
        </div>
      )}

      {anyPassageHasVisualContent ? (
        /* Split layout: passage left, questions right */
        <div className="flex flex-col md:flex-row md:flex-1 md:overflow-hidden">
          <div
            className="md:overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 w-full md:w-[70%]"
          >
            <div
              className={`px-4 md:px-6 py-5 prose prose-sm max-w-none ${
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
          <div className="md:overflow-y-auto w-full md:w-[30%]">
            {groups.map((group, gi) => (
              <div key={group.id} className="min-w-0">
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
        /* No visual passage content: audio on top (if any), questions full-width */
        <div className="flex-1 overflow-y-auto">
          {audioOnlyPassages.map((passage) => {
            const rawText = passage.contentHtml.replace(/<[^>]*>/g, '').trim();
            const showContent = rawText.length > 0 && !rawText.startsWith('Enter passage text here');
            return (
              <div key={passage.id} className="px-6 pt-5 pb-2 min-w-0">
                <AudioPlayer src={passage.audioUrl!} />
                {passage.transcript && (
                  <TranscriptSection html={passage.transcript} className="mt-2" />
                )}
                {showContent && (
                  <div className="mt-3 prose prose-sm max-w-none">
                    <RichContent html={passage.contentHtml} className="text-foreground text-sm leading-[1.75]" />
                  </div>
                )}
              </div>
            );
          })}
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
