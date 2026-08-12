import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { FirebaseAuthService } from './firebase-auth.service';
import { DEV_ACCOUNTS, DEV_COOKIE_NAME } from './dev-accounts';

@Controller('auth')
export class AuthController {
  constructor(private readonly firebaseAuthService: FirebaseAuthService) {}

  /**
   * The frontend (Firebase Auth SDK, client-side) signs the user in directly
   * against Identity Platform and sends the resulting ID token as a Bearer
   * header on every request — there's no backend-redirect login endpoint to
   * serve here the way ALB's Cognito-intercepted flow needed. This endpoint
   * just resolves "who does this token belong to."
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  // ─── Dev-only auth bypass ────────────────────────────────────────────────
  // Active only when GCP_PROJECT_ID is unset (local dev). In production these
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
    if (!this.firebaseAuthService.isDev) {
      throw new ForbiddenException('Dev auth disabled');
    }
  }
}
