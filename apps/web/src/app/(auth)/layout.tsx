import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mb-8 cursor-pointer">
        <div className="w-10 h-10 bg-rose-100 border-2 border-border-strong rounded-xl flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-rose-600" />
        </div>
        <span className="text-xl font-bold text-foreground font-heading">
          IELTS AI
        </span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md brutal-card p-8">
        {children}
      </div>

      {/* Footer */}
      <p className="text-xs text-slate-400 mt-6">
        &copy; 2026 IELTS AI Platform. All rights reserved.
      </p>
    </div>
  );
}
