import { RequireAuth } from '@/components/require-auth';

export default function CreditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
