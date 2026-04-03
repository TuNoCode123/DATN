# AWS Cognito Migration Plan (Cookie-Based Auth)

> All tokens stored in `httpOnly` cookies — frontend JS never touches tokens directly.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                           │
│                                                                     │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────────────────┐ │
│  │ Login Btn │───▶│ Cognito Hosted UI│───▶│ /auth/callback page   │ │
│  │ (social / │    │ (Google/FB/Email) │    │ receives ?code=...    │ │
│  │ email+pw) │    └──────────────────┘    │ calls POST /api/auth/ │ │
│  └──────────┘                             │   cognito/session     │ │
│                                           └──────────┬────────────┘ │
│                                                      │              │
│                                    Backend sets httpOnly cookies     │
│                                    via Set-Cookie header             │
│                                                      │              │
│             ┌────────────────────────────────────────┐│              │
│             │  All API calls: withCredentials: true   ││              │
│             │  Browser auto-sends cookies             ││              │
│             │  No Authorization header needed         ││              │
│             └────────────────────────────────────────┘│              │
│                                                       │              │
│     ┌──────────────┐  ┌──────────────┐  ┌────────────┴──────┐      │
│     │ REST API     │  │ WebSocket    │  │ Token Refresh     │      │
│     │ (auto cookie)│  │ (cookie in   │  │ POST /api/auth/   │      │
│     │              │  │  handshake)  │  │  cognito/refresh  │      │
│     └──────┬───────┘  └──────┬───────┘  └───────────────────┘      │
└────────────┼─────────────────┼──────────────────────────────────────┘
             │                 │
             ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (NestJS)                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Cookie Auth Endpoints                                       │   │
│  │                                                              │   │
│  │  POST /auth/cognito/session   — exchange code → set cookies  │   │
│  │  POST /auth/cognito/refresh   — read refresh cookie → renew  │   │
│  │  POST /auth/cognito/logout    — clear cookies                │   │
│  │  GET  /auth/cognito/me        — read access cookie → user    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  CognitoJwtStrategy (reads token from cookie, not header)    │   │
│  │  Verifies RS256 via JWKS endpoint                            │   │
│  │  Extracts cognitoSub → DB user lookup                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  WebSocket Gateway                                           │   │
│  │  Parses cookie from handshake headers                        │   │
│  │  Verifies JWT via same JWKS logic                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  CSRF Protection                                             │   │
│  │  Double-submit cookie pattern (X-CSRF-Token header)          │   │
│  │  Required for all state-changing requests (POST/PUT/DELETE)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Cookie Specification

| Cookie | Value | Flags | Path | Max-Age |
|--------|-------|-------|------|---------|
| `access_token` | Cognito access JWT | `httpOnly`, `Secure`, `SameSite=Strict` | `/` | 15 min (900s) |
| `refresh_token` | Cognito refresh token | `httpOnly`, `Secure`, `SameSite=Strict` | `/api/auth/cognito` | 7 days |
| `csrf_token` | Random UUID | `Secure`, `SameSite=Strict` (**NOT** httpOnly) | `/` | 15 min |

- `access_token` is sent on every request (Path `/`).
- `refresh_token` is only sent to the refresh/logout endpoints (scoped path).
- `csrf_token` is readable by JS so the frontend can send it as `X-CSRF-Token` header.
- In development (`NODE_ENV !== 'production'`), `Secure` flag is disabled so cookies work on `http://localhost`.

---

## Token Flow — Login

```
1. User clicks "Login" / "Login with Google" / "Login with Facebook"
2. Frontend redirects to Cognito Hosted UI URL:
     https://{domain}.auth.{region}.amazoncognito.com/oauth2/authorize
       ?client_id={clientId}
       &response_type=code
       &scope=openid+email+profile
       &redirect_uri={frontend}/auth/callback
       &code_challenge={PKCE challenge}
       &code_challenge_method=S256
       &identity_provider=Google   (optional — for direct social login)

3. User authenticates (email+pw, Google, or Facebook)
4. Cognito redirects to /auth/callback?code=AUTHORIZATION_CODE
5. Frontend callback page calls:
     POST /api/auth/cognito/session
     Body: { code, codeVerifier, redirectUri }

6. Backend exchanges code with Cognito Token endpoint:
     POST https://{domain}.auth.{region}.amazoncognito.com/oauth2/token
     Body: grant_type=authorization_code&code=...&code_verifier=...

7. Backend receives: accessToken, idToken, refreshToken
8. Backend verifies accessToken via JWKS
9. Backend resolves DB user (cognitoSub → email → create)
10. Backend sets httpOnly cookies:
      Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
      Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/cognito; Max-Age=604800
      Set-Cookie: csrf_token=...; Secure; SameSite=Strict; Path=/; Max-Age=900
11. Backend returns user profile JSON: { id, email, displayName, role }
12. Frontend stores user in Zustand (no tokens in JS memory)
```

