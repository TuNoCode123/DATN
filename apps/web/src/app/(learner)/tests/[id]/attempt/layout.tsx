import { RequireAuth } from '@/components/require-auth';

export default function AttemptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
