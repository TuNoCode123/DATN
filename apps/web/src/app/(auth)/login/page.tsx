'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmail, firebaseAuthErrorMessage } from '@/lib/firebase';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const inputClass =
  'w-full border-2 border-border-strong rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const returnUrl = searchParams.get('returnUrl');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    urlError === 'auth_failed' ? 'Sign in failed. Please try again.' : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      const res = await api.get('/auth/me');
      setUser(res.data);
      router.replace(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard');
    } catch (err) {
      setError(firebaseAuthErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-center text-foreground mb-2">
        Welcome Back
      </h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Sign in to continue your learning journey
      </p>

      {error && (
        <div className="brutal-card bg-red-50 border-red-300 p-3 mb-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />

        <button
          type="submit"
          disabled={submitting}
          className="brutal-btn bg-primary text-white py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <Link
          href="/forgot-password"
          className="text-center text-sm text-primary font-semibold hover:underline"
        >
          Forgot password?
        </Link>

        {/* Google Sign-In: deferred — email/password ships first (see
            docs/plans/gcp-migration-spec.md §4/§8). Re-add once
            infra-gcp's identity-platform module has real OAuth
            credentials and google_sign_in_enabled flips to true. */}

        <p className="text-center text-sm text-slate-500 mt-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-primary font-semibold hover:underline cursor-pointer">
            Sign up
          </Link>
        </p>

        {process.env.NODE_ENV !== 'production' && (
          <p className="text-center text-xs text-slate-400 mt-1">
            <Link href="/dev-login" className="hover:underline">
              Dev login (local accounts)
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
