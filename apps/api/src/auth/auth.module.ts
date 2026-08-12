import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { FirebaseAuthService } from './firebase-auth.service';
import { FirebaseUserService } from './firebase-user.service';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [UsersModule, ConfigModule],
  controllers: [AuthController],
  providers: [FirebaseAuthService, FirebaseUserService],
  exports: [FirebaseAuthService, FirebaseUserService],
})
export class AuthModule {}
