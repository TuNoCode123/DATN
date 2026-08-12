import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

export interface FirebaseUserClaims {
  sub: string;
  email: string;
  role: string;
}

/**
 * Resolves a database user from verified Identity Platform token claims.
 * Handles three cases:
 *   1. Known user (by firebaseUid) — fast path
 *   2. Email match (account linking — user signed up with email/password first)
 *   3. New user — creates account
 */
@Injectable()
export class FirebaseUserService {
  private readonly logger = new Logger(FirebaseUserService.name);

  constructor(private readonly usersService: UsersService) {}

  async resolveUser(claims: FirebaseUserClaims) {
    // Fast path: find by firebaseUid
    let user = await this.usersService.findByFirebaseUid(claims.sub);
    if (user) return user;

    // Account linking: find by email and link firebaseUid
    user = await this.usersService.findByEmail(claims.email);
    if (user) {
      await this.usersService.linkFirebaseUid(user.id, claims.sub);
      return user;
    }

    // New user: create via existing service method
    return this.usersService.findOrCreateByFirebaseUid(
      claims.sub,
      claims.email,
      claims.role,
    );
  }
}
