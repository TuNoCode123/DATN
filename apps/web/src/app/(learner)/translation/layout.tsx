import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Translator for Language Learners — Contextual English & Chinese',
  description:
    'Free contextual AI translator with formality controls, alternative phrasings, and learner explanations. Built for IELTS, TOEIC, and HSK students who want to understand, not just copy.',
  path: '/translation',
  keywords: [
    'ai translator',
    'english chinese translator',
    'ai translation for learners',
    'contextual translation ai',
    'learner translator',
  ],
});

import { RequireAuth } from '@/components/require-auth';

export default function TranslationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
