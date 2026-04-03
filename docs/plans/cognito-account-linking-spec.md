# AWS Cognito Account Linking — Technical Specification

> Ensures a single user identity when the same email is used across native (email/password) and federated (Google) login.

---

## 1. High-Level Architecture

### How Cognito Handles Native vs Federated Users

```
┌─────────────────────────────────────────────────────────────────┐
│                     COGNITO USER POOL                           │
│                                                                 │
│  ┌──────────────────────┐    ┌────────────────────────────────┐ │
│  │  Native User         │    │  Federated User (Google)       │ │
│  │                      │    │                                │ │
│  │  username: uuid      │    │  username: Google_1234567890   │ │
│  │  sub: aaa-bbb-ccc    │    │  sub: xxx-yyy-zzz             │ │
│  │  email: a@b.com      │    │  email: a@b.com               │ │
│  │  provider: Cognito   │    │  provider: Google              │ │
│  └──────────────────────┘    └────────────────────────────────┘ │
│                                                                 │
│  WITHOUT linking: these are TWO separate users with             │
│  TWO different subs, even with the same email.                  │
│                                                                 │
│  WITH linking (AdminLinkProviderForUser):                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Destination User (native)                               │   │
│  │  username: uuid                                          │   │
│  │  sub: aaa-bbb-ccc        ← SINGLE sub for all tokens    │   │
│  │  email: a@b.com                                          │   │
│  │  identities: [                                           │   │
│  │    { providerName: "Cognito", ... },                     │   │
│  │    { providerName: "Google", providerSub: "1234567890" } │   │
│  │  ]                                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  The Google_1234567890 user is DELETED after linking.            │
│  All future Google logins resolve to the destination user.       │
└─────────────────────────────────────────────────────────────────┘
```

### What Cognito Does vs What Backend Must Do

| Concern | Cognito (automatic) | Backend (you build) |
|---------|--------------------|--------------------|
| Native signup | Creates user, hashes password | Trigger Pre-Sign-Up Lambda (optional) |
| Google login | Creates `Google_xxx` user automatically | **Detect duplicate email, call AdminLinkProviderForUser** |
| Token issuance | Issues JWT with `sub` | Verify JWT, resolve DB user |
| Email verification | Sends verification email (native) | Trust `email_verified` from Google |
| Password management | Handles reset, change | N/A |
| **Account linking** | **Does NOT auto-link** | **Must call AdminLinkProviderForUser** |

**Key insight**: Cognito does NOT automatically link accounts with the same email. Without explicit linking, a user who signs up with email/password and later clicks "Login with Google" will get a **second, separate** Cognito account.

---

## 2. User Flows

### Flow A: First-Time Signup with Email/Password

```
User                    Frontend              Backend              Cognito
 │                         │                     │                    │
 │  Fill email + password  │                     │                    │
 │────────────────────────▶│                     │                    │
 │                         │  Redirect to        │                    │
 │                         │  Hosted UI          │                    │
 │                         │─────────────────────────────────────────▶│
 │                         │                     │                    │
 │                         │                     │    Creates user:   │
 │                         │                     │    sub=aaa-bbb     │
 │                         │                     │    username=uuid   │
 │                         │                     │    email=a@b.com   │
 │                         │                     │                    │
 │                         │  ?code=AUTH_CODE     │                    │
 │                         │◀─────────────────────────────────────────│
 │                         │                     │                    │
 │                         │  POST /session       │                    │
 │                         │  {code,codeVerifier} │                    │
 │                         │────────────────────▶│                    │
 │                         │                     │  Exchange code     │
 │                         │                     │──────────────────▶│
 │                         │                     │  tokens            │
 │                         │                     │◀──────────────────│
 │                         │                     │                    │
 │                         │                     │  Verify JWT        │
 │                         │                     │  Extract sub+email │
 │                         │                     │  findOrCreate DB   │
 │                         │                     │  user              │
 │                         │                     │                    │
 │                         │  Set-Cookie + user   │                    │
 │                         │◀────────────────────│                    │
 │  Logged in              │                     │                    │
 │◀────────────────────────│                     │                    │
```

**Result**: Native Cognito user created. DB user created with `cognitoSub = aaa-bbb`.

