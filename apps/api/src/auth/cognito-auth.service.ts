import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as jwksRsa from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';

interface CognitoTokens {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface CognitoPayload {
  sub: string;
  email?: string;
  username?: string;
  'cognito:groups'?: string[];
  token_use: string;
}

@Injectable()
export class CognitoAuthService {
  private readonly logger = new Logger('CognitoAuthService');
  private readonly region: string;
  private readonly userPoolId: string;
  private readonly clientId: string;
  private readonly cognitoDomain: string;
  private readonly jwksClient: jwksRsa.JwksClient;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.region = this.configService.get<string>('AWS_REGION')!;
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID')!;
    this.clientId = this.configService.get<string>(
      'COGNITO_FRONTEND_CLIENT_ID',
    )!;
    this.cognitoDomain = this.configService.get<string>('COGNITO_DOMAIN')!;

    this.jwksClient = jwksRsa({
      jwksUri: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  /**
   * Exchange authorization code for Cognito tokens via the Token endpoint.
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<CognitoTokens> {
    const tokenUrl = `https://${this.cognitoDomain}/oauth2/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Cognito token exchange failed: ${response.status} ${errorBody}`,
      );
      throw new UnauthorizedException('Token exchange failed');
    }

    return response.json();
  }

  /**
   * Refresh tokens using a Cognito refresh token.
   */
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ access_token: string; id_token: string; expires_in: number }> {
    const tokenUrl = `https://${this.cognitoDomain}/oauth2/token`;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Cognito token refresh failed: ${response.status} ${errorBody}`,
      );
      throw new UnauthorizedException('Token refresh failed');
    }

    return response.json();
  }

  /**
   * Verify a Cognito access token using JWKS and resolve the DB user.
   * The idToken is needed because Cognito access tokens don't contain email.
   */
  async verifyAndResolveUser(accessToken: string, idToken?: string) {
    const payload = await this.verifyCognitoJwt(accessToken);

    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Cognito access tokens don't include email — extract it from the id_token
    let email = '';
    if (idToken) {
      const idPayload = await this.verifyCognitoJwt(idToken);
      email = idPayload.email ?? '';
    }
    if (!email) {
      email = payload.email ?? payload.username ?? '';
    }

    return this.findOrCreateFromCognito(
      payload.sub,
      email,
      payload['cognito:groups'],
    );
  }

  /**
   * Verify a Cognito JWT using the JWKS endpoint (RS256).
   * Used by both REST controller and WebSocket gateway.
   */
  async verifyCognitoJwt(token: string): Promise<CognitoPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    const kid = decoded.header.kid;
    const signingKey = await this.jwksClient.getSigningKey(kid);
    const publicKey = signingKey.getPublicKey();

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;

    try {
      return jwt.verify(token, publicKey, {
        issuer,
        algorithms: ['RS256'],
      }) as CognitoPayload;
    } catch (err) {
      throw new UnauthorizedException('Token verification failed');
    }
  }

  /**
   * Verify token and find existing user WITHOUT creating a new one.
   * Used by session-restore flows (refresh, /me) to avoid ghost accounts.
   */
  async findExistingUser(accessToken: string, idToken?: string) {
    const payload = await this.verifyCognitoJwt(accessToken);
    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Look up by cognitoSub only — no creation
    const user = await this.usersService.findByCognitoSub(payload.sub);
    if (user) return user;

    // Try email-based linking (migration path)
    let email = '';
    if (idToken) {
      const idPayload = await this.verifyCognitoJwt(idToken);
      email = idPayload.email ?? '';
    }
    if (!email) {
      email = payload.email ?? payload.username ?? '';
    }

    if (email) {
      const emailUser = await this.usersService.findByEmail(email);
      if (emailUser) {
        await this.usersService.linkCognitoSub(emailUser.id, payload.sub);
        return emailUser;
      }
    }

    return null;
  }

  /**
   * Find existing user by cognitoSub, or link by email, or create new.
   * Uses a transaction to prevent duplicate DB users from race conditions.
   */
  async findOrCreateFromCognito(
    cognitoSub: string,
    email: string,
    cognitoGroups?: string[],
  ) {
    // Fast path (no transaction needed): lookup by cognitoSub
    const existing = await this.usersService.findByCognitoSub(cognitoSub);
    if (existing) return existing;

    // Transactional path: link or create
    return this.usersService.findOrCreateByCognitoSub(
      cognitoSub,
      email,
      cognitoGroups?.includes('Admin') ? 'ADMIN' : 'STUDENT',
    );
  }
}
