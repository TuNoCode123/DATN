// ══════════════════════════════════════════════════════════════
//  Pre-Sign-Up Lambda — Cognito Account Linking
//
//  Triggers on federated (Google) sign-ups. If a native user
//  with the same verified email already exists, links the
//  federated identity to the native user so they share one sub.
// ══════════════════════════════════════════════════════════════

import {
  CognitoIdentityProviderClient,
  AdminLinkProviderForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({});

interface PreSignUpEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string; // e.g. "Google_1234567890" for federated
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

export const handler = async (
  event: PreSignUpEvent,
): Promise<PreSignUpEvent> => {
  const startTime = Date.now();
  const { triggerSource, userPoolId, userName, request } = event;
  const email = request.userAttributes.email;

  console.log(
    JSON.stringify({
      level: 'INFO',
      action: 'pre_signup_triggered',
      triggerSource,
      userName,
      email,
    }),
  );

  // ── Native sign-up: block if a federated user with same email exists ──
  if (triggerSource === 'PreSignUp_SignUp') {
    const federatedUser = await findFederatedUserByEmail(userPoolId, email);
    if (federatedUser) {
      console.log(
        JSON.stringify({
          level: 'INFO',
          action: 'native_signup_blocked_duplicate_email',
          email,
          existingFederatedUser: federatedUser,
        }),
      );
      throw new Error(
        'An account with this email already exists. Please sign in with Google instead.',
      );
    }
    return event;
  }

  // Only handle federated provider sign-ups below (Google, Facebook, etc.)
  if (triggerSource !== 'PreSignUp_ExternalProvider') {
    return event;
  }

  // SECURITY: Only link if the IdP has verified the email
  if (request.userAttributes.email_verified !== 'true') {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        action: 'unverified_email_blocked',
        email,
        userName,
      }),
    );
    return event;
  }

  // Parse provider info from userName (format: "Google_1234567890")
  const [providerName, providerSub] = parseProviderFromUsername(userName);
  if (!providerName || !providerSub) {
    console.error(`Cannot parse provider from userName: ${userName}`);
    return event;
  }

  // Check if a native (non-federated) user with this email already exists
  const nativeUsername = await findNativeUserByEmail(userPoolId, email);
  let linked = false;

  if (nativeUsername) {
    console.log(
      JSON.stringify({
        level: 'INFO',
        action: 'linking_accounts',
        email,
        nativeUsername,
        federatedProvider: providerName,
        federatedSub: providerSub,
      }),
    );

    try {
      await cognito.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: userPoolId,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: nativeUsername, // native user's USERNAME
          },
          SourceUser: {
            ProviderName: providerName, // "Google"
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: providerSub, // Google's sub ID
          },
        }),
      );
      linked = true;
    } catch (error: any) {
      // Identity already linked — this is fine (idempotent)
      if (
        error.name === 'InvalidParameterException' &&
        error.message?.includes('already exists')
      ) {
        console.log('Identity already linked, skipping');
        linked = true;
      } else {
        console.error(
          JSON.stringify({
            level: 'ERROR',
            action: 'link_failed',
            email,
            error: error.message,
          }),
        );
        // Don't throw — let Cognito create a separate user.
        // Backend safety-net (findOrCreateFromCognito) will reconcile.
      }
    }

  }

  // Auto-confirm so the user isn't asked to verify again.
  // This applies to ALL federated sign-ups with a verified email,
  // not just when linking to an existing native user.
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  console.log(
    JSON.stringify({
      level: 'INFO',
      action: 'pre_signup_complete',
      email,
      linked,
      duration_ms: Date.now() - startTime,
    }),
  );

  return event;
};

// ── Helpers ──────────────────────────────────────────────────

function parseProviderFromUsername(
  userName: string,
): [string | null, string | null] {
  // Format: "Google_1234567890" or "Facebook_9876543210"
  const idx = userName.indexOf('_');
  if (idx === -1) return [null, null];
  return [userName.substring(0, idx), userName.substring(idx + 1)];
}

async function findNativeUserByEmail(
  userPoolId: string,
  email: string,
): Promise<string | null> {
  const result = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 10,
    }),
  );

  if (!result.Users || result.Users.length === 0) return null;

  // Find the native (non-federated) user
  // Native users have UUID-format usernames; federated have "Provider_Sub"
  const nativeUser = result.Users.find((user) => {
    const username = user.Username ?? '';
    return !username.includes('_') || isUUID(username);
  });

  return nativeUser?.Username ?? null;
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Find a federated (social) user by email.
 * Federated usernames contain an underscore and are NOT UUIDs (e.g. "Google_1234567890").
 */
async function findFederatedUserByEmail(
  userPoolId: string,
  email: string,
): Promise<string | null> {
  const result = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 10,
    }),
  );

  if (!result.Users || result.Users.length === 0) return null;

  const federatedUser = result.Users.find((user) => {
    const username = user.Username ?? '';
    return username.includes('_') && !isUUID(username);
  });

  return federatedUser?.Username ?? null;
}
