'use client';

import { PassageQuestionsLayout } from './passage-questions';
import { QuestionsOnlyLayout } from './questions-only';
import { AudioQuestionsLayout } from './audio-questions';
import { AudioVisualLayout } from './audio-visual';
import { WritingQuestionsLayout } from './writing-questions';
import type { LayoutProps } from './types';

const HSK_WRITING_TYPES = ['SENTENCE_REORDER', 'KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION'];

export function LayoutRouter(props: LayoutProps) {
  const { section } = props;

  const hasPassages = section.passages && section.passages.length > 0;
  const hasAudio = !!section.audioUrl;
  const hasGroupImages = section.questionGroups.some((g) => g.imageUrl);
  const hasWritingQuestions = section.questionGroups.some((g) =>
    HSK_WRITING_TYPES.includes(g.questionType),
  );

  if (hasPassages) {
    return <PassageQuestionsLayout {...props} />;
  }
  if (hasWritingQuestions) {
    return <WritingQuestionsLayout {...props} />;
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
