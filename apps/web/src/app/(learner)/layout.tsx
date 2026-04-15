'use client';

import dynamic from 'next/dynamic';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';
import { AntdProvider } from '@/lib/antd-provider';
import { useSocketLifecycle } from '@/features/chat/hooks/use-socket-lifecycle';

const FloatingBubbles = dynamic(
  () =>
    import('@/components/floating-bubbles').then((m) => m.FloatingBubbles),
  { ssr: false },
);

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useSocketLifecycle();

  return (
    <AntdProvider>
      <div className="min-h-screen bg-cream flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
          {children}
        </main>
        <Footer />
        <FloatingBubbles />
      </div>
    </AntdProvider>
  );
}
