'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordReset, firebaseAuthErrorMessage } from '@/lib/firebase';

const inputClass =
  'w-full border-2 border-border-strong rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(firebaseAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-foreground mb-2">Check your email</h1>
        <p className="text-sm text-slate-500 mb-8">
          If an account exists for {email}, a password reset link is on its way.
        </p>
        <Link href="/login" className="text-sm text-primary font-semibold hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-center text-foreground mb-2">
        Reset your password
      </h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Enter your email and we&apos;ll send you a reset link.
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

        <button
          type="submit"
          disabled={submitting}
          className="brutal-btn bg-primary text-white py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>

        <Link href="/login" className="text-center text-sm text-primary font-semibold hover:underline">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
