import axios from 'axios';
import { getIdToken } from './firebase';

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

// Attach a fresh Identity Platform ID token to every request.
api.interceptors.request.use(async (config) => {
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
    const requestPath = error.config?.url ?? '';

    // Don't redirect on auth-related endpoints to avoid loops
    if (requestPath.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/unauthorized')) {
        window.location.href = '/unauthorized?reason=session_expired';
      }
    }
    return Promise.reject(error);
  },
);
