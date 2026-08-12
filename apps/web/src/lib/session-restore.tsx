'use client';

import { useEffect } from 'react';
import { api } from './api';
import { useAuthStore } from './auth-store';
import { onAuthChange } from './firebase';

export function SessionRestore() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    // Firebase restores its cached session (IndexedDB) before this fires,
    // so `user` here reflects "signed in on this device," not a fresh
    // network round-trip. We still hit /auth/me to resolve the DB profile
    // (id/displayName/role) that the Identity Platform token alone doesn't
    // carry, and to catch the local-dev cookie-based bypass path.
    const unsubscribe = onAuthChange((user) => {
      if (!user) {
        setUser(null);
        return;
      }
      api
        .get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => setUser(null));
    });

    // Local dev (no Firebase project configured): still try /auth/me once,
    // so the dev-account cookie bypass keeps working.
    if (process.env.NODE_ENV !== 'production') {
      api
        .get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          // Not logged in — stay as guest
        });
    }

    return unsubscribe;
  }, [setUser]);

  return null;
}
