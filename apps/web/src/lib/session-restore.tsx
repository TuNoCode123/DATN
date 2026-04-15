'use client';

import { useEffect } from 'react';
import { api } from './api';
import { useAuthStore } from './auth-store';

export function SessionRestore() {
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
