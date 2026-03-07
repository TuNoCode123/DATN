'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, setUser, logout } = useAuthStore();

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !user) {
      api.get('/users/me')
        .then(({ data }) => setUser(data))
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        });
    }
  }, [user, setUser]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/tests" className="text-xl font-bold text-blue-600 hover:text-blue-700">
            IELTS AI Platform
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex gap-6 text-sm text-gray-600">
              <Link href="/dashboard" className="hover:text-blue-600">Dashboard</Link>
              <Link href="/tests" className="hover:text-blue-600">Tests</Link>
            </nav>
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-700 font-medium">
                  {user.displayName || user.email}
                </span>
                <button
                  onClick={() => {
                    logout();
                    window.location.href = '/login';
                  }}
                  className="text-gray-500 hover:text-red-500 transition-colors"
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
