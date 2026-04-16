import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AlbJwtService } from '../alb-jwt.service';
import { AlbUserService } from '../alb-user.service';

/**
 * Optional ALB JWT auth guard.
 *
 * Same as JwtAuthGuard but allows unauthenticated access —
 * request.user will be null if no valid token is present.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  constructor(
    private readonly albJwtService: AlbJwtService,
    private readonly albUserService: AlbUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const albToken = request.headers['x-amzn-oidc-data'];

    try {
      const claims = await this.albJwtService.verify(albToken);
      if (claims) {
        const user = await this.albUserService.resolveUser(claims);
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
