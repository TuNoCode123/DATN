'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';
import { ChatBubble } from '@/components/chat/chat-bubble';

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Restore session on mount (cookie-based auth)
  useEffect(() => {
    if (!user) {
      api
        .get('/auth/cognito/me')
        .then(({ data }) => setUser(data))
        .catch(() => {
          // Not authenticated — cookies missing or expired
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        {children}
      </main>
      <Footer />
      <ChatBubble />
    </div>
  );
}
