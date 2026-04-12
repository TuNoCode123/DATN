import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Log In',
  description:
    'Log in to NEU Study to continue practicing for IELTS, TOEIC, and HSK with AI-powered feedback.',
  path: '/login',
  noindex: true,
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
