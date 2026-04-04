import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CognitoAuthService } from './cognito-auth.service';
import { CognitoSessionDto } from './dto/cognito-session.dto';
import { CognitoJwtAuthGuard } from './cognito-jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { setAuthCookies, clearAuthCookies } from './cookie.utils';
import * as jwt from 'jsonwebtoken';

@Controller('auth/cognito')
export class CognitoAuthController {
  constructor(private cognitoAuthService: CognitoAuthService) {}

  /**
   * Exchange Cognito authorization code for tokens, set httpOnly cookies.
   * Called by frontend after redirect from Cognito Hosted UI.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  async createSession(
    @Body() dto: CognitoSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.cognitoAuthService.exchangeCodeForTokens(
      dto.code,
      dto.codeVerifier,
      dto.redirectUri,
    );

    const user = await this.cognitoAuthService.verifyAndResolveUser(
      tokens.access_token,
      tokens.id_token,
    );

    // Role derived from Cognito groups in the access token
    const accessPayload = jwt.decode(tokens.access_token) as { 'cognito:groups'?: string[] } | null;
    const role = accessPayload?.['cognito:groups']?.includes('Admin') ? 'ADMIN' : 'STUDENT';

    setAuthCookies(res, tokens.access_token, tokens.refresh_token, tokens.id_token);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role,
      linkedExisting: !!(user as any).linkedExisting,
    };
  }

  /**
   * Refresh tokens using the refresh_token httpOnly cookie.
   * Sets new access_token and csrf_token cookies.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    let tokens: { access_token: string; id_token: string; expires_in: number };
    try {
      tokens = await this.cognitoAuthService.refreshTokens(refreshToken);
    } catch {
      clearAuthCookies(res);
      throw new UnauthorizedException('Token refresh failed');
    }

    const user = await this.cognitoAuthService.findExistingUser(
      tokens.access_token,
      tokens.id_token,
    );
    if (!user) {
      clearAuthCookies(res);
      throw new UnauthorizedException('User no longer exists');
    }

    // Role derived from Cognito groups in the access token
    const accessPayload = jwt.decode(tokens.access_token) as { 'cognito:groups'?: string[] } | null;
    const role = accessPayload?.['cognito:groups']?.includes('Admin') ? 'ADMIN' : 'STUDENT';

    // Cognito refresh doesn't return a new refresh_token — reuse existing
    setAuthCookies(res, tokens.access_token, refreshToken, tokens.id_token);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role,
    };
  }

  /**
   * Clear all auth cookies (logout).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { message: 'Logged out' };
  }

  /**
   * Get current user from the access_token cookie.
   */
  @Get('me')
  @UseGuards(CognitoJwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
