'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Spin } from 'antd';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      if (user) {
        setChecking(false);
        return;
      }

      try {
        const res = await api.get('/auth/cognito/me');
        setUser(res.data);
        setChecking(false);
      } catch {
        const returnUrl = encodeURIComponent(pathname);
        router.replace(`/login?returnUrl=${returnUrl}`);
      }
    }

    check();
  }, [user, router, pathname, setUser]);

  if (checking) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
}
