import { Response } from 'express';
import { randomUUID } from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';

// In production, frontend (web.neu-study.online) and API (api.neu-study.online)
// are on different subdomains. SameSite=None + Secure is required for cross-origin
// cookie sending (e.g. WebSocket upgrade handshake).
const SAME_SITE = IS_PROD ? ('none' as const) : ('strict' as const);
const COOKIE_DOMAIN = IS_PROD ? '.neu-study.online' : undefined;

export const COOKIE_OPTIONS = {
  access: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: SAME_SITE,
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 min
  },
  refresh: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: SAME_SITE,
    domain: COOKIE_DOMAIN,
    path: '/api/auth/cognito',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  csrf: {
    httpOnly: false, // JS must read this to send as X-CSRF-Token header
    secure: IS_PROD,
    sameSite: SAME_SITE,
    domain: COOKIE_DOMAIN,
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
  res.clearCookie('access_token', { path: '/', domain: COOKIE_DOMAIN });
  res.clearCookie('refresh_token', { path: '/api/auth/cognito', domain: COOKIE_DOMAIN });
  res.clearCookie('csrf_token', { path: '/', domain: COOKIE_DOMAIN });
  res.clearCookie('id_token', { path: '/', domain: COOKIE_DOMAIN });
}
