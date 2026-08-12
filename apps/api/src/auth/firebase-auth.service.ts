import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { DEV_ACCOUNTS } from './dev-accounts';

/**
 * Verifies Identity Platform ID tokens (Firebase Auth under the hood).
 *
 * In local development (no GCP_PROJECT_ID set), verification is skipped and
 * a dev account from DEV_ACCOUNTS is returned. The caller may pass a
 * devEmailOverride (read from a cookie) to pick a specific dev account.
 *
 * Role comes from a Firebase custom claim (`role`), set via the Admin SDK's
 * setCustomUserClaims — Identity Platform has no built-in "groups" feature
 * the way Cognito User Pools did. A promoted admin's existing session won't
 * see the new role until their ID token refreshes (same caching behavior
 * Cognito group claims had).
 */
@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);
  readonly isDev: boolean;
  private readonly defaultDevEmail: string;
  private readonly app: admin.app.App | null;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('GCP_PROJECT_ID');
    // Dev mode = no GCP project configured. Production environments always set GCP_PROJECT_ID.
    this.isDev = !projectId;

    if (projectId) {
      this.app = admin.apps.length
        ? (admin.apps[0] as admin.app.App)
        : admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId,
          });
    } else {
      this.app = null;
      this.logger.warn(
        'GCP_PROJECT_ID not set — Identity Platform verification disabled (dev mode). ' +
          'Use POST /api/auth/dev/login to pick a dev account.',
      );
    }

    this.defaultDevEmail = this.config.get(
      'DEV_USER_EMAIL',
      DEV_ACCOUNTS[0]?.email ?? 'admin@example.com',
    );
  }

  async verify(
    token: string | undefined,
    devEmailOverride?: string,
  ): Promise<{ sub: string; email: string; role: string } | null> {
    if (this.isDev && !token) {
      const email = devEmailOverride || this.defaultDevEmail;
      const account = DEV_ACCOUNTS.find((a) => a.email === email);
      if (!account) return null;
      return {
        sub: `local-dev-${account.email}`,
        email: account.email,
        role: account.role,
      };
    }

    if (!this.app || !token) {
      return null;
    }

    const decoded = await admin.auth(this.app).verifyIdToken(token);
    return {
      sub: decoded.uid,
      email: decoded.email as string,
      role: this.resolveRole(decoded),
    };
  }

  private resolveRole(decoded: admin.auth.DecodedIdToken): string {
    const role = (decoded as Record<string, unknown>).role;
    return role === 'ADMIN' ? 'ADMIN' : 'STUDENT';
  }
}
