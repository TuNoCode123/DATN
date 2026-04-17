import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly frontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:3000';

  /**
   * Get current user from ALB JWT.
   * Used by frontend session-restore to detect authentication state.
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

  /**
   * ALB-protected login endpoint.
   *
   * The ALB authenticate-cognito action intercepts this request and redirects
   * unauthenticated users to Cognito Hosted UI. After authentication, ALB
   * sets session cookies and forwards the request here. We then redirect
   * the user back to the frontend.
   */
  @Get('cognito/login')
  @UseGuards(JwtAuthGuard)
  login(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ) {
    const target = redirect?.startsWith('/') ? redirect : '/dashboard';
    res.redirect(`${this.frontendUrl}${target}`);
  }
}
