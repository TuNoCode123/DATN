# ALB Authentication Migration Plan

## Status: DRAFT
## Date: 2026-04-16

---

## 1. Architecture: Before & After

### Current Flow (Backend-Managed OAuth)

```
Client (SPA)
  │
  ├─ GET /auth/callback?code=xxx&codeVerifier=yyy
  │     (frontend handles Cognito Hosted UI redirect,
  │      sends auth code to backend)
  │
  ▼
NestJS Backend (api.neu-study.online)
  │
  ├─ POST /api/auth/cognito/session
  │     → exchanges auth code for tokens at Cognito /oauth2/token
  │     → verifies Cognito JWT (RS256 via JWKS)
  │     → resolves/creates user in DB
  │     → sets httpOnly cookies (access_token, refresh_token, id_token, csrf_token)
  │
  ├─ POST /api/auth/cognito/refresh
  │     → reads refresh_token cookie
  │     → calls Cognito /oauth2/token with grant_type=refresh_token
  │     → sets new cookies
  │
  ├─ Protected endpoints
  │     → CognitoJwtStrategy extracts access_token from cookie
  │     → verifies RS256 JWT via Cognito JWKS endpoint
  │     → attaches user to request
  │
  └─ WebSocket connections
        → reads access_token from handshake cookies
        → same Cognito JWT verification
```

**Problems:**
- Backend owns the entire token lifecycle (exchange, refresh, verify, cookie management)
- `cognito-auth.service.ts` is 200+ lines of OAuth plumbing
- `cognito-auth.controller.ts` has 4 endpoints that are pure auth infrastructure
- JWKS fetching, token parsing, cookie management — all maintenance surface area
- Every new backend service needs the same Cognito integration
- CSRF token management adds complexity

### Target Flow (ALB-Managed Auth)

```
Client (SPA)
  │
  ├─ Any request to api.neu-study.online
  │
  ▼
ALB (HTTPS Listener, port 443)
  │
  ├─ OIDC authenticate action (before forwarding)
  │     → if no valid session cookie: redirect browser to Cognito Hosted UI
  │     → user authenticates (email/password or Google)
  │     → Cognito redirects back to ALB callback
  │     → ALB exchanges auth code for tokens (server-side, invisible to client)
  │     → ALB validates Cognito tokens
  │     → ALB creates its OWN signed JWT (ES256, not Cognito's RS256)
  │     → ALB sets AWSELBAuthSessionCookie (encrypted session)
  │     → ALB forwards request to backend with 3 headers:
  │
  │   x-amzn-oidc-data:        <ALB-signed JWT with user claims>
  │   x-amzn-oidc-accesstoken: <raw Cognito access token>
  │   x-amzn-oidc-identity:    <user sub/email>
  │
  ▼
NestJS Backend
  │
  ├─ AlbJwtGuard middleware
  │     → extracts x-amzn-oidc-data header
  │     → verifies ES256 signature using ALB's public key
  │       (fetched from https://public-keys.auth.elb.{region}.amazonaws.com/{kid})
  │     → validates issuer, client_id, exp, signer (ALB ARN)
  │     → attaches decoded claims to request
  │
  └─ No OAuth endpoints. No refresh handling. No cookie management.
```

**What ALB handles for you:**
- Redirect to Cognito Hosted UI
- Authorization code exchange (PKCE)
- Token validation
- Session cookie management (AWSELBAuthSessionCookie)
- Token refresh (automatic, transparent)
- Logout (via configured logout endpoint)

**What backend does:**
- Verify one JWT from one header
- Map claims to your user model
- That's it

---

## 2. How ALB Authentication Actually Works

### The ALB JWT (`x-amzn-oidc-data`)

This is NOT a Cognito token. ALB creates its own JWT signed with ES256 (ECDSA P-256). Structure:

