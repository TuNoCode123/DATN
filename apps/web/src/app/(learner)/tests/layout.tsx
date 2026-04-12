import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Practice Tests Library — IELTS, TOEIC, HSK, TOPIK & JLPT',
  description:
    'Browse 10,000+ free practice tests for IELTS Academic, IELTS General, TOEIC Listening & Reading, HSK 1–6, TOPIK, and JLPT. Filter by exam type and difficulty.',
  path: '/tests',
  keywords: [
    'free practice tests',
    'ielts practice test',
    'toeic practice test',
    'hsk practice test',
    'topik practice test',
    'jlpt practice test',
  ],
});

export default function TestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
