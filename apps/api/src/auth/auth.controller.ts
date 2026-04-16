import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  /**
   * Get current user from ALB JWT.
   * Used by frontend session-restore to detect authentication state.
   *
   * Kept at /auth/cognito/me for backward compatibility with existing frontend.
   */
  @Get('cognito/me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