```
Header:
{
  "alg": "ES256",
  "kid": "12345678-1234-1234-1234-123456789012",  // rotates
  "typ": "JWT",
  "iss": "https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_cB6Nlt7HH",
  "client": "70bg4si9cmvqp12vc5cl4npe77",
  "signer": "arn:aws:elasticloadbalancing:ap-southeast-2:ACCOUNT_ID:loadbalancer/app/ielts-ai-alb/XXXXXXXX",
  "exp": 1713300000
}

Payload:
{
  "sub": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // Cognito user sub
  "email": "user@example.com",
  "email_verified": "true",
  "cognito:groups": ["Student"],   // if configured in scopes
  "exp": 1713300000,
  "iss": "https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_cB6Nlt7HH"
}
```

### Key Difference from Cognito JWTs

| Property | Cognito JWT | ALB JWT |
|----------|-------------|---------|
| Algorithm | RS256 (RSA) | ES256 (ECDSA) |
| Public key source | `/.well-known/jwks.json` | `https://public-keys.auth.elb.{region}.amazonaws.com/{kid}` |
| Token type | Access/ID/Refresh | Single claims JWT |
| Verification lib | `jwks-rsa` | `aws-jwt-verify` (AlbJwtVerifier) |
| Signer | Cognito | ALB (identified by ARN) |

### Public Key Fetching

ALB rotates signing keys. To verify, fetch the public key by `kid` from the header:

```
GET https://public-keys.auth.elb.ap-southeast-2.amazonaws.com/{kid}
```

Returns a PEM-encoded EC public key. `aws-jwt-verify` handles this automatically with caching.

---

## 3. Terraform Changes (ALB Module)

### New: OIDC Authenticate Action on API Listener Rule

```hcl
# infra/modules/alb/main.tf — Replace the api_host listener rule

resource "aws_lb_listener_rule" "api_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  # ── Step 1: Authenticate via Cognito OIDC ─────────────────
  action {
    type = "authenticate-cognito"
    order = 1

    authenticate_cognito {
      user_pool_arn       = var.cognito_user_pool_arn
      user_pool_client_id = var.cognito_frontend_client_id
      user_pool_domain    = var.cognito_domain_prefix

      # Session config
      session_cookie_name = "AWSELBAuthSessionCookie"
      session_timeout     = 604800  # 7 days (matches refresh token)

      # What to do when user is not authenticated
      on_unauthenticated_request = "authenticate"
      # Options:
      #   "authenticate" — redirect to IdP (for browser-facing endpoints)
      #   "allow"        — pass through unauthenticated (for public endpoints)
      #   "deny"         — return 401 (for API-only endpoints)

      # Scopes to request from Cognito
      scope = "openid email profile"
    }
  }

  # ── Step 2: Forward to API target group ────────────────────
  action {
    type             = "forward"
    order            = 2
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}
```

### New Variables for ALB Module

```hcl
# infra/modules/alb/variables.tf — Add these

variable "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool for ALB authentication"
  type        = string
}

variable "cognito_frontend_client_id" {
  description = "Cognito app client ID (the public/frontend client)"
  type        = string
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix (e.g., 'ielts-ai-dev')"
  type        = string
}
```

### Cognito Callback URL Update

ALB uses its own callback URL format. Add to Cognito frontend client:

```hcl
# infra/modules/cognito/main.tf — Update callback_urls

locals {
  callback_urls = [
    "${var.frontend_url}/auth/callback",                           # existing SPA callback
    "https://${var.api_domain}/oauth2/idpresponse",                # ALB callback (required)
  ]
  logout_urls = [
    "${var.frontend_url}/login",
  ]
}
```

The ALB callback path `/oauth2/idpresponse` is hardcoded by AWS — you don't configure it.

### Public API Endpoints (Unauthenticated)

You need a separate listener rule for public API paths that should NOT trigger auth:

```hcl
# infra/modules/alb/main.tf — Public API endpoints (no auth)

resource "aws_lb_listener_rule" "api_public" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5  # Higher priority than the authenticated rule (10)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }

  condition {
    path_pattern {
      values = [
        "/api/health",              # Health check (ALB itself needs this)
        "/api/tests",               # Public test listing
        "/api/tests/*",             # Public test details
        "/api/tags",                # Public tag listing
        "/api/auth/cognito/logout", # Keep for now during migration
      ]
    }
  }
}
```

---

## 4. Backend Refactor

### 4a. Install `aws-jwt-verify`

```bash
cd apps/api
npm install aws-jwt-verify
```

