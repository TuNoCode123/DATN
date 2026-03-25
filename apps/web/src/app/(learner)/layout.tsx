'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, setUser } = useAuthStore();

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      api
        .get('/users/me')
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        });
    }
  }, [user, setUser]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}
