import { Response } from 'express';
import { randomUUID } from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';

export const COOKIE_OPTIONS = {
  access: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 min
  },
  refresh: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict' as const,
    path: '/api/auth/cognito',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  csrf: {
    httpOnly: false, // JS must read this to send as X-CSRF-Token header
    secure: IS_PROD,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 min
  },
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  idToken?: string,
) {
  const csrfToken = randomUUID();

  res.cookie('access_token', accessToken, COOKIE_OPTIONS.access);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTIONS.refresh);
  res.cookie('csrf_token', csrfToken, COOKIE_OPTIONS.csrf);
  if (idToken) {
    res.cookie('id_token', idToken, COOKIE_OPTIONS.access);
  }
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth/cognito' });
  res.clearCookie('csrf_token', { path: '/' });
  res.clearCookie('id_token', { path: '/' });
}
