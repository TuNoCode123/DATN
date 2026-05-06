'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface DevAccount {
  email: string;
  role: 'ADMIN' | 'STUDENT';
  label: string;
}

export default function DevLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  const [accounts, setAccounts] = useState<DevAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DevAccount[]>('/auth/dev/accounts')
      .then((res) => setAccounts(res.data))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 403) {
          setError('Dev auth is disabled. The backend is not in local-dev mode.');
        } else {
          setError('Could not reach the API. Is the backend running on port 4000?');
        }
        setAccounts([]);
      });
  }, []);

  const handlePick = async (email: string) => {
    setLoadingEmail(email);
    setError(null);
    try {
      await api.post('/auth/dev/login', { email });
      window.location.href = returnUrl;
    } catch {
      setError('Login failed. Check the API logs.');
      setLoadingEmail(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-center text-foreground mb-2">
        Dev Login
      </h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Pick a seeded account to impersonate (local development only)
      </p>

      {error && (
        <div className="brutal-card bg-amber-50 border-amber-400 p-3 mb-6 text-center">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      {accounts === null && (
        <p className="text-center text-sm text-slate-500">Loading…</p>
      )}

      {accounts && accounts.length > 0 && (
        <div className="flex flex-col gap-3">
          {accounts.map((acc) => (
            <button
              key={acc.email}
              onClick={() => handlePick(acc.email)}
              disabled={loadingEmail !== null}
              className="brutal-btn bg-white text-foreground py-3 text-sm flex flex-col items-center justify-center gap-0.5 border-2 border-border-strong hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="font-bold">
                {loadingEmail === acc.email ? 'Signing in…' : `Login as ${acc.label}`}
              </span>
              <span className="text-xs text-slate-500">
                {acc.email} · {acc.role}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Back to normal login
        </Link>
      </p>
    </div>
  );
}
