import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AlbJwtService } from '../alb-jwt.service';
import { AlbUserService } from '../alb-user.service';
import { DEV_COOKIE_NAME } from '../dev-accounts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly albJwtService: AlbJwtService,
    private readonly albUserService: AlbUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const albToken = request.headers['x-amzn-oidc-data'];
    const devEmail = request.cookies?.[DEV_COOKIE_NAME];

    try {
      const claims = await this.albJwtService.verify(albToken, devEmail);
      if (!claims) {
        throw new UnauthorizedException('Authentication required');
      }

      const user = await this.albUserService.resolveUser(claims);
      request.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: claims.role,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`ALB JWT verification failed: ${error.message}`);
      throw new UnauthorizedException('Authentication required');
    }
  }
}