### Flow B: First-Time Login with Google (No Existing Account)

```
User                    Frontend              Backend              Cognito
 │                         │                     │                    │
 │  Click "Login with      │                     │                    │
 │  Google"                │                     │                    │
 │────────────────────────▶│                     │                    │
 │                         │  Redirect to Hosted │                    │
 │                         │  UI with            │                    │
 │                         │  identity_provider= │                    │
 │                         │  Google             │                    │
 │                         │─────────────────────────────────────────▶│
 │                         │                     │                    │
 │                         │                     │  Cognito creates:  │
 │                         │                     │  username=          │
 │                         │                     │  Google_1234567890  │
 │                         │                     │  sub=xxx-yyy        │
 │                         │                     │  email=a@b.com      │
 │                         │                     │                    │
 │                         │  ?code=AUTH_CODE     │                    │
 │                         │◀─────────────────────────────────────────│
 │                         │                     │                    │
 │                         │  POST /session       │                    │
 │                         │────────────────────▶│                    │
 │                         │                     │  Exchange + verify  │
 │                         │                     │  No existing user   │
 │                         │                     │  → create DB user   │
 │                         │                     │  cognitoSub=xxx-yyy │
 │                         │                     │                    │
 │                         │  Set-Cookie + user   │                    │
 │                         │◀────────────────────│                    │
```

**Result**: Google-federated Cognito user. DB user with `cognitoSub = xxx-yyy`.

### Flow C: Login with Google When Email Already Exists (THE LINKING FLOW)

This is the critical flow. User previously signed up with email/password, now clicks "Login with Google" with the same email.

```
User                    Frontend              Backend              Cognito
 │                         │                     │                    │
 │  Click "Login with      │                     │                    │
 │  Google"                │                     │                    │
 │────────────────────────▶│                     │                    │
 │                         │  Redirect Hosted UI │                    │
 │                         │─────────────────────────────────────────▶│
 │                         │                     │                    │
 │                         │                     │  ┌──────────────┐  │
 │                         │                     │  │ PRE-SIGNUP   │  │
 │                         │                     │  │ LAMBDA fires │  │
 │                         │                     │  │ (see §3)     │  │
 │                         │                     │  └──────┬───────┘  │
 │                         │                     │         │          │
 │                         │                     │  Lambda checks:    │
 │                         │                     │  Does a@b.com      │
 │                         │                     │  exist as native   │
 │                         │                     │  user?             │
 │                         │                     │         │          │
 │                         │                     │  YES → call        │
 │                         │                     │  AdminLinkProvider │
 │                         │                     │  ForUser           │
 │                         │                     │         │          │
 │                         │                     │  Link Google       │
 │                         │                     │  identity to       │
 │                         │                     │  native user       │
 │                         │                     │         │          │
 │                         │                     │  Return:           │
 │                         │                     │  autoConfirmUser   │
 │                         │                     │  =true             │
 │                         │                     │  autoVerifyEmail   │
 │                         │                     │  =true             │
 │                         │                     │                    │
 │                         │  ?code=AUTH_CODE     │                    │
 │                         │◀─────────────────────────────────────────│
 │                         │                     │                    │
 │                         │  POST /session       │                    │
 │                         │────────────────────▶│                    │
 │                         │                     │  Exchange code     │
 │                         │                     │  Token sub =       │
 │                         │                     │  aaa-bbb (native!) │
 │                         │                     │                    │
 │                         │                     │  DB lookup by      │
 │                         │                     │  cognitoSub →      │
 │                         │                     │  found existing    │
 │                         │                     │                    │
 │                         │  Set-Cookie + user   │                    │
 │                         │◀────────────────────│                    │
```

**Key**: After linking, the token's `sub` is the **native user's sub** (`aaa-bbb`), not Google's. The Google identity is merged into the native user.

### Flow D: Login with Email/Password After Google Signup

If user first signed up via Google, then later tries email/password:

1. User goes to Hosted UI, enters email/password
2. Cognito has no native user with that email → **signup fails** (or creates a new native user)
3. **This requires the Pre-Sign-Up Lambda to link in the other direction**

The Pre-Sign-Up Lambda handles this bidirectionally (see §3).

