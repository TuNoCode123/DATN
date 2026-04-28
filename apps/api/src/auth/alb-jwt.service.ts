import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbJwtVerifier } from 'aws-jwt-verify';
import type { AlbJwtPayload } from 'aws-jwt-verify/jwt-model';
import { DEV_ACCOUNTS } from './dev-accounts';

/**
 * Verifies JWTs issued by ALB (x-amzn-oidc-data header).
 *
 * In local development (no ALB_ARN set), verification is skipped and
 * a dev account from DEV_ACCOUNTS is returned. The caller may pass a
 * devEmailOverride (read from a cookie) to pick a specific dev account.
 */
@Injectable()
export class AlbJwtService {
  private readonly logger = new Logger(AlbJwtService.name);
  private readonly verifier: ReturnType<typeof AlbJwtVerifier.create> | null;
  readonly isDev: boolean;
  private readonly defaultDevEmail: string;

  constructor(private readonly config: ConfigService) {
    const albArn = this.config.get<string>('ALB_ARN');
    // Dev mode = no ALB configured. Production environments always set ALB_ARN.
    this.isDev = !albArn;

    if (albArn) {
      this.verifier = AlbJwtVerifier.create({
        issuer: this.config.getOrThrow('COGNITO_ISSUER'),
        clientId: this.config.getOrThrow('COGNITO_FRONTEND_CLIENT_ID'),
        albArn,
      });
    } else {
      this.verifier = null;
      this.logger.warn(
        'ALB_ARN not set — ALB JWT verification disabled (dev mode). ' +
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

    if (!this.verifier || !token) {
      return null;
    }

    const payload = await this.verifier.verify(token);
    return {
      sub: payload.sub as string,
      email: (payload as Record<string, unknown>).email as string,
      role: this.resolveRole(payload),
    };
  }

  private resolveRole(payload: AlbJwtPayload): string {
    const groups = (payload as Record<string, unknown>)['cognito:groups'];
    if (typeof groups === 'string') {
      return groups.includes('Admin') ? 'ADMIN' : 'STUDENT';
    }
    if (Array.isArray(groups)) {
      return (groups as string[]).includes('Admin') ? 'ADMIN' : 'STUDENT';
    }
    return 'STUDENT';
  }
}
