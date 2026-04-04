import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly cookies on every request
});

// ── Request interceptor: attach CSRF token for state-changing methods ──
api.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const stateMethods = ['post', 'put', 'patch', 'delete'];
    if (stateMethods.includes(config.method ?? '')) {
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
  }
  return config;
});

// ── Response interceptor: auto-refresh on 401 ──
// Paths that should never trigger a refresh+redirect cycle
const AUTH_PATHS = ['/auth/cognito/me', '/auth/cognito/refresh', '/auth/cognito/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestPath = originalRequest?.url ?? '';

    // Never retry auth endpoints — just let them fail silently
    if (AUTH_PATHS.some((p) => requestPath.includes(p))) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
          withCredentials: true,
        });
        return api(originalRequest);
      } catch {
        // Only redirect if not already on the unauthorized page
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/unauthorized')) {
          window.location.href = '/unauthorized?reason=session_expired';
        }
      }
    }
    return Promise.reject(error);
  },
);

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
