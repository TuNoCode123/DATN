'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUpWithEmail, firebaseAuthErrorMessage } from '@/lib/firebase';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const inputClass =
  'w-full border-2 border-border-strong rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email, password, displayName || undefined);
      const res = await api.get('/auth/me');
      setUser(res.data);
      router.replace('/dashboard');
    } catch (err) {
      setError(firebaseAuthErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-center text-foreground mb-2">
        Create Account
      </h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Start your IELTS, TOEIC, HSK &amp; language exam journey today
      </p>

      {error && (
        <div className="brutal-card bg-red-50 border-red-300 p-3 mb-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          autoComplete="name"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
        />
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
          autoComplete="new-password"
          placeholder="Password (min. 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />

        <button
          type="submit"
          disabled={submitting}
          className="brutal-btn bg-primary text-white py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>

        {/* Google Sign-In: deferred, see login/page.tsx's note. */}

        <p className="text-center text-sm text-slate-500 mt-2">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline cursor-pointer">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
