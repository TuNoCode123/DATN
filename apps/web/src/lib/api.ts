import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send ALB session cookie on every request
});

// ── Response interceptor: redirect to login on 401 ──
// With ALB auth, there's no token refresh — ALB handles session renewal.
// A 401 means the ALB session expired or the user isn't authenticated.
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
