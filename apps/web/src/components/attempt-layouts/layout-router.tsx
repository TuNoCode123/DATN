'use client';

import { PassageQuestionsLayout } from './passage-questions';
import { QuestionsOnlyLayout } from './questions-only';
import { AudioQuestionsLayout } from './audio-questions';
import { AudioVisualLayout } from './audio-visual';
import { WritingQuestionsLayout } from './writing-questions';
import { ToeicWritingLayout } from './toeic-writing-layout';
import { SpeakingQuestionsLayout } from './speaking-layout';
import type { LayoutProps } from './types';

const HSK_WRITING_TYPES = ['SENTENCE_REORDER', 'KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION'];

const TOEIC_SPEAKING_TYPES = [
  'READ_ALOUD',
  'DESCRIBE_PICTURE',
  'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION',
  'EXPRESS_OPINION',
];

const TOEIC_WRITING_TYPES = [
  'WRITE_SENTENCES',
  'RESPOND_WRITTEN_REQUEST',
  'WRITE_OPINION_ESSAY',
];

export function LayoutRouter(props: LayoutProps) {
  const { section } = props;

  const hasPassages = section.passages && section.passages.length > 0;
  const hasAudio = !!section.audioUrl;
  const hasGroupImages = section.questionGroups.some((g) => g.imageUrl);
  const hasWritingQuestions = section.questionGroups.some((g) =>
    HSK_WRITING_TYPES.includes(g.questionType),
  );
  const hasToeicSpeaking = section.questionGroups.some((g) =>
    TOEIC_SPEAKING_TYPES.includes(g.questionType),
  );
  const hasToeicWriting = section.questionGroups.some((g) =>
    TOEIC_WRITING_TYPES.includes(g.questionType),
  );

  // TOEIC Speaking/Writing layouts take priority
  if (hasToeicSpeaking) {
    return <SpeakingQuestionsLayout {...props} attemptId={props.attemptId} />;
  }
  if (hasToeicWriting) {
    return <ToeicWritingLayout {...props} />;
  }
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