### Flow E: AdminLinkProviderForUser — The Linking API Call

```
AdminLinkProviderForUser({
  UserPoolId: "us-east-1_abc123",

  // DESTINATION = the user that SURVIVES (keeps their sub)
  DestinationUser: {
    ProviderName: "Cognito",             // native user pool provider
    ProviderAttributeValue: "aaa-bbb"    // the native user's username (NOT sub)
  },

  // SOURCE = the user that gets MERGED IN (absorbed, deleted)
  SourceUser: {
    ProviderName: "Google",
    ProviderAttributeName: "Cognito_Subject",
    ProviderAttributeValue: "1234567890"  // Google's sub (NOT Cognito sub)
  }
})
```

**After this call:**
- The `Google_1234567890` Cognito user is deleted
- The native user gains a linked Google identity
- All future Google logins with that Google account resolve to the native user
- Tokens always contain the native user's `sub`

---

## 3. Exact Backend Flow — Pre-Sign-Up Lambda

The linking logic belongs in a **Cognito Pre-Sign-Up Lambda trigger**, NOT in your NestJS backend. This is critical because the linking must happen **before** Cognito issues tokens.

### Lambda Implementation (TypeScript)

```typescript
// infra/lambda/pre-signup/index.ts

import {
  CognitoIdentityProviderClient,
  AdminLinkProviderForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({});

interface PreSignUpEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string;  // e.g., "Google_1234567890" for federated
  request: {
    userAttributes: {
      email: string;
      email_verified?: string;
      [key: string]: string | undefined;
    };
  };
  response: {
    autoConfirmUser: boolean;
    autoVerifyEmail: boolean;
    autoVerifyPhone: boolean;
  };
}

export const handler = async (event: PreSignUpEvent): Promise<PreSignUpEvent> => {
  const { triggerSource, userPoolId, userName, request } = event;
  const email = request.userAttributes.email;

  console.log(JSON.stringify({
    action: 'pre_signup_triggered',
    triggerSource,
    userName,
    email,
  }));

  // Only handle external (federated) provider signups
  // triggerSource values:
  //   "PreSignUp_SignUp"         → native email/password signup
  //   "PreSignUp_ExternalProvider" → federated (Google, Facebook, etc.)
  //   "PreSignUp_AdminCreateUser" → admin-created user
  if (triggerSource !== 'PreSignUp_ExternalProvider') {
    return event;
  }

  // Parse provider info from userName (format: "Google_1234567890")
  const [providerName, providerSub] = parseProviderFromUsername(userName);
  if (!providerName || !providerSub) {
    console.error(`Cannot parse provider from userName: ${userName}`);
    return event;
  }

  // Check if a native user with this email already exists
  const existingUser = await findNativeUserByEmail(userPoolId, email);

  if (existingUser) {
    console.log(JSON.stringify({
      action: 'linking_accounts',
      email,
      nativeUsername: existingUser,
      federatedProvider: providerName,
      federatedSub: providerSub,
    }));

    // Link the federated identity to the existing native user
    await cognito.send(new AdminLinkProviderForUserCommand({
      UserPoolId: userPoolId,
      DestinationUser: {
        ProviderName: 'Cognito',
        ProviderAttributeValue: existingUser, // native user's USERNAME
      },
      SourceUser: {
        ProviderName: providerName,            // "Google"
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: providerSub,   // Google's sub ID
      },
    }));

    console.log(JSON.stringify({
      action: 'link_successful',
      email,
      nativeUsername: existingUser,
    }));

    // Auto-confirm so the user isn't asked to verify again
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
};

function parseProviderFromUsername(
  userName: string
): [string | null, string | null] {
  // Format: "Google_1234567890" or "Facebook_9876543210"
  const idx = userName.indexOf('_');
  if (idx === -1) return [null, null];
  return [userName.substring(0, idx), userName.substring(idx + 1)];
}

async function findNativeUserByEmail(
  userPoolId: string,
  email: string
): Promise<string | null> {
  const result = await cognito.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: `email = "${email}"`,
    Limit: 10,
  }));

  if (!result.Users || result.Users.length === 0) return null;

  // Find the native (non-federated) user
  // Native users have a username that is NOT prefixed with a provider name
  const nativeUser = result.Users.find(user => {
    const username = user.Username ?? '';
    // Federated users have format: Provider_Sub (e.g., Google_12345)
    // Native users have UUID-format usernames
    return !username.includes('_') || isUUID(username);
  });

  return nativeUser?.Username ?? null;
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(str);
}
```

