import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CognitoJwtAuthGuard extends AuthGuard('cognito-jwt') {}

@Injectable()
export class OptionalCognitoJwtAuthGuard extends AuthGuard('cognito-jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    return user || null;
  }
}
