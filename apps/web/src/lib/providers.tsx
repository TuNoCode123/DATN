'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { api } from './api';
import { useAuthStore } from './auth-store';

function SessionRestore() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    api
      .get('/auth/cognito/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        // Not logged in or token expired — stay as guest
      });
  }, [setUser]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#22C55E',
          },
        }}
      >
        <AntdApp>
          <SessionRestore />
          {children}
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