### 4b. New ALB JWT Guard

Create `apps/api/src/auth/guards/alb-jwt-auth.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AlbJwtVerifier } from 'aws-jwt-verify';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlbJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(AlbJwtAuthGuard.name);
  private readonly verifier: ReturnType<typeof AlbJwtVerifier.create>;

  constructor(private readonly config: ConfigService) {
    this.verifier = AlbJwtVerifier.create({
      issuer: this.config.getOrThrow('COGNITO_ISSUER'),
      // Format: https://cognito-idp.{region}.amazonaws.com/{userPoolId}
      clientId: this.config.getOrThrow('COGNITO_FRONTEND_CLIENT_ID'),
      albArn: this.config.getOrThrow('ALB_ARN'),
      // Format: arn:aws:elasticloadbalancing:ap-southeast-2:XXXX:loadbalancer/app/ielts-ai-alb/XXXX
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const albJwt = request.headers['x-amzn-oidc-data'];

    if (!albJwt) {
      throw new UnauthorizedException('Missing ALB authentication header');
    }

    try {
      const payload = await this.verifier.verify(albJwt);

      // Attach user claims to request (same shape as current CognitoJwtStrategy)
      request.user = {
        sub: payload.sub,
        email: payload.email as string,
        role: this.resolveRole(payload),
      };

      return true;
    } catch (error) {
      this.logger.warn(`ALB JWT verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid ALB token');
    }
  }

  private resolveRole(payload: Record<string, unknown>): string {
    // cognito:groups comes through as a space-separated string in ALB JWT
    const groups = payload['cognito:groups'];
    if (typeof groups === 'string') {
      return groups.includes('Admin') ? 'ADMIN' : 'STUDENT';
    }
    if (Array.isArray(groups)) {
      return groups.includes('Admin') ? 'ADMIN' : 'STUDENT';
    }
    return 'STUDENT';
  }
}
```

### 4c. Optional ALB JWT Guard (for mixed auth endpoints)

```typescript
// apps/api/src/auth/guards/optional-alb-jwt-auth.guard.ts

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AlbJwtAuthGuard } from './alb-jwt-auth.guard';

