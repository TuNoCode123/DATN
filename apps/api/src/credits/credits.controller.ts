import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreditsService } from './credits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private credits: CreditsService) {}

  @Get()
  async getBalance(@CurrentUser('id') userId: string) {
    const balance = await this.credits.getBalance(userId);
    return { balance };
  }

  @Post('check')
  async checkCredits(
    @CurrentUser('id') userId: string,
    @Body('required') required: number,
  ) {
    const balance = await this.credits.getBalance(userId);
    return {
      sufficient: balance >= required,
      balance,
      required,
    };
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.credits.getTransactions(
      userId,
      limit ? parseInt(limit) : 20,
      offset ? parseInt(offset) : 0,
    );
  }

  @Post('daily-bonus')
  async claimDailyBonus(@CurrentUser('id') userId: string) {
    const granted = await this.credits.grantDailyBonus(userId);
    const balance = await this.credits.getBalance(userId);
    return { granted, balance };
  }

  @Post('admin/grant')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async adminGrant(
    @Body('userId') userId: string,
    @Body('amount') amount: number,
  ) {
    const newBalance = await this.credits.grant(
      userId,
      amount,
      'ADMIN_TOPUP' as any,
    );
    return { newBalance };
  }
}
