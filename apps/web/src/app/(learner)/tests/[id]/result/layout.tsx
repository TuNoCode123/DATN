import { RequireAuth } from '@/components/require-auth';

export default function ResultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