@Injectable()
export class OptionalAlbJwtAuthGuard extends AlbJwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch {
      // Allow unauthenticated access — user will be null
      return true;
    }
  }
}
```

### 4d. User Resolution Service

The current `cognito-auth.service.ts` combines OAuth token exchange with user resolution. Extract just the user resolution:

```typescript
// apps/api/src/auth/alb-user.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AlbUserClaims {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AlbUserService {
  private readonly logger = new Logger(AlbUserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create a user from ALB JWT claims.
   * Called on first request after ALB authentication.
   */
  async resolveUser(claims: AlbUserClaims) {
    // Try by cognitoSub first (fast path)
    let user = await this.prisma.user.findUnique({
      where: { cognitoSub: claims.sub },
    });

    if (user) return user;

    // Try by email (account linking — user registered with email/password first)
    user = await this.prisma.user.findUnique({
      where: { email: claims.email },
    });

    if (user) {
      // Link Cognito sub to existing account
      return this.prisma.user.update({
        where: { id: user.id },
        data: { cognitoSub: claims.sub },
      });
    }

    // New user — create
    return this.prisma.user.create({
      data: {
        email: claims.email,
        cognitoSub: claims.sub,
        displayName: claims.email.split('@')[0],
        role: claims.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
      },
    });
  }
}
```

### 4e. What to DELETE

After migration is complete, remove:

| File | Reason |
|------|--------|
| `cognito-auth.controller.ts` | All 4 endpoints replaced by ALB |
| `cognito-auth.service.ts` | OAuth exchange logic no longer needed |
| `cognito-jwt.strategy.ts` | Passport strategy replaced by AlbJwtAuthGuard |
| `cognito-jwt-auth.guard.ts` | Passport-based guard replaced |
| `cookie.utils.ts` | No more cookie management |
| `guards/csrf.guard.ts` | No cookies = no CSRF risk |
| `dto/cognito-session.dto.ts` | No more code exchange endpoint |

Keep:
- `auth.controller.ts` / `auth.service.ts` — local email/password auth (if you still need it)
- `guards/roles.guard.ts` — role checking is independent of auth method
- `guards/jwt-auth.guard.ts` — rename to point to ALB guard
- `decorators/*` — `@CurrentUser()` and `@Roles()` stay the same

---

## 5. WebSocket Authentication Changes

This is the hardest part. ALB authentication works via HTTP headers, but WebSocket connections don't receive `x-amzn-oidc-data` after the initial handshake.

### Option A: Use ALB Session Cookie (Recommended)

ALB sets `AWSELBAuthSessionCookie` during HTTP auth. The WebSocket upgrade request (which IS an HTTP request) includes this cookie. But the ALB decrypts it and adds the `x-amzn-oidc-data` header before forwarding to your backend.

So WebSocket auth works **automatically** — the upgrade request gets the same ALB headers as any HTTP request.

Update your gateway auth:

```typescript
// apps/api/src/chat/chat.gateway.ts (and other gateways)

async authenticateSocket(socket: Socket): Promise<void> {
  const albJwt = socket.handshake.headers['x-amzn-oidc-data'];

  if (!albJwt) {
    throw new WsException('Not authenticated');
  }

  // Verify the ALB JWT (same verifier as HTTP guard)
  const payload = await this.albJwtVerifier.verify(albJwt as string);

  const user = await this.albUserService.resolveUser({
    sub: payload.sub as string,
    email: payload.email as string,
    role: resolveRole(payload),
  });

  socket.data.user = user;
}
```

### Option B: Pass Token via Query Parameter (Fallback)

If your WebSocket client connects directly (not through ALB), you'll need to pass authentication differently. But since all traffic goes through ALB in your architecture, Option A should work.

---

## 6. Frontend Changes

### What Changes

The frontend no longer manages the OAuth flow. No more:
- Redirecting to Cognito Hosted UI
- Handling `/auth/callback` with authorization code
- Calling `POST /api/auth/cognito/session`
- Calling `POST /api/auth/cognito/refresh`

Instead:
1. Frontend makes any API call
2. If user isn't authenticated, ALB redirects the browser to Cognito
3. After auth, ALB redirects back to the original URL
4. The request succeeds with ALB session cookie set

### Auth State Detection

Currently your frontend stores auth state in Zustand. With ALB auth, you detect authentication by calling a "me" endpoint:

```typescript
// apps/web/src/lib/auth-store.ts — simplified

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: async () => {
    try {
      // This call goes through ALB.
      // If authenticated: returns user profile.
      // If not: ALB redirects to Cognito login (browser handles redirect).
      const { data } = await api.get('/auth/me');
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  logout: () => {
    // ALB logout: redirect to Cognito logout endpoint
    // This clears the AWSELBAuthSessionCookie
    window.location.href = `https://ielts-ai-dev.auth.ap-southeast-2.amazoncognito.com/logout?client_id=70bg4si9cmvqp12vc5cl4npe77&logout_uri=${encodeURIComponent(window.location.origin + '/login')}`;
  },
}));
```

### Remove from Frontend

- `/auth/callback` page and route
- PKCE code verifier generation
- `POST /api/auth/cognito/session` call
- `POST /api/auth/cognito/refresh` call
- CSRF token handling (no longer needed)
- Token refresh interceptor in Axios

---

## 7. Security Considerations

### Why Trust ALB Instead of Verifying Cognito Tokens Directly?

1. **Reduced attack surface**: Backend verifies ONE token type (ALB ES256) instead of managing JWKS rotation, token refresh, cookie security, and CSRF prevention.

2. **ALB is trusted infrastructure**: It runs inside your VPC, managed by AWS. The `x-amzn-oidc-data` header is set by ALB, not by the client. The client never sees this header.

3. **Token can't be forged**: ALB signs with a private key that only AWS controls. Verification uses the public key fetched from AWS's key endpoint.

### Header Spoofing Prevention

**Critical**: If traffic can reach your backend WITHOUT going through the ALB, an attacker can set `x-amzn-oidc-data` to any value.

Your security groups already prevent this:

```
ECS Security Group — Inbound Rules:
  - Port 32768-65535 from ALB security group ONLY
  - Port 22 from admin IP ONLY
```

No direct internet → ECS traffic is possible. The only path is Internet → ALB → ECS.

**Additional hardening** (belt and suspenders):

```typescript
// In AlbJwtAuthGuard — verify the signer claim matches your ALB ARN
// aws-jwt-verify does this automatically when you pass albArn to the constructor
this.verifier = AlbJwtVerifier.create({
  albArn: 'arn:aws:elasticloadbalancing:ap-southeast-2:XXXX:loadbalancer/app/ielts-ai-alb/XXXX',
  // This ensures the JWT was signed by YOUR ALB, not a different one
});
```

### What AlbJwtVerifier Validates

1. **Signature** (ES256) — token wasn't tampered with
2. **Expiration** (`exp`) — token isn't expired
3. **Signer** (`signer` in header) — matches your ALB ARN
4. **Issuer** (`iss`) — matches your Cognito User Pool
5. **Client ID** (`client` in header) — matches your app client
6. **Key fetch** — public key fetched from AWS endpoint, cached locally

---

## 8. Migration Strategy (Zero-Downtime)

### Phase 1: Add ALB Auth (Dual-Mode)

**Duration**: 1 week

1. **Terraform**: Add `authenticate-cognito` action to ALB listener rule with `on_unauthenticated_request = "allow"` (NOT "authenticate")
   - This makes ALB add the headers IF the user has a session, but doesn't force auth
   - Existing cookie-based auth continues working

2. **Backend**: Add `AlbJwtAuthGuard` alongside existing `CognitoJwtAuthGuard`
   - Create a `DualAuthGuard` that tries ALB first, falls back to Cognito cookie

```typescript
// apps/api/src/auth/guards/dual-auth.guard.ts

@Injectable()
export class DualAuthGuard implements CanActivate {
  constructor(
    private readonly albGuard: AlbJwtAuthGuard,
    private readonly cognitoGuard: CognitoJwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Try ALB header first (new path)
    if (request.headers['x-amzn-oidc-data']) {
      return this.albGuard.canActivate(context);
    }

    // Fall back to Cognito cookie (old path)
    return this.cognitoGuard.canActivate(context);
  }
}
```

3. **Test**: Deploy. Verify existing users still work via cookies. Verify ALB headers are present in logs.

### Phase 2: Switch ALB to Enforce Auth

**Duration**: 1 week

1. **Terraform**: Change `on_unauthenticated_request` from `"allow"` to `"authenticate"`
   - Now ALB redirects unauthenticated users to Cognito
   - Old cookie-based flow still works as fallback

2. **Frontend**: Deploy updated auth flow
   - Remove `/auth/callback` route
   - Update logout to use Cognito logout URL
   - Remove token refresh interceptor

3. **Test**: Verify full flow — unauthenticated user hits API → ALB redirects to Cognito → user logs in → ALB sets session → request succeeds.

### Phase 3: Remove Old Auth Code

**Duration**: 1 week

1. **Backend**: Replace `DualAuthGuard` with `AlbJwtAuthGuard` everywhere
2. **Delete**: `cognito-auth.controller.ts`, `cognito-auth.service.ts`, `cognito-jwt.strategy.ts`, `cookie.utils.ts`, `csrf.guard.ts`
3. **Remove**: `passport-jwt`, `jwks-rsa`, `@nestjs/passport` dependencies (if no other strategies)
4. **Clean**: Remove cookie-related env vars and CORS credential config

### Local Development

ALB auth doesn't exist locally. Options:

**Option A: Mock ALB Header (Recommended for dev)**

```typescript
// apps/api/src/auth/guards/alb-jwt-auth.guard.ts

async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();

  // Local dev bypass — only when ALB_ARN is not set
  if (!this.config.get('ALB_ARN') && this.config.get('NODE_ENV') === 'development') {
    request.user = {
      sub: 'local-dev-user',
      email: this.config.get('DEV_USER_EMAIL', 'dev@localhost'),
      role: this.config.get('DEV_USER_ROLE', 'ADMIN'),
    };
    return true;
  }

  // Production path: verify ALB JWT
  // ...
}
```

**Option B: Keep local JWT auth as dev-only strategy**

Keep the existing `auth.controller.ts` (email/password login) active only in development. Use `NODE_ENV` to conditionally register the module.

---

## 9. Trade-Offs and Limitations

### When NOT to Use ALB Authentication

| Scenario | Why ALB Auth Doesn't Work |
|----------|--------------------------|
| **Mobile apps / native clients** | ALB auth uses browser redirects. Mobile apps need a different flow (device authorization, native SDK) |
| **Machine-to-machine (M2M)** | No browser to redirect. Use Cognito client credentials grant directly |
| **Fine-grained token scopes** | ALB requests fixed scopes at config time. Can't request different scopes per endpoint |
| **Custom claims / token enrichment** | ALB passes through Cognito claims as-is. Can't add custom claims at the ALB layer |
| **Multiple IdPs with per-request selection** | ALB authenticates against ONE IdP config. Can't let user choose "Login with Google" vs "Login with GitHub" at the ALB level (Cognito handles this via Hosted UI) |
| **Offline token access** | No refresh tokens exposed to backend. If you need to call APIs on behalf of the user when they're offline, you need the Cognito tokens directly |

### Limitations vs Direct Cognito Integration

1. **No access to raw refresh token**: ALB manages the session. You can't revoke a specific user's refresh token from your backend. You CAN revoke via Cognito AdminUserGlobalSignOut API, but the ALB session cookie remains valid until it expires.

2. **Session duration is ALB-controlled**: `session_timeout` in ALB config (max 7 days). Can't have different session durations per user role.

3. **Claims come from ID token, not access token**: The `x-amzn-oidc-data` JWT contains claims from the ID token. If you need access token claims (like `cognito:groups`), you must include the right scopes AND ensure the Cognito user pool is configured to include them in the ID token.

4. **WebSocket long-lived connections**: The ALB session cookie may expire while a WebSocket is connected. The WebSocket stays alive (ALB doesn't kill it), but the user's claims in `socket.data.user` may be stale. Add periodic re-verification if sessions are long.

5. **Testing complexity**: No ALB locally means you need a dev bypass or a staging environment for full integration testing.

---

## 10. Environment Variables

### Add

```env
# ALB ARN — used to verify the signer claim in ALB JWTs
ALB_ARN=arn:aws:elasticloadbalancing:ap-southeast-2:ACCOUNT_ID:loadbalancer/app/ielts-ai-alb/XXXXXXXX

# Cognito issuer (already exists, just confirming)
COGNITO_ISSUER=https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_cB6Nlt7HH
```

### Remove (after Phase 3)

```env
# No longer needed — ALB handles token exchange
COGNITO_DOMAIN=ielts-ai-dev.auth.ap-southeast-2.amazoncognito.com
COGNITO_BACKEND_CLIENT_ID=107o223caaj9vs5pq75aq71nt9
```

---

## 11. File Change Summary

### New Files
- `apps/api/src/auth/guards/alb-jwt-auth.guard.ts`
- `apps/api/src/auth/guards/optional-alb-jwt-auth.guard.ts`
- `apps/api/src/auth/guards/dual-auth.guard.ts` (temporary, Phase 1-2)
- `apps/api/src/auth/alb-user.service.ts`

### Modified Files
- `infra/modules/alb/main.tf` — add authenticate-cognito action, public path rule
- `infra/modules/alb/variables.tf` — add Cognito variables
- `infra/modules/cognito/main.tf` — add ALB callback URL
- `apps/api/src/auth/auth.module.ts` — register new guards/services
- `apps/web/src/lib/auth-store.ts` — simplify auth flow
- All gateway files — update `authenticateSocket` to use ALB header

### Deleted Files (Phase 3)
- `apps/api/src/auth/cognito-auth.controller.ts`
- `apps/api/src/auth/cognito-auth.service.ts`
- `apps/api/src/auth/cognito-jwt.strategy.ts`
- `apps/api/src/auth/cognito-jwt-auth.guard.ts`
- `apps/api/src/auth/cookie.utils.ts`
- `apps/api/src/auth/guards/csrf.guard.ts`
- `apps/api/src/auth/dto/cognito-session.dto.ts`
- `apps/web/src/app/(auth)/auth/callback/` — entire callback route
