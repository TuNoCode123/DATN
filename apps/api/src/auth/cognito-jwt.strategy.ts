import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
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

    const email = payload.email ?? payload.username ?? '';

    // Find by cognitoSub first, then try linking by email (migration path)
    let user = await this.usersService.findByCognitoSub(payload.sub);
    if (user) {
      return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
    }

    if (email) {
      user = await this.usersService.findByEmail(email);
      if (user) {
        await this.usersService.linkCognitoSub(user.id, payload.sub);
        return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
      }
    }

    // User not found — do NOT auto-create here. Only the initial login
    // flow (POST /auth/cognito/session) should create new users.
    throw new Error('User not found');
  }
}
