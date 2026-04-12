'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth-store';

interface ExamCtaButtonProps {
  authedHref: string;
  guestHref?: string;
  className?: string;
  children: ReactNode;
}

export function ExamCtaButton({
  authedHref,
  guestHref = '/register',
  className,
  children,
}: ExamCtaButtonProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const href = isAuthenticated ? authedHref : guestHref;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
