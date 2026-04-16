import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbJwtVerifier } from 'aws-jwt-verify';
import type { AlbJwtPayload } from 'aws-jwt-verify/jwt-model';

/**
 * Verifies JWTs issued by ALB (x-amzn-oidc-data header).
 *
 * ALB signs its own ES256 JWT after authenticating via Cognito OIDC.
 * This is NOT a Cognito token — it's an ALB-issued token whose signature
 * is verified using public keys from AWS's key endpoint.
 *
 * In local development (no ALB_ARN set), verification is skipped and
 * a configurable dev user is returned.
 */
@Injectable()
export class AlbJwtService {
  private readonly logger = new Logger(AlbJwtService.name);
  private readonly verifier: ReturnType<typeof AlbJwtVerifier.create> | null;
  private readonly isDev: boolean;
  private readonly devEmail: string;
  private readonly devRole: string;

  constructor(private readonly config: ConfigService) {
    const albArn = this.config.get<string>('ALB_ARN');
    this.isDev = !albArn && this.config.get('NODE_ENV') === 'development';

    if (albArn) {
      this.verifier = AlbJwtVerifier.create({
        issuer: this.config.getOrThrow('COGNITO_ISSUER'),
        clientId: this.config.getOrThrow('COGNITO_FRONTEND_CLIENT_ID'),
        albArn,
      });
    } else {
      this.verifier = null;
      if (this.isDev) {
        this.logger.warn(
          'ALB_ARN not set — ALB JWT verification disabled (dev mode)',
        );
      }
    }

    this.devEmail = this.config.get('DEV_USER_EMAIL', 'dev@localhost');
    this.devRole = this.config.get('DEV_USER_ROLE', 'ADMIN');
  }

  /**
   * Verify an ALB JWT and return normalized user claims.
   * Returns null if ALB auth is not configured (production without ALB_ARN).
   * In dev mode, returns a mock user.
   */
  async verify(
    token: string | undefined,
  ): Promise<{ sub: string; email: string; role: string } | null> {
    // Dev bypass: no ALB locally
    if (this.isDev && !token) {
      return {
        sub: 'local-dev-user',
        email: this.devEmail,
        role: this.devRole,
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
