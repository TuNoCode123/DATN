'use client';

import { PassageQuestionsLayout } from './passage-questions';
import { QuestionsOnlyLayout } from './questions-only';
import { AudioQuestionsLayout } from './audio-questions';
import { AudioVisualLayout } from './audio-visual';
import type { LayoutProps } from './types';

export function LayoutRouter(props: LayoutProps) {
  const { section } = props;

  // Derive layout from section content:
  // - Has passages (Reading) → passage + questions split view
  // - Has audio + has group images → audio visual
  // - Has audio → audio questions
  // - Default → questions only
  const hasPassages = section.passages && section.passages.length > 0;
  const hasAudio = !!section.audioUrl;
  const hasGroupImages = section.questionGroups.some((g) => g.imageUrl);

  if (hasPassages) {
    return <PassageQuestionsLayout {...props} />;
  }
  if (hasAudio && hasGroupImages) {
    return <AudioVisualLayout {...props} />;
  }
  if (hasAudio) {
    return <AudioQuestionsLayout {...props} />;
  }
  return <QuestionsOnlyLayout {...props} />;
}

export type { LayoutProps, SectionFromAPI, QuestionFromAPI, QuestionGroupFromAPI } from './types';
