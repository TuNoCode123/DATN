import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    // Only check state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const csrfCookie = req.cookies?.['csrf_token'];
    const csrfHeader = req.headers['x-csrf-token'];

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}
