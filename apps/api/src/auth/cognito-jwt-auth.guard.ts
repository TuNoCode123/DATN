import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { attachDevBypassUser } from './dev-bypass.util';

@Injectable()
export class CognitoJwtAuthGuard extends AuthGuard('cognito-jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await attachDevBypassUser(context, this.prisma)) return true;
    return super.canActivate(context) as Promise<boolean>;
  }
}

@Injectable()
export class OptionalCognitoJwtAuthGuard extends AuthGuard('cognito-jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await attachDevBypassUser(context, this.prisma)) return true;
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any) {
    return user || null;
  }
}
