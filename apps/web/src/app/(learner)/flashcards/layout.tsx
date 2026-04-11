import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Flashcards — Smart Vocabulary Decks for IELTS, TOEIC & HSK',
  description:
    'Create AI-generated flashcard decks with definitions, example sentences, IPA, and audio. Built-in spaced repetition for IELTS, TOEIC, and HSK vocabulary.',
  path: '/flashcards',
  keywords: [
    'ai flashcards',
    'spaced repetition app',
    'vocabulary flashcards',
    'ielts vocabulary flashcards',
    'hsk flashcards',
    'flashcard generator',
  ],
});

export default function FlashcardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
