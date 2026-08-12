'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const message =
    reason === 'session_expired'
      ? 'Your session has expired. Please sign in again.'
      : reason === 'account_removed'
        ? 'Your account is no longer available. Please contact support or create a new account.'
        : 'You need to sign in to access this page.';

  return (
    <div className="text-center">
      <div className="flex justify-center mb-5">
        <div className="w-14 h-14 bg-red-100 border-2 border-border-strong rounded-xl flex items-center justify-center shadow-brutal-sm">
          <ShieldX className="w-7 h-7 text-red-600" />
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-foreground mb-2">
        Access Denied
      </h1>
      <p className="text-sm text-slate-500 mb-8">{message}</p>

      <div className="flex flex-col gap-3">
        <Link
          href="/login"
          className="brutal-btn bg-primary text-white py-3 text-sm flex items-center justify-center gap-2"
        >
          Sign in
        </Link>

        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-foreground mt-2"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <UnauthorizedContent />
    </Suspense>
  );
}
