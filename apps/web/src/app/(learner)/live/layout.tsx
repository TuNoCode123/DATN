import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Live Exams — Real-Time Multiplayer Quiz Battles for Language Learners',
  description:
    'Join Kahoot-style live exam sessions with classmates and friends. Real-time multiplayer practice for IELTS, TOEIC, and HSK with leaderboards and instant scoring.',
  path: '/live',
  keywords: [
    'live exam',
    'multiplayer quiz',
    'kahoot english test',
    'live ielts practice',
    'real-time language quiz',
  ],
});

export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
