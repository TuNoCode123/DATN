import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FirebaseAuthService } from '../firebase-auth.service';
import { FirebaseUserService } from '../firebase-user.service';
import { extractBearerToken } from '../extract-bearer-token';

/**
 * Optional Identity Platform auth guard.
 *
 * Same as JwtAuthGuard but allows unauthenticated access —
 * request.user will be null if no valid token is present.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  constructor(
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly firebaseUserService: FirebaseUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const idToken = extractBearerToken(request.headers['authorization']);

    try {
      const claims = await this.firebaseAuthService.verify(idToken);
      if (claims) {
        const user = await this.firebaseUserService.resolveUser(claims);
        request.user = {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: claims.role,
        };
      }
    } catch {
      // Allow unauthenticated access — user remains null
    }

    return true;
  }
}
