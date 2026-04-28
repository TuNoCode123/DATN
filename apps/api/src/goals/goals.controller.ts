import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpsertGoalDto } from './dto/upsert-goal.dto';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Get('me')
  getMine(@CurrentUser('id') userId: string) {
    return this.goalsService.getMine(userId);
  }

  @Put('me')
  upsertMine(@CurrentUser('id') userId: string, @Body() dto: UpsertGoalDto) {
    return this.goalsService.upsertMine(userId, dto);
  }

  @Delete('me')
  deleteMine(@CurrentUser('id') userId: string) {
    return this.goalsService.deleteMine(userId);
  }

  @Get('me/history')
  getHistory(@CurrentUser('id') userId: string) {
    return this.goalsService.getHistory(userId);
  }
}
