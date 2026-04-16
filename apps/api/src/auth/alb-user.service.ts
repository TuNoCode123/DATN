import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

export interface AlbUserClaims {
  sub: string;
  email: string;
  role: string;
}

/**
 * Resolves a database user from ALB JWT claims.
 * Handles three cases:
 *   1. Known user (by cognitoSub) — fast path
 *   2. Email match (account linking — user signed up with email/password first)
 *   3. New user — creates account
 */
@Injectable()
export class AlbUserService {
  private readonly logger = new Logger(AlbUserService.name);

  constructor(private readonly usersService: UsersService) {}

  async resolveUser(claims: AlbUserClaims) {
    // Fast path: find by cognitoSub
    let user = await this.usersService.findByCognitoSub(claims.sub);
    if (user) return user;

    // Account linking: find by email and link cognitoSub
    user = await this.usersService.findByEmail(claims.email);
    if (user) {
      await this.usersService.linkCognitoSub(user.id, claims.sub);
      return user;
    }

    // New user: create via existing service method
    return this.usersService.findOrCreateByCognitoSub(
      claims.sub,
      claims.email,
      claims.role,
    );
  }
}