### How to Obtain Required Parameters

| Parameter | How to Get It |
|-----------|---------------|
| `DestinationUser.ProviderAttributeValue` | The native user's `Username` from `ListUsers` filtered by email |
| `SourceUser.ProviderName` | Parsed from the federated user's username prefix (`Google`, `Facebook`) |
| `SourceUser.ProviderAttributeValue` | Parsed from the federated user's username suffix (the IdP's sub) |
| `SourceUser.ProviderAttributeName` | Always `"Cognito_Subject"` |

### Determining Destination vs Source

**Rule: The user that was created FIRST is always the destination (survives).**

| Scenario | Destination (survives) | Source (merged) |
|----------|----------------------|-----------------|
| Native exists, Google logs in | Native user | Google identity |
| Google exists, native signs up | Google user | Native identity |

However, in practice, **always prefer the native user as destination** when one exists, because:
- Native users have passwords, which are harder to recreate
- The native `sub` is likely already stored in your database
- It's simpler to have one rule

If only a Google user exists and the user tries native signup, you have two options:
1. **Block it**: Tell the user to log in with Google (recommended for simplicity)
2. **Link reverse**: Make Google the destination, link native as source (complex)

**Recommendation**: Block native signup if a Google user with that email exists. Add a message: "An account with this email already exists. Please log in with Google."

---

## 4. Data Consistency & Race Conditions

### Concurrent Login Race Condition

```
Time    Thread A (email/pw signup)     Thread B (Google login)
────    ──────────────────────────     ──────────────────────
T1      Cognito creates native user
T2                                     Pre-Sign-Up Lambda fires
T3                                     ListUsers → finds native user
T4                                     AdminLinkProviderForUser ✓
T5      Token issued (sub=aaa)
T6                                     Token issued (sub=aaa) ← same!
```

This is **safe** because:
- Cognito's `AdminLinkProviderForUser` is idempotent — calling it again with the same params is a no-op
- The Pre-Sign-Up Lambda executes synchronously (Cognito waits for it)
- Token issuance only happens after the Lambda returns

### True Race: Two Federated Providers at Once

```
Time    Thread A (Google login)         Thread B (Facebook login)
────    ──────────────────────          ────────────────────────
T1      ListUsers → no native user      ListUsers → no native user
T2      Both proceed without linking
T3      Creates Google_123              Creates Facebook_456
```

**Result**: Two separate federated users. Neither gets linked.

**Mitigation**: This is rare in practice. Handle it with a **Post-Authentication Lambda** that checks for duplicate emails and alerts for manual review. Or use the backend `findOrCreateFromCognito` logic (which you already have) to link at the DB level.

### Preventing Duplicate DB Users

Your existing `findOrCreateFromCognito` method already handles this correctly:

```
1. Find by cognitoSub → return if found
2. Find by email → link cognitoSub and return if found
3. Create new user
```

**Add a unique constraint and transaction** to make step 2-3 atomic:

```typescript
// In users.service.ts — use a transaction with a conflict check
async findOrCreateByCognitoSub(cognitoSub: string, email: string, role: string) {
  return this.prisma.$transaction(async (tx) => {
    // Check by sub first
    let user = await tx.user.findUnique({ where: { cognitoSub } });
    if (user) return user;

    // Check by email
    user = await tx.user.findUnique({ where: { email } });
    if (user) {
      // Link sub to existing user (only if not already linked to a different sub)
      if (user.cognitoSub && user.cognitoSub !== cognitoSub) {
        // This user is already linked to a different Cognito identity.
        // This shouldn't happen after proper Cognito linking.
        // Log and use the existing record.
        console.warn(`User ${email} already linked to ${user.cognitoSub}, ignoring new sub ${cognitoSub}`);
        return user;
      }
      return tx.user.update({
        where: { id: user.id },
        data: { cognitoSub },
      });
    }

    // Create new
    return tx.user.create({
      data: { email, cognitoSub, displayName: email.split('@')[0], role },
    });
  });
}
```

