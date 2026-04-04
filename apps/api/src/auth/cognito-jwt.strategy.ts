import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';

/** Extract access token from httpOnly cookie instead of Authorization header */
function fromCookie(req: Request): string | null {
  return req?.cookies?.['access_token'] ?? null;
}

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(
  Strategy,
  'cognito-jwt',
) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    const region = configService.get<string>('AWS_REGION');
    const userPoolId = configService.get<string>('COGNITO_USER_POOL_ID');

    super({
      jwtFromRequest: fromCookie,
      ignoreExpiration: false,
      passReqToCallback: true,
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

  async validate(req: Request, payload: {
    sub: string;
    email?: string;
    username?: string;
    'cognito:groups'?: string[];
    token_use: string;
  }) {
    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Role is derived from Cognito groups — single source of truth
    const role = payload['cognito:groups']?.includes('Admin') ? 'ADMIN' : 'STUDENT';

    // Find by cognitoSub first (fast path)
    let user = await this.usersService.findByCognitoSub(payload.sub);
    if (user) {
      return { id: user.id, email: user.email, displayName: user.displayName, role };
    }

    // Access tokens often lack email — extract from id_token cookie instead
    let email = payload.email ?? '';
    if (!email) {
      const idToken = req?.cookies?.['id_token'];
      if (idToken) {
        const idPayload = jwt.decode(idToken) as { email?: string } | null;
        email = idPayload?.email ?? '';
      }
    }

    if (email) {
      user = await this.usersService.findByEmail(email);
      if (user) {
        await this.usersService.linkCognitoSub(user.id, payload.sub);
        return { id: user.id, email: user.email, displayName: user.displayName, role };
      }
    }

    // User not found — do NOT auto-create here. Only the initial login
    // flow (POST /auth/cognito/session) should create new users.
    throw new UnauthorizedException('User not found');
  }
}
