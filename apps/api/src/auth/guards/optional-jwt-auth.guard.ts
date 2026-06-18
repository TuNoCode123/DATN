import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';
import { attachDevBypassUser } from '../dev-bypass.util';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('cognito-jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await attachDevBypassUser(context, this.prisma)) return true;
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any) {
    // Don't throw on missing/invalid token — just return null
    return user || null;
  }
}