### Idempotency

| Operation | Idempotent? | Notes |
|-----------|------------|-------|
| `AdminLinkProviderForUser` | Yes | Re-linking already-linked identity is a no-op |
| `findOrCreateFromCognito` | Yes (with tx) | Transaction prevents duplicates |
| Pre-Sign-Up Lambda | Yes | Multiple invocations safe |
| Token exchange | No | Auth codes are single-use (by design) |

---

## 5. Security Considerations

### Why Email Matching Is Required Before Linking

**Never link accounts without verifying email ownership.** Without this check:

1. Attacker creates Google account with victim's email (some providers don't verify)
2. Attacker logs in via Google to your app
3. Auto-linking merges attacker into victim's account
4. Attacker now has full access to victim's data

**Safeguards:**

```typescript
// In Pre-Sign-Up Lambda — VERIFY email is actually verified by the IdP
if (triggerSource === 'PreSignUp_ExternalProvider') {
  const emailVerified = request.userAttributes.email_verified;

  // CRITICAL: Only link if the IdP has verified the email
  if (emailVerified !== 'true') {
    console.warn(`Refusing to link: email ${email} not verified by ${providerName}`);
    // Let Cognito create a separate user — don't auto-link
    return event;
  }
}
```

### Account Takeover Risks

| Risk | Mitigation |
|------|-----------|
| Attacker uses unverified email from Google | Check `email_verified` claim before linking |
| Attacker uses Google Workspace to create matching email | Google Workspace emails are verified — this is a trust boundary issue. You trust Google's verification. |
| Attacker intercepts auth code | PKCE prevents code interception |
| Attacker replays tokens | Token expiration (15 min) + single-use auth codes |
| Linked identity is used after unlinking | `AdminDisableProviderForUser` + revoke refresh tokens |

### Trust Boundaries

```
┌─────────────────────────────────────────────┐
│  TRUST FULLY                                │
│  • Cognito-issued JWT (verified via JWKS)   │
│  • Cognito's sub claim                      │
│  • Google's email_verified = true           │
├─────────────────────────────────────────────┤
│  TRUST WITH VERIFICATION                    │
│  • Email from id_token (verify it matches   │
│    what's in your DB)                       │
│  • Google's email claim (only if verified)  │
├─────────────────────────────────────────────┤
│  NEVER TRUST                                │
│  • Email from unverified providers          │
│  • Client-supplied identity claims          │
│  • Username from frontend                   │
└─────────────────────────────────────────────┘
```

---

## 6. Edge Cases

### Same Email, Different Providers, Created at Different Times

| Scenario | Handling |
|----------|---------|
| Native first → Google later | Pre-Sign-Up Lambda links Google to native. Token uses native sub. |
| Google first → Native later | Block native signup ("Use Google to log in") OR reverse-link. |
| Google first → Facebook later | Pre-Sign-Up Lambda links Facebook to Google user. |
| Three providers, same email | All link to the first-created user. Cognito supports multiple linked identities. |

### User Changes Email in Google

After linking, if the user changes their Google email:
- **Next Google login**: Cognito matches by Google sub (not email), so the linked identity still resolves to the same Cognito user
- **No action needed**: The link is by provider sub, not by email
- **Your DB email stays unchanged** unless you explicitly update it

### Already Linked Identities

```typescript
// In Pre-Sign-Up Lambda
try {
  await cognito.send(new AdminLinkProviderForUserCommand({ ... }));
} catch (error) {
  if (error.name === 'InvalidParameterException' &&
      error.message?.includes('already exists')) {
    // Identity already linked — this is fine, proceed
    console.log('Identity already linked, skipping');
  } else {
    throw error;
  }
}
```

### Partial Failures During Linking

| Failure Point | Impact | Recovery |
|---------------|--------|----------|
| Lambda fails before `AdminLinkProviderForUser` | Google user created separately | Backend `findOrCreateFromCognito` links at DB level. Admin can manually link later. |
| Lambda fails after `AdminLinkProviderForUser` | Link succeeded but Lambda returns error | Cognito may retry the Lambda. Link is already done (idempotent). |
| `ListUsers` times out | Can't determine if native user exists | Don't link. Create separate user. Backend reconciles. |
| DB update fails after successful Cognito link | Cognito linked but DB not updated | Next login: `findOrCreateFromCognito` finds by email, updates `cognitoSub`. |

