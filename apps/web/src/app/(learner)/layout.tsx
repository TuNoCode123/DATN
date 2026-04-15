'use client';

import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';
import { FloatingBubbles } from '@/components/floating-bubbles';
import { useSocketLifecycle } from '@/features/chat/hooks/use-socket-lifecycle';

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useSocketLifecycle();

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        {children}
      </main>
      <Footer />
      <FloatingBubbles />
    </div>
  );
}
