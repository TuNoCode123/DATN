import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AlbJwtService } from './alb-jwt.service';
import { DEV_ACCOUNTS, DEV_COOKIE_NAME } from './dev-accounts';

@Controller('auth')
export class AuthController {
  private readonly frontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(private readonly albJwtService: AlbJwtService) {}

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

  // ─── Dev-only auth bypass ────────────────────────────────────────────────
  // Active only when ALB_ARN is unset (local dev). In production these
  // endpoints return 403.

  @Get('dev/accounts')
  listDevAccounts() {
    this.assertDev();
    return DEV_ACCOUNTS.map(({ email, role, label }) => ({ email, role, label }));
  }

  @Post('dev/login')
  @HttpCode(200)
  devLogin(@Body() body: { email: string }, @Res() res: Response) {
    this.assertDev();
    const account = DEV_ACCOUNTS.find((a) => a.email === body?.email);
    if (!account) {
      throw new ForbiddenException('Unknown dev account');
    }
    res.cookie(DEV_COOKIE_NAME, account.email, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // No `secure` flag — local dev runs on plain http
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ email: account.email, role: account.role });
  }

  @Post('dev/logout')
  @HttpCode(200)
  devLogout(@Res() res: Response) {
    this.assertDev();
    res.clearCookie(DEV_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  }

  private assertDev() {
    if (!this.albJwtService.isDev) {
      throw new ForbiddenException('Dev auth disabled');
    }
  }
}
