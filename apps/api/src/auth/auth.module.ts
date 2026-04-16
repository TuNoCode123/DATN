import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AlbJwtService } from './alb-jwt.service';
import { AlbUserService } from './alb-user.service';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [UsersModule, ConfigModule],
  controllers: [AuthController],
  providers: [AlbJwtService, AlbUserService],
  exports: [AlbJwtService, AlbUserService],
})
export class AuthModule {}
