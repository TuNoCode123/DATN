'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, LayoutDashboard, Sparkles, BookOpen, Mic } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { Reveal } from './reveal';

export function CtaSection() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-accent-blue">
      <Reveal className="max-w-3xl mx-auto">
        <div className="brutal-card p-10 sm:p-14 text-center">
          {isAuthenticated && user ? (
            <>
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-border-strong rounded-full text-xs font-bold text-amber-800 shadow-[2px_2px_0_0_#1e293b]">
                <Sparkles className="w-3.5 h-3.5" />
                Welcome back
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
                Hey {user.displayName || user.email.split('@')[0]}, ready to keep going?
              </h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                Pick up where you left off, or jump into a new test. Your progress is saved.
              </p>

              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="brutal-btn cta-glow bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2 group"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/tests"
                  className="brutal-btn bg-secondary text-secondary-foreground px-8 py-3.5 text-sm flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  Browse Tests
                </Link>
                <Link
                  href="/pronunciation"
                  className="brutal-btn bg-white text-foreground px-8 py-3.5 text-sm flex items-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Pronunciation
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
                Ready to Start Learning?
              </h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                Join over 2 million students preparing for IELTS, TOEIC, HSK and
                more. First 7 days are completely free!
              </p>

              <div className="flex flex-wrap justify-center gap-4 mb-6">
                <Link
                  href="/register"
                  className="brutal-btn cta-glow bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2 group"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pronunciation"
                  className="brutal-btn bg-secondary text-secondary-foreground px-8 py-3.5 text-sm"
                >
                  Try Pronunciation
                </Link>
              </div>

              <div className="flex justify-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  No credit card required
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Cancel anytime
                </span>
              </div>
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}
