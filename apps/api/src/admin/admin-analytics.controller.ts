import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAnalyticsController {
  constructor(private service: AdminAnalyticsService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('user-growth')
  getUserGrowth() {
    return this.service.getUserGrowth();
  }

  @Get('test-activity')
  getTestActivity() {
    return this.service.getTestActivity();
  }

  @Get('score-distribution')
  getScoreDistribution() {
    return this.service.getScoreDistribution();
  }

  @Get('recent-activity')
  getRecentActivity() {
    return this.service.getRecentActivity();
  }
}
