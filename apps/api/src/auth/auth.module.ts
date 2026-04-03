import { Module } from '@nestjs/common';
import { CognitoJwtStrategy } from './cognito-jwt.strategy';
import { CognitoAuthService } from './cognito-auth.service';
import { CognitoAuthController } from './cognito-auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [CognitoAuthController],
  providers: [CognitoAuthService, CognitoJwtStrategy],
  exports: [CognitoAuthService],
})
export class AuthModule {}