## Token Flow — API Request

```
1. Frontend makes API call: api.get('/tests')
     → axios configured with withCredentials: true
     → browser auto-attaches access_token cookie
     → for POST/PUT/DELETE: frontend reads csrf_token cookie, sends as X-CSRF-Token header

2. Backend CognitoJwtStrategy:
     → extracts token from req.cookies['access_token']
     → verifies RS256 signature via Cognito JWKS
     → resolves DB user from cognitoSub
     → attaches user to request

3. If 401 (token expired):
     → frontend interceptor calls POST /api/auth/cognito/refresh
     → browser auto-sends refresh_token cookie (path matches)
     → backend exchanges refresh token with Cognito
     → backend sets new access_token + csrf_token cookies
     → frontend retries original request
```

## Token Flow — WebSocket

```
1. Frontend connects: io('/chat', { withCredentials: true })
     → browser sends cookies in the WebSocket upgrade request headers

2. Gateway handleConnection:
     → parses cookie header from socket.handshake.headers.cookie
     → extracts access_token value
     → verifies via JWKS
     → resolves DB user
     → sets socket.data.user

3. On token expiry:
     → gateway emits auth_error
     → frontend calls POST /api/auth/cognito/refresh (new cookies set)
     → frontend reconnects socket (new cookies sent automatically)
```

---

## Implementation Code Snippets

### Backend — Cookie Helper

```typescript
// src/auth/cookie.utils.ts
import { Response } from 'express';

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
    httpOnly: false, // JS must read this
    secure: IS_PROD,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 15 * 60 * 1000,
  },
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  const csrfToken = crypto.randomUUID();

  res.cookie('access_token', accessToken, COOKIE_OPTIONS.access);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTIONS.refresh);
  res.cookie('csrf_token', csrfToken, COOKIE_OPTIONS.csrf);
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth/cognito' });
  res.clearCookie('csrf_token', { path: '/' });
}
```

### Backend — Cognito Auth Controller

```typescript
// src/auth/cognito-auth.controller.ts
@Controller('auth/cognito')
export class CognitoAuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('session')
  async createSession(
    @Body() dto: { code: string; codeVerifier: string; redirectUri: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Exchange authorization code for Cognito tokens
    const tokens = await this.authService.exchangeCodeForTokens(
      dto.code,
      dto.codeVerifier,
      dto.redirectUri,
    );

    // Verify and resolve DB user
    const user = await this.authService.verifyAndResolveUser(tokens.accessToken);

    // Set httpOnly cookies
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    // Exchange refresh token with Cognito
    const tokens = await this.authService.refreshCognitoTokens(refreshToken);
    const user = await this.authService.verifyAndResolveUser(tokens.accessToken);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user) {
    return user;
  }
}
```

### Backend — JWT Strategy (Cookie-Based)

```typescript
// src/auth/cognito-jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Request } from 'express';

// Custom extractor: read from cookie instead of Authorization header
function fromCookie(req: Request): string | null {
  return req?.cookies?.['access_token'] ?? null;
}

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(Strategy, 'cognito-jwt') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const region = configService.get<string>('AWS_REGION');
    const userPoolId = configService.get<string>('COGNITO_USER_POOL_ID');

    super({
      jwtFromRequest: fromCookie, // ← Cookie, not header
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      }),
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: {
    sub: string;
    email?: string;
    username?: string;
    'cognito:groups'?: string[];
    token_use: string;
  }) {
    if (payload.token_use !== 'access') {
      throw new Error('Invalid token type');
    }

    return this.authService.findOrCreateFromCognito(
      payload.sub,
      payload.email ?? payload.username,
      payload['cognito:groups'],
    );
  }
}
```

### Backend — WebSocket Gateway (Cookie-Based)

```typescript
// In chat.gateway.ts — handleConnection
async handleConnection(socket: Socket) {
  try {
    // Parse cookies from handshake headers (browser sends them on WS upgrade)
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = this.parseCookies(cookieHeader);
    const token = cookies['access_token'];

    if (!token) throw new Error('No access_token cookie');

    // Verify Cognito JWT via JWKS (same logic as REST)
    const payload = await this.verifyCognitoJwt(token);
    const user = await this.authService.findOrCreateFromCognito(
      payload.sub,
      payload.email,
      payload['cognito:groups'],
    );

    socket.data.user = user;
    // ... join rooms, track presence (unchanged)

  } catch (error) {
    socket.emit('auth_error', { message: 'Authentication failed' });
    socket.disconnect();
  }
}

private parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    }),
  );
}
```

### Backend — CORS Configuration

```typescript
// main.ts
app.enableCors({
  origin: configService.get('FRONTEND_URL'),
  credentials: true,  // CRITICAL: allows cookies cross-origin
});
```

### Backend — Cookie Parser Middleware

```bash
pnpm add cookie-parser
pnpm add -D @types/cookie-parser
```

