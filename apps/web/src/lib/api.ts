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
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
          withCredentials: true,
        });
        return api(originalRequest);
      } catch {
        window.location.href = '/unauthorized?reason=session_expired';
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
