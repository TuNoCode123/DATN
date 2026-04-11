import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Pronunciation Checker — Free English & Chinese Speaking Feedback',
  description:
    'Practice English and Mandarin pronunciation with phoneme-level AI scoring, fluency feedback, and native model audio. Built for IELTS Speaking, TOEIC, and HSK learners.',
  path: '/pronunciation',
  keywords: [
    'ai pronunciation checker',
    'english pronunciation test online',
    'chinese pronunciation ai',
    'ielts speaking practice ai',
    'free pronunciation app',
  ],
});

export default function PronunciationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