```typescript
// main.ts
import * as cookieParser from 'cookie-parser';
app.use(cookieParser());
```

### Backend — CSRF Guard

```typescript
// src/auth/guards/csrf.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    // Only check state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const csrfCookie = req.cookies?.['csrf_token'];
    const csrfHeader = req.headers['x-csrf-token'];

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}
```

### Frontend — API Interceptor (Updated)

```typescript
// src/lib/api.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // ← Send cookies on every request
});

// Read csrf_token cookie and attach as header for state-changing requests
api.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const methods = ['post', 'put', 'patch', 'delete'];
    if (methods.includes(config.method ?? '')) {
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
  }
  return config;
});

// On 401: attempt cookie refresh, then retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // This call sends refresh_token cookie automatically
        await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
          withCredentials: true,
        });
        // New cookies are set by the response — just retry
        return api(originalRequest);
      } catch {
        window.location.href = '/login';
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
```

### Frontend — Socket Connection (Updated)

```typescript
// src/lib/socket.ts
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useChatStore } from './chat-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket && !socket.disconnected) return socket;

  socket = io(`${SOCKET_URL}/chat`, {
    withCredentials: true,  // ← Browser sends cookies on WS upgrade
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    // No auth callback needed — cookies are sent automatically
  });

  socket.on('connect', () => {
    useChatStore.getState().setSocketConnected(true);
  });

  socket.on('disconnect', () => {
    useChatStore.getState().setSocketConnected(false);
  });

  socket.on('auth_error', async () => {
    try {
      // Refresh cookies via backend
      await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
        withCredentials: true,
      });
      // Reconnect — new cookies will be sent automatically
      socket?.connect();
    } catch {
      socket?.disconnect();
      socket = null;
      useChatStore.getState().setSocketConnected(false);
    }
  });

  socket.on('connect_error', async (err) => {
    if (err.message?.includes('Unauthorized') || err.message?.includes('token')) {
      try {
        await axios.post(`${API_BASE_URL}/auth/cognito/refresh`, {}, {
          withCredentials: true,
        });
        socket?.connect();
      } catch {
        // Ignore — reconnection logic will handle
      }
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    useChatStore.getState().setSocketConnected(false);
  }
}

export function getSocket(): Socket | null {
  return socket;
}
```

### Frontend — Auth Callback Page

```tsx
// src/app/(auth)/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get('code');
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

    if (!code || !codeVerifier) {
      router.replace('/login');
      return;
    }

    api.post('/auth/cognito/session', {
      code,
      codeVerifier,
      redirectUri: `${window.location.origin}/auth/callback`,
    })
      .then(({ data }) => {
        // Cookies are set by the response — just update Zustand
        useAuthStore.getState().setUser(data);
        sessionStorage.removeItem('pkce_code_verifier');
        router.replace('/');
      })
      .catch(() => router.replace('/login'));
  }, [params, router]);

  return <div>Logging in...</div>;
}
```

### Frontend — Login Page (Cognito Redirect)

```typescript
// src/lib/cognito.ts
// Lightweight helper — no Amplify SDK needed for cookie approach

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/auth/callback`
  : '';

// Generate PKCE challenge
async function generatePKCE() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  sessionStorage.setItem('pkce_code_verifier', verifier);
  return challenge;
}

export async function loginWithCognito(provider?: 'Google' | 'Facebook') {
  const challenge = await generatePKCE();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(provider && { identity_provider: provider }),
  });
  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

export async function logoutFromCognito() {
  // Clear backend cookies
  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/cognito/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  // Redirect to Cognito logout
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${window.location.origin}/login`,
  });
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`;
}
```

---

## Security Comparison

| Threat | localStorage (old) | httpOnly Cookie (new) |
|--------|--------------------|-----------------------|
| **XSS steals tokens** | Vulnerable — JS reads localStorage | Protected — JS can't read httpOnly cookies |
| **CSRF** | Not vulnerable (no cookies) | Mitigated via double-submit csrf_token |
| **Token in browser history** | No | No (cookies aren't in URL) |
| **Token in JS memory** | Yes (Zustand store) | No — only user profile, never tokens |
| **Man-in-middle** | Depends on HTTPS | `Secure` flag enforces HTTPS |
| **Cross-site leakage** | N/A | `SameSite=Strict` blocks cross-origin |

---

## Migration Rollout

```
Phase 1: terraform apply — create Cognito User Pool + providers
Phase 2: Deploy backend with cookie endpoints + JWKS strategy
         Keep old /auth/* endpoints active (dual mode)
Phase 3: Deploy frontend with Cognito login + cookie flow
Phase 4: Deploy UserMigration Lambda for seamless existing-user migration
Phase 5: Monitor until all active users have migrated
Phase 6: Remove old /auth/login, /auth/register, /auth/refresh endpoints
Phase 7: Make passwordHash nullable in schema
```