**Defense in depth**: The backend's `findOrCreateFromCognito` acts as a safety net. Even if Cognito-level linking fails, the DB-level email matching ensures the user gets the right account.

---

## 7. Token Behavior

### Sub Before and After Linking

```
BEFORE linking:
  Native user token:  { sub: "aaa-bbb", ... }
  Google user token:  { sub: "xxx-yyy", ... }
  → Two different subs. Two different sessions.

AFTER linking (Google → Native):
  Any login method:   { sub: "aaa-bbb", ... }
  → Always the native user's sub. Google's sub is gone from tokens.
```

### Token Claims After Linking

```json
// id_token after linking (logging in via Google)
{
  "sub": "aaa-bbb-ccc",              // ← Native user's sub (destination)
  "email": "user@example.com",
  "email_verified": true,
  "cognito:username": "aaa-bbb-ccc", // ← Native user's username
  "identities": [
    {
      "userId": "1234567890",         // Google's sub
      "providerName": "Google",
      "providerType": "Google",
      "issuer": null,
      "primary": false,
      "dateCreated": 1711929600000
    }
  ],
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123",
  "aud": "client-id",
  "token_use": "id"
}
```

### Backend Implications

Since the `sub` is stable after linking, your existing `findOrCreateFromCognito` flow works without changes:

