import axios from 'axios';
import { authReady, getIdToken } from './firebase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // Kept for local dev only: the backend's dev-account bypass (POST
  // /auth/dev/login) sets an httpOnly cookie when no Identity Platform
  // project is configured. Production requests carry a real user, so this
  // has nothing to send and is a no-op.
  withCredentials: true,
});

// Attach a fresh Identity Platform ID token to every request. Waits for
// Firebase's async session restore first — otherwise a request fired on
// the very first render (e.g. a hard refresh mid-test) reads a not-yet-
// restored `auth.currentUser`, goes out with no token, and gets a false
// 401 that bounces an actually-logged-in user to /login.
api.interceptors.request.use(async (config) => {
  await authReady;
  const token = await getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: redirect to login on 401 ──
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { _retriedWithFreshToken?: boolean }) | undefined;
    const requestPath = config?.url ?? '';

    // Don't redirect on auth-related endpoints to avoid loops
    if (requestPath.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      // The cached ID token can be presented stale (near expiry, clock
      // skew, a request that was in flight when it rolled over) even
      // though the Firebase session itself is still perfectly valid — a
      // forced refresh almost always fixes it. Only treat this as a real
      // "logged out" state if a freshly-refreshed token still gets 401'd.
      if (config && !config._retriedWithFreshToken) {
        config._retriedWithFreshToken = true;
        const freshToken = await getIdToken(true).catch(() => null);
        if (freshToken) {
          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${freshToken}`;
          return api.request(config);
        }
      }

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/unauthorized')) {
        window.location.href = '/unauthorized?reason=session_expired';
      }
    }
    return Promise.reject(error);
  },
);
