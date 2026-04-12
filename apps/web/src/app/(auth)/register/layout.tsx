import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Create a Free Account',
  description:
    'Sign up free and start preparing for IELTS, TOEIC, and HSK with 10,000+ practice tests and AI pronunciation feedback.',
  path: '/register',
});

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