1. Token `sub` = `aaa-bbb` (always the native user's)
2. DB lookup by `cognitoSub` = `aaa-bbb` → found
3. Return user

**No need to store multiple subs in your database.** The Cognito-level linking ensures one stable `sub`.

---

## 8. Database Design

### You Do NOT Need a Separate Identity Table

Because Cognito handles the identity linking, your DB only needs to track the **destination user's sub**. After linking, all tokens carry the same `sub` regardless of login method.

### Current Schema (Already Sufficient)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?            // null for Cognito-only users
  cognitoSub   String?  @unique   // THE single sub (destination user's)
  displayName  String?
  avatarUrl    String?
  role         UserRole @default(STUDENT)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**No changes needed.** Your schema already supports this correctly:
- `cognitoSub` is unique — one user per Cognito identity
- `email` is unique — prevents duplicate accounts at the DB level
- `passwordHash` is nullable — supports users who only use social login

### When You WOULD Need an Identity Table

Only if you bypass Cognito linking and manage identities yourself (not recommended). Example of what you'd need in that case (included for reference, **do not implement**):

```prisma
// DON'T DO THIS — Cognito linking makes it unnecessary
model UserIdentity {
  id             String @id @default(cuid())
  userId         String
  provider       String // "cognito", "google", "facebook"
  providerSub    String // the sub from that provider
  email          String
  isPrimary      Boolean @default(false)

  user           User   @relation(fields: [userId], references: [id])

  @@unique([provider, providerSub])
}
```

---

## 9. Best Practices

### Production-Ready Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED ARCHITECTURE                      │
│                                                                  │
│  1. Cognito User Pool with:                                     │
│     • Google as federated identity provider                     │
│     • Pre-Sign-Up Lambda trigger attached                       │
│     • Hosted UI for all auth flows                              │
│                                                                  │
│  2. Pre-Sign-Up Lambda:                                         │
│     • Checks email_verified from IdP                            │
│     • Searches for existing native user by email                │
│     • Calls AdminLinkProviderForUser if match found             │
│     • Returns autoConfirmUser=true, autoVerifyEmail=true        │
│                                                                  │
│  3. NestJS Backend:                                             │
│     • Exchanges auth code for tokens (existing flow)            │
│     • Verifies JWT via JWKS (existing flow)                     │
│     • findOrCreateFromCognito as safety net (existing flow)     │
│     • No changes needed to existing auth code                   │
│                                                                  │
│  4. Frontend:                                                   │
│     • Redirects to Hosted UI (existing flow)                    │
│     • Handles callback (existing flow)                          │
│     • No changes needed                                         │
└────────────────────────────────────────────────────────────────┘
```

### Logging & Observability

```typescript
// Pre-Sign-Up Lambda — structured logging
console.log(JSON.stringify({
  level: 'INFO',
  action: 'pre_signup',
  triggerSource: event.triggerSource,
  email: event.request.userAttributes.email,
  userName: event.userName,
  emailVerified: event.request.userAttributes.email_verified,
  linked: didLink,        // boolean
  destinationUser: nativeUsername ?? null,
  duration_ms: Date.now() - startTime,
}));
```

**CloudWatch Metrics to Track:**

| Metric | Alert Threshold |
|--------|----------------|
| `LinkAttempts` (count) | N/A (informational) |
| `LinkSuccesses` (count) | N/A (informational) |
| `LinkFailures` (count) | > 0 → investigate |
| `UnverifiedEmailBlocked` (count) | > 10/hour → possible abuse |
| `LambdaDuration` (ms) | > 3000ms → Lambda cold start issues |
| `DuplicateEmailDetected` (count from backend) | > 0 → linking didn't work |

**Backend logging (in `findOrCreateFromCognito`):**

```typescript
// Log when backend safety-net linking kicks in
// This means Cognito-level linking didn't happen (investigate why)
if (user && !user.cognitoSub) {
  this.logger.warn({
    message: 'Backend safety-net link triggered — Cognito linking may have failed',
    email,
    cognitoSub,
    userId: user.id,
  });
}
```

### Error Handling Strategy

```
Lambda Errors:
├── ListUsers fails
│   └── Log error, return event WITHOUT linking
│       (backend safety net will handle it)
├── AdminLinkProviderForUser fails
│   ├── "already exists" → ignore (idempotent)
│   ├── "user not found" → native user was deleted, create separate
│   └── other → log, return event WITHOUT linking
└── Lambda timeout (5s limit)
    └── Cognito retries once. If still fails, user gets separate account.

Backend Errors:
├── Token verification fails → 401 (existing behavior)
├── DB transaction conflict → retry once, then 500
└── Email mismatch (token email ≠ DB email) → log warning, use DB email
```

### Terraform/IaC Configuration

```hcl
# Attach Pre-Sign-Up Lambda to User Pool
resource "aws_cognito_user_pool" "main" {
  name = "ielts-ai-user-pool"

  lambda_config {
    pre_sign_up = aws_lambda_function.pre_signup.arn
  }

  # ... other config
}

# Lambda needs permission to call Cognito admin APIs
resource "aws_iam_role_policy" "pre_signup_cognito" {
  role = aws_iam_role.pre_signup_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminLinkProviderForUser",
        ]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

# Allow Cognito to invoke the Lambda
resource "aws_lambda_permission" "cognito_pre_signup" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
```

---

## 10. Implementation Checklist

```
□ 1. Write Pre-Sign-Up Lambda (infra/lambda/pre-signup/index.ts)
□ 2. Add Lambda to Terraform config with IAM permissions
□ 3. Deploy Lambda and attach to Cognito User Pool
□ 4. Test Flow C: native user exists → Google login → verify linking
□ 5. Test Flow B: no user exists → Google login → verify new user
□ 6. Test Flow A: native signup → verify normal flow unaffected
□ 7. Test idempotency: repeat Google login → verify no errors
□ 8. Test email_verified=false → verify linking is blocked
□ 9. Add CloudWatch alarms for LinkFailures metric
□ 10. Verify backend findOrCreateFromCognito still works as safety net
```

---

## Summary

| Component | Action Required |
|-----------|----------------|
| **Pre-Sign-Up Lambda** | **NEW** — write and deploy |
| **Terraform/IaC** | **UPDATE** — attach Lambda, add IAM |
| **NestJS backend** | **NO CHANGES** — existing `findOrCreateFromCognito` is the safety net |
| **Database schema** | **NO CHANGES** — single `cognitoSub` field is sufficient |
| **Frontend** | **NO CHANGES** — Hosted UI handles everything |

The entire linking mechanism lives in a single Lambda function (~80 lines). Your existing backend code already handles the edge cases where Cognito-level linking doesn't fire.
