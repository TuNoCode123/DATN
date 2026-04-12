'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

export function BlogCta() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) return null;

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto text-center">
        <div className="brutal-card p-10 sm:p-14">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary border-2 border-foreground shadow-[2px_2px_0px_var(--foreground)] mb-5">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground mb-3">
            Put this into practice
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8 max-w-md mx-auto">
            Start a free NEU Study account and apply these strategies on real
            practice tests with AI-powered feedback.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="brutal-btn-fill px-7 py-3 text-sm inline-flex items-center gap-2"
            >
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/blog"
              className="brutal-btn bg-white text-foreground px-6 py-3 text-sm"
            >
              Browse more articles
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
