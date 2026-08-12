import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FirebaseAuthService } from '../firebase-auth.service';
import { FirebaseUserService } from '../firebase-user.service';
import { DEV_COOKIE_NAME } from '../dev-accounts';
import { extractBearerToken } from '../extract-bearer-token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly firebaseUserService: FirebaseUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const idToken = extractBearerToken(request.headers['authorization']);
    const devEmail = request.cookies?.[DEV_COOKIE_NAME];

    try {
      const claims = await this.firebaseAuthService.verify(idToken, devEmail);
      if (!claims) {
        throw new UnauthorizedException('Authentication required');
      }

      const user = await this.firebaseUserService.resolveUser(claims);
      request.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: claims.role,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`Identity Platform token verification failed: ${error.message}`);
      throw new UnauthorizedException('Authentication required');
    }
  }
}
